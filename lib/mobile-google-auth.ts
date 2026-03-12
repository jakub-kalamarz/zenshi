type MobileGoogleAuthEnv = CloudflareEnv & {
  AUTH_URL?: string
  AUTH_GOOGLE_ID?: string
  AUTH_GOOGLE_SECRET?: string
}

export type MobileGoogleTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
  id_token?: string
}

export type MobileGoogleUserInfo = {
  sub: string
  email?: string
  name?: string
  picture?: string
}

function base64UrlEncode(input: Uint8Array) {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return base64UrlEncode(buffer)
}

export async function sha256(input: string) {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return base64UrlEncode(new Uint8Array(digest))
}

export function resolveMobileAuthEnv(env: MobileGoogleAuthEnv) {
  return {
    AUTH_URL: env.AUTH_URL ?? process.env.AUTH_URL,
    AUTH_GOOGLE_ID: env.AUTH_GOOGLE_ID ?? process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: env.AUTH_GOOGLE_SECRET ?? process.env.AUTH_GOOGLE_SECRET,
  }
}

export function ensureMobileGoogleEnv(env: MobileGoogleAuthEnv) {
  const resolved = resolveMobileAuthEnv(env)
  if (!resolved.AUTH_GOOGLE_ID || !resolved.AUTH_GOOGLE_SECRET) {
    throw new Error("Missing AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET")
  }
  return resolved
}

export function resolveMobileBaseOrigin(request: Request, env: MobileGoogleAuthEnv) {
  return new URL(request.url).origin || env.AUTH_URL || "http://localhost:3000"
}

export async function exchangeGoogleCode(
  env: MobileGoogleAuthEnv,
  code: string,
  verifier: string,
  redirectUri: string,
) {
  const resolved = resolveMobileAuthEnv(env)
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: resolved.AUTH_GOOGLE_ID ?? "",
      client_secret: resolved.AUTH_GOOGLE_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  const tokenData = (await tokenRes.json()) as MobileGoogleTokenResponse
  if (!tokenData.access_token || !tokenData.expires_in) {
    throw new Error("Invalid token response")
  }

  return tokenData
}

export async function fetchGoogleUser(accessToken: string) {
  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!userRes.ok) {
    const text = await userRes.text()
    throw new Error(`Userinfo failed: ${text}`)
  }
  return (await userRes.json()) as MobileGoogleUserInfo
}

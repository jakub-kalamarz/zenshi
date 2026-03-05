import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { GoogleAccountConflictError, signInWithGoogle, upsertGoogleAccountForUser } from "@/lib/auth"
import { consumeOauthState, createLoginCode } from "@/lib/mobile-auth"
import { mobileError, mobileJson, handleMobileOptions, withMobileCors } from "@/lib/mobile-http"

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
  id_token?: string
}

type UserInfoResponse = {
  sub: string
  email?: string
  name?: string
  picture?: string
}

function resolveAuthEnv(env: CloudflareEnv) {
  return {
    AUTH_URL: env.AUTH_URL ?? process.env.AUTH_URL,
    AUTH_GOOGLE_ID: env.AUTH_GOOGLE_ID ?? process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: env.AUTH_GOOGLE_SECRET ?? process.env.AUTH_GOOGLE_SECRET,
  }
}

function ensureEnv(env: CloudflareEnv) {
  const resolved = resolveAuthEnv(env)
  if (!resolved.AUTH_GOOGLE_ID || !resolved.AUTH_GOOGLE_SECRET) {
    throw new Error("Missing AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET")
  }
}

function wantsJson(request: Request) {
  const accept = request.headers.get("accept") || ""
  const url = new URL(request.url)
  return accept.includes("application/json") || url.searchParams.get("format") === "json"
}

function toHtmlResponse(html: string, request: Request, env: CloudflareEnv) {
  const response = new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
  return withMobileCors(response, request, env)
}

function userViewFromGoogleOrDb(
  fallbackUser: UserInfoResponse,
  dbUser:
    | {
        id: string
        email: string | null
        name: string | null
        image: string | null
      }
    | null,
) {
  return {
    id: dbUser?.id ?? "",
    email: dbUser?.email ?? fallbackUser.email ?? null,
    name: dbUser?.name ?? fallbackUser.name ?? null,
    image: dbUser?.image ?? fallbackUser.picture ?? null,
  }
}

async function exchangeGoogleCode(
  env: CloudflareEnv,
  code: string,
  verifier: string,
  redirectUri: string,
) {
  const resolved = resolveAuthEnv(env)
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

  const tokenData = (await tokenRes.json()) as TokenResponse
  if (!tokenData.access_token || !tokenData.expires_in) {
    throw new Error("Invalid token response")
  }

  return tokenData
}

async function fetchGoogleUser(accessToken: string) {
  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!userRes.ok) {
    const text = await userRes.text()
    throw new Error(`Userinfo failed: ${text}`)
  }
  return (await userRes.json()) as UserInfoResponse
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)
  ensureEnv(env)

  const url = new URL(request.url)
  const error = url.searchParams.get("error")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (error) {
    return mobileError("OAUTH_ERROR", error, request, env, 400)
  }
  if (!code || !state) {
    return mobileError("OAUTH_ERROR", "Missing code or state", request, env, 400)
  }

  const stateData = await consumeOauthState(env, state)
  if (!stateData) {
    return mobileError("OAUTH_ERROR", "Invalid or expired state", request, env, 400)
  }

  const requestOrigin = new URL(request.url).origin
  const baseOrigin = requestOrigin || env.AUTH_URL || "http://localhost:3000"
  const redirectUri = new URL("/api/mobile/v1/auth/callback", baseOrigin).toString()

  let tokenData: TokenResponse
  try {
    tokenData = await exchangeGoogleCode(env, code, stateData.verifier, redirectUri)
  } catch (error_) {
    const message = error_ instanceof Error ? error_.message : "Token exchange failed"
    return mobileError("OAUTH_ERROR", message, request, env, 400)
  }

  let userInfo: UserInfoResponse
  try {
    userInfo = await fetchGoogleUser(tokenData.access_token)
  } catch (error_) {
    const message = error_ instanceof Error ? error_.message : "Userinfo failed"
    return mobileError("OAUTH_ERROR", message, request, env, 400)
  }

  if (stateData.purpose === "link") {
    if (!stateData.userId) {
      return mobileError("OAUTH_ERROR", "Missing linked user", request, env, 400)
    }

    try {
      await upsertGoogleAccountForUser(env, stateData.userId, userInfo, tokenData)
    } catch (error_) {
      if (error_ instanceof GoogleAccountConflictError) {
        return mobileError("CONFLICT", error_.message, request, env, error_.status)
      }
      return mobileError("OAUTH_ERROR", "Failed to link Google account", request, env, 500)
    }

    const linkedDbUser = await env.DB.prepare(
      `SELECT id, email, name, image FROM auth_users WHERE id = ?`,
    )
      .bind(stateData.userId)
      .first<{ id: string; email: string | null; name: string | null; image: string | null }>()

    const user = userViewFromGoogleOrDb(userInfo, linkedDbUser)

    if (wantsJson(request)) {
      return mobileJson({ linked: true, user }, request, env)
    }

    const scheme = (env as CloudflareEnv & { MOBILE_APP_SCHEME?: string }).MOBILE_APP_SCHEME || "zenshi"
    const deepLink = `${scheme}://auth?linked=1`
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google link complete</title>
  </head>
  <body>
    <p>Google account linked. You can return to the app.</p>
    <p><a href="${deepLink}">Open the app</a></p>
  </body>
</html>`

    return toHtmlResponse(html, request, env)
  }

  const signedInUser = await signInWithGoogle(env, userInfo, tokenData)
  const userId = signedInUser.id
  const loginCode = await createLoginCode(env, userId)

  const user = {
    id: userId,
    email: userInfo.email ?? null,
    name: userInfo.name ?? null,
    image: userInfo.picture ?? null,
  }

  if (wantsJson(request)) {
    return mobileJson({ code: loginCode, user }, request, env)
  }

  const scheme = (env as CloudflareEnv & { MOBILE_APP_SCHEME?: string }).MOBILE_APP_SCHEME || "zenshi"
  const deepLink = `${scheme}://auth?code=${encodeURIComponent(loginCode)}`
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in complete</title>
  </head>
  <body>
    <p>Sign in complete. You can return to the app.</p>
    <p><a href="${deepLink}">Open the app</a></p>
  </body>
</html>`

  return toHtmlResponse(html, request, env)
}

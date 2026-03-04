import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { consumeOauthState, createLoginCode } from "@/lib/mobile-auth"
import { mobileError, handleMobileOptions, withMobileCors } from "@/lib/mobile-http"

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

async function upsertUserFromGoogle(
  env: CloudflareEnv,
  userInfo: UserInfoResponse,
  tokenData: TokenResponse,
) {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + tokenData.expires_in

  const account = await env.DB.prepare(
    `SELECT id, user_id
     FROM auth_accounts
     WHERE provider = 'google' AND provider_account_id = ?`,
  )
    .bind(userInfo.sub)
    .first<{ id: string; user_id: string }>()

  let userId: string
  if (account) {
    userId = account.user_id
  } else {
    const existingUser = userInfo.email
      ? await env.DB.prepare(
        `SELECT id FROM auth_users WHERE email = ?`,
      )
        .bind(userInfo.email)
        .first<{ id: string }>()
      : null
    userId = existingUser?.id ?? crypto.randomUUID()
    if (!existingUser) {
      await env.DB.prepare(
        `INSERT INTO auth_users (id, email, name, image)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(userId, userInfo.email ?? null, userInfo.name ?? null, userInfo.picture ?? null)
        .run()
    }

    await env.DB.prepare(
      `INSERT INTO auth_accounts (
         id, user_id, provider, provider_account_id,
         access_token, refresh_token, token_type, scope, expires_at,
         created_at, updated_at
       ) VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        userInfo.sub,
        tokenData.access_token,
        tokenData.refresh_token ?? null,
        tokenData.token_type ?? null,
        tokenData.scope ?? null,
        expiresAt,
      )
      .run()
  }

  if (account) {
    await env.DB.prepare(
      `UPDATE auth_accounts
       SET access_token = ?, refresh_token = COALESCE(?, refresh_token),
           token_type = ?, scope = ?, expires_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(
        tokenData.access_token,
        tokenData.refresh_token ?? null,
        tokenData.token_type ?? null,
        tokenData.scope ?? null,
        expiresAt,
        account.id,
      )
      .run()
  }

  return userId
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

  const verifier = await consumeOauthState(env, state)
  if (!verifier) {
    return mobileError("OAUTH_ERROR", "Invalid or expired state", request, env, 400)
  }

  const requestOrigin = new URL(request.url).origin
  const baseOrigin = requestOrigin || env.AUTH_URL || "http://localhost:3000"
  const redirectUri = new URL("/api/mobile/v1/auth/callback", baseOrigin).toString()
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
    return mobileError("OAUTH_ERROR", `Token exchange failed: ${text}`, request, env, 400)
  }

  const tokenData = (await tokenRes.json()) as TokenResponse
  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!userRes.ok) {
    const text = await userRes.text()
    return mobileError("OAUTH_ERROR", `Userinfo failed: ${text}`, request, env, 400)
  }

  const userInfo = (await userRes.json()) as UserInfoResponse
  const userId = await upsertUserFromGoogle(env, userInfo, tokenData)
  const loginCode = await createLoginCode(env, userId)

  const user = {
    id: userId,
    email: userInfo.email ?? null,
    name: userInfo.name ?? null,
    image: userInfo.picture ?? null,
  }

  if (wantsJson(request)) {
    const response = Response.json({ ok: true, data: { code: loginCode, user } })
    return withMobileCors(response, request, env)
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

  const response = new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
  return withMobileCors(response, request, env)
}

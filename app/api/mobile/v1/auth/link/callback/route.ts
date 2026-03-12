import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { createGoogleRelinkIntent, GoogleAccountConflictError, upsertGoogleAccountForUser } from "@/lib/auth"
import { normalizeLocale } from "@/lib/locale"
import { consumeOauthState } from "@/lib/mobile-auth"
import {
  ensureMobileGoogleEnv,
  exchangeGoogleCode,
  fetchGoogleUser,
  resolveMobileBaseOrigin,
  type MobileGoogleTokenResponse,
  type MobileGoogleUserInfo,
} from "@/lib/mobile-google-auth"
import { buildMobileGoogleConflictPagePath, buildMobileGoogleSuccessPagePath } from "@/lib/mobile-oauth-ui"
import { mobileError, handleMobileOptions, mobileJson } from "@/lib/mobile-http"

function wantsJson(request: Request) {
  const accept = request.headers.get("accept") || ""
  const url = new URL(request.url)
  return accept.includes("application/json") || url.searchParams.get("format") === "json"
}

function parseCookies(header: string | null) {
  const output: Record<string, string> = {}
  if (!header) return output
  const parts = header.split(";")
  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=")
    if (!name) continue
    output[name] = decodeURIComponent(rest.join("=") || "")
  }
  return output
}

function resolveLocale(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"))
  return normalizeLocale(cookies.NEXT_LOCALE)
}

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)
  ensureMobileGoogleEnv(env)

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
  if (!stateData || stateData.purpose !== "link") {
    return mobileError("OAUTH_ERROR", "Invalid or expired state", request, env, 400)
  }
  if (!stateData.userId) {
    return mobileError("OAUTH_ERROR", "Missing linked user", request, env, 400)
  }

  const baseOrigin = resolveMobileBaseOrigin(request, env)
  const redirectUri = new URL("/api/mobile/v1/auth/link/callback", baseOrigin).toString()

  let tokenData: MobileGoogleTokenResponse
  try {
    tokenData = await exchangeGoogleCode(env, code, stateData.verifier, redirectUri)
  } catch (exchangeError) {
    const message = exchangeError instanceof Error ? exchangeError.message : "Token exchange failed"
    return mobileError("OAUTH_ERROR", message, request, env, 400)
  }

  let userInfo: MobileGoogleUserInfo
  try {
    userInfo = await fetchGoogleUser(tokenData.access_token)
  } catch (userError) {
    const message = userError instanceof Error ? userError.message : "Userinfo failed"
    return mobileError("OAUTH_ERROR", message, request, env, 400)
  }

  try {
    await upsertGoogleAccountForUser(env, stateData.userId, userInfo, tokenData)
  } catch (linkError) {
    if (linkError instanceof GoogleAccountConflictError) {
      const relink = await createGoogleRelinkIntent(env, stateData.userId, userInfo, tokenData)
      if (!wantsJson(request)) {
        const scheme = (env as CloudflareEnv & { MOBILE_APP_SCHEME?: string }).MOBILE_APP_SCHEME || "zenshi"
        const location = buildMobileGoogleConflictPagePath({
          locale: resolveLocale(request),
          relinkToken: relink.relinkToken,
          scheme,
        })
        return new Response(null, { status: 302, headers: { Location: location } })
      }
      return mobileError("CONFLICT", relink.message, request, env, linkError.status, {
        canRelink: relink.canRelink,
        provider: relink.provider,
        relinkToken: relink.relinkToken,
      })
    }
    return mobileError("OAUTH_ERROR", "Failed to link Google account", request, env, 500)
  }

  const linkedDbUser = await env.DB.prepare(
    `SELECT id, email, name, image FROM auth_users WHERE id = ?`,
  )
    .bind(stateData.userId)
    .first<{ id: string; email: string | null; name: string | null; image: string | null }>()

  const user = {
    id: linkedDbUser?.id ?? stateData.userId,
    email: linkedDbUser?.email ?? userInfo.email ?? null,
    name: linkedDbUser?.name ?? userInfo.name ?? null,
    image: linkedDbUser?.image ?? userInfo.picture ?? null,
  }

  if (wantsJson(request)) {
    return mobileJson(
      {
        linked: true,
        user,
      },
      request,
      env,
    )
  }

  const scheme = (env as CloudflareEnv & { MOBILE_APP_SCHEME?: string }).MOBILE_APP_SCHEME || "zenshi"
  return new Response(null, {
    status: 302,
    headers: {
      Location: buildMobileGoogleSuccessPagePath({
        locale: resolveLocale(request),
        scheme,
      }),
    },
  })
}

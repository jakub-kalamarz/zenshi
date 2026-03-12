import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureAuthSchema } from "@/lib/auth-schema"
import {
  createGoogleRelinkIntent,
  GoogleAccountConflictError,
  signInWithGoogle,
  upsertGoogleAccountForUser,
} from "@/lib/auth"
import { normalizeLocale } from "@/lib/locale"
import { consumeOauthState, createLoginCode } from "@/lib/mobile-auth"
import {
  ensureMobileGoogleEnv,
  exchangeGoogleCode,
  fetchGoogleUser,
  resolveMobileBaseOrigin,
  type MobileGoogleTokenResponse,
  type MobileGoogleUserInfo,
} from "@/lib/mobile-google-auth"
import { buildMobileGoogleConflictPagePath, buildMobileGoogleSuccessPagePath } from "@/lib/mobile-oauth-ui"
import { mobileError, mobileJson, handleMobileOptions, withMobileCors } from "@/lib/mobile-http"

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

function toHtmlResponse(html: string, request: Request, env: CloudflareEnv) {
  const response = new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
  return withMobileCors(response, request, env)
}

function userViewFromGoogleOrDb(
  fallbackUser: MobileGoogleUserInfo,
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
  if (!stateData) {
    return mobileError("OAUTH_ERROR", "Invalid or expired state", request, env, 400)
  }

  const baseOrigin = resolveMobileBaseOrigin(request, env)
  const redirectUri = new URL("/api/mobile/v1/auth/callback", baseOrigin).toString()

  let tokenData: MobileGoogleTokenResponse
  try {
    tokenData = await exchangeGoogleCode(env, code, stateData.verifier, redirectUri)
  } catch (error_) {
    const message = error_ instanceof Error ? error_.message : "Token exchange failed"
    return mobileError("OAUTH_ERROR", message, request, env, 400)
  }

  let userInfo: MobileGoogleUserInfo
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
        const relink = await createGoogleRelinkIntent(env, stateData.userId, userInfo, tokenData)
        if (!wantsJson(request)) {
          const scheme = (env as CloudflareEnv & { MOBILE_APP_SCHEME?: string }).MOBILE_APP_SCHEME || "zenshi"
          return new Response(null, {
            status: 302,
            headers: {
              Location: buildMobileGoogleConflictPagePath({
                locale: resolveLocale(request),
                relinkToken: relink.relinkToken,
                scheme,
              }),
            },
          })
        }
        return mobileError("CONFLICT", relink.message, request, env, error_.status, {
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

    const user = userViewFromGoogleOrDb(userInfo, linkedDbUser)

    if (wantsJson(request)) {
      return mobileJson({ linked: true, user }, request, env)
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
  return new Response(null, {
    status: 302,
    headers: {
      Location: deepLink,
    },
  })
}

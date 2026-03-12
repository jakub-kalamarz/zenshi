import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createOauthState } from "@/lib/mobile-auth"
import { mobileJson, handleMobileOptions } from "@/lib/mobile-http"
import { ensureAuthSchema } from "@/lib/auth-schema"
import {
  ensureMobileGoogleEnv,
  randomToken,
  resolveMobileAuthEnv,
  resolveMobileBaseOrigin,
  sha256,
} from "@/lib/mobile-google-auth"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)
  ensureMobileGoogleEnv(env)

  const baseOrigin = resolveMobileBaseOrigin(request, env)

  const verifier = randomToken(32)
  const challenge = await sha256(verifier)
  const state = await createOauthState(env, verifier, 15)

  const redirectUri = new URL("/api/mobile/v1/auth/callback", baseOrigin).toString()
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id", resolveMobileAuthEnv(env).AUTH_GOOGLE_ID ?? "")
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/webmasters",
  ].join(" "))
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("code_challenge", challenge)
  authUrl.searchParams.set("code_challenge_method", "S256")

  return mobileJson({ authUrl: authUrl.toString() }, request, env)
}

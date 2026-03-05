import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { createOauthState, requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, handleMobileOptions, mobileJson } from "@/lib/mobile-http"

function base64UrlEncode(input: Uint8Array) {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return base64UrlEncode(buffer)
}

async function sha256(input: string) {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return base64UrlEncode(new Uint8Array(digest))
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

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)
  ensureEnv(env)

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const requestOrigin = new URL(request.url).origin
  const baseOrigin = requestOrigin || env.AUTH_URL || "http://localhost:3000"

  const verifier = randomToken(32)
  const challenge = await sha256(verifier)
  const state = await createOauthState(env, verifier, 15, {
    purpose: "link",
    userId: session.user.id,
  })

  const redirectUri = new URL("/api/mobile/v1/auth/link/callback", baseOrigin).toString()
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id", resolveAuthEnv(env).AUTH_GOOGLE_ID ?? "")
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

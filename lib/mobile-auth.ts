import { ensureAuthSchema } from "@/lib/auth-schema"

type MobileEnv = CloudflareEnv & {
  MOBILE_TOKEN_TTL_DAYS?: string
  MOBILE_LOGIN_CODE_TTL_MINUTES?: string
}

export type MobileAuthUser = {
  id: string
  email: string | null
  name: string | null
  image: string | null
}

export type MobileSession = {
  user: MobileAuthUser
  tokenId: string
  expiresAt: string | null
}

const DEFAULT_TOKEN_TTL_DAYS = 90
const DEFAULT_LOGIN_CODE_TTL_MINUTES = 10

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

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function readIntEnv(env: MobileEnv, key: keyof MobileEnv, fallback: number) {
  const raw = env[key]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBearerToken(request: Request) {
  const header = request.headers.get("authorization") || ""
  const [scheme, value] = header.split(" ")
  if (scheme?.toLowerCase() !== "bearer") return null
  return value?.trim() || null
}

export async function issueApiToken(
  env: MobileEnv,
  userId: string,
  label?: string | null,
) {
  await ensureAuthSchema(env)
  const token = randomToken(32)
  const tokenHash = await sha256(token)
  const ttlDays = readIntEnv(env, "MOBILE_TOKEN_TTL_DAYS", DEFAULT_TOKEN_TTL_DAYS)
  const expiresAt = nowSeconds() + ttlDays * 86_400
  const tokenId = crypto.randomUUID()

  await env.DB.prepare(
    `INSERT INTO api_tokens (id, user_id, token_hash, label, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(tokenId, userId, tokenHash, label ?? null, expiresAt)
    .run()

  return {
    token,
    tokenId,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

export async function verifyApiToken(env: MobileEnv, token: string | null) {
  if (!token) return null
  await ensureAuthSchema(env)
  const tokenHash = await sha256(token)
  const row = await env.DB.prepare(
    `SELECT t.id as token_id, t.expires_at, t.revoked_at, t.user_id,
            u.email, u.name, u.image
     FROM api_tokens t
     JOIN auth_users u ON u.id = t.user_id
     WHERE t.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{
      token_id: string
      expires_at: number | null
      revoked_at: string | null
      user_id: string
      email: string | null
      name: string | null
      image: string | null
    }>()

  if (!row) return null
  if (row.revoked_at) return null
  if (row.expires_at && row.expires_at < nowSeconds()) return null

  await env.DB.prepare(
    `UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?`,
  )
    .bind(row.token_id)
    .run()

  return {
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      image: row.image,
    },
    tokenId: row.token_id,
    expiresAt: row.expires_at ? new Date(row.expires_at * 1000).toISOString() : null,
  } satisfies MobileSession
}

export async function requireMobileSession(env: MobileEnv, request: Request) {
  const token = parseBearerToken(request)
  return verifyApiToken(env, token)
}

export async function revokeApiToken(env: MobileEnv, token: string | null) {
  if (!token) return false
  await ensureAuthSchema(env)
  const tokenHash = await sha256(token)
  const result = await env.DB.prepare(
    `UPDATE api_tokens
     SET revoked_at = datetime('now')
     WHERE token_hash = ? AND revoked_at IS NULL`,
  )
    .bind(tokenHash)
    .run()
  return (result.meta?.changes ?? 0) > 0
}

export async function createLoginCode(env: MobileEnv, userId: string) {
  await ensureAuthSchema(env)
  const code = randomToken(24)
  const codeHash = await sha256(code)
  const ttlMinutes = readIntEnv(
    env,
    "MOBILE_LOGIN_CODE_TTL_MINUTES",
    DEFAULT_LOGIN_CODE_TTL_MINUTES,
  )
  const expiresAt = nowSeconds() + ttlMinutes * 60

  await env.DB.prepare(
    `INSERT INTO mobile_login_codes (code_hash, user_id, expires_at)
     VALUES (?, ?, ?)`,
  )
    .bind(codeHash, userId, expiresAt)
    .run()

  return code
}

export async function exchangeLoginCode(env: MobileEnv, code: string) {
  await ensureAuthSchema(env)
  const codeHash = await sha256(code)
  const row = await env.DB.prepare(
    `SELECT user_id, expires_at, used_at
     FROM mobile_login_codes
     WHERE code_hash = ?`,
  )
    .bind(codeHash)
    .first<{ user_id: string; expires_at: number; used_at: string | null }>()

  if (!row) return null
  if (row.used_at) return null
  if (row.expires_at < nowSeconds()) return null

  await env.DB.prepare(
    `UPDATE mobile_login_codes
     SET used_at = datetime('now')
     WHERE code_hash = ?`,
  )
    .bind(codeHash)
    .run()

  return row.user_id
}

export async function createOauthState(env: MobileEnv, verifier: string, ttlMinutes = 15) {
  await ensureAuthSchema(env)
  const state = randomToken(16)
  const expiresAt = nowSeconds() + ttlMinutes * 60
  await env.DB.prepare(
    `INSERT INTO mobile_oauth_states (state, verifier, expires_at)
     VALUES (?, ?, ?)`,
  )
    .bind(state, verifier, expiresAt)
    .run()
  return state
}

export async function consumeOauthState(env: MobileEnv, state: string) {
  await ensureAuthSchema(env)
  const row = await env.DB.prepare(
    `SELECT verifier, expires_at
     FROM mobile_oauth_states
     WHERE state = ?`,
  )
    .bind(state)
    .first<{ verifier: string; expires_at: number }>()

  if (!row) return null
  if (row.expires_at < nowSeconds()) return null

  await env.DB.prepare(
    `DELETE FROM mobile_oauth_states WHERE state = ?`,
  )
    .bind(state)
    .run()

  return row.verifier
}

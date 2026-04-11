type AppleEnv = CloudflareEnv & {
  AUTH_APPLE_CLIENT_ID?: string
  AUTH_APPLE_TEAM_ID?: string
  AUTH_APPLE_KEY_ID?: string
  AUTH_APPLE_PRIVATE_KEY?: string
  AUTH_APPLE_PRIVATE_KEY_B64?: string
  AUTH_APPLE_PRIVATE_KEY_PATH?: string
}

type AppleJwtHeader = {
  alg?: string
  kid?: string
}

type AppleJwtPayload = {
  iss?: string
  aud?: string | string[]
  exp?: number
  sub?: string
  email?: string
  email_verified?: boolean | string
  is_private_email?: boolean | string
}

type AppleJwk = JsonWebKey & {
  kid?: string
  alg?: string
  use?: string
  kty?: string
}

type AppleTokenResponse = {
  access_token?: string
  expires_in?: number
  id_token?: string
  refresh_token?: string
  token_type?: string
}

export type AppleIdentity = {
  sub: string
  email: string | null
  emailVerified: boolean
  isPrivateEmail: boolean
}

const APPLE_ISSUER = "https://appleid.apple.com"
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"

let cachedAppleKeys:
  | {
      expiresAt: number
      keys: AppleJwk[]
    }
  | null = null

function base64UrlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const remainder = normalized.length % 4
  if (remainder === 0) return normalized
  return normalized.padEnd(normalized.length + (4 - remainder), "=")
}

function base64UrlDecodeBytes(value: string) {
  const raw = atob(base64UrlToBase64(value))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

function decodeJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(value))) as T
}

function normalizeAppleBoolean(value: boolean | string | undefined) {
  return value === true || value === "true"
}

function normalizePrivateKey(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed.replace(/\\n/g, "\n")
  }
  try {
    return new TextDecoder().decode(base64UrlDecodeBytes(trimmed))
  } catch {
    return trimmed
  }
}

function pemToDer(pem: string) {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "")
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
}

function readAppleConfig(env: AppleEnv) {
  return {
    clientId: env.AUTH_APPLE_CLIENT_ID ?? process.env.AUTH_APPLE_CLIENT_ID,
    teamId: env.AUTH_APPLE_TEAM_ID ?? process.env.AUTH_APPLE_TEAM_ID,
    keyId: env.AUTH_APPLE_KEY_ID ?? process.env.AUTH_APPLE_KEY_ID,
    privateKey: normalizePrivateKey(
      env.AUTH_APPLE_PRIVATE_KEY ?? process.env.AUTH_APPLE_PRIVATE_KEY,
    ),
    privateKeyB64: env.AUTH_APPLE_PRIVATE_KEY_B64 ?? process.env.AUTH_APPLE_PRIVATE_KEY_B64,
    privateKeyPath: env.AUTH_APPLE_PRIVATE_KEY_PATH ?? process.env.AUTH_APPLE_PRIVATE_KEY_PATH,
  }
}

async function readPrivateKeyFromPath(filePath: string | null | undefined) {
  if (!filePath) return null
  try {
    const { readFile } = await import("node:fs/promises")
    const contents = await readFile(filePath, "utf8")
    return normalizePrivateKey(contents)
  } catch {
    return null
  }
}

export function getAppleClientId(env: AppleEnv) {
  return readAppleConfig(env).clientId ?? null
}

export function ensureAppleClientId(env: AppleEnv) {
  const clientId = getAppleClientId(env)
  if (!clientId) {
    throw new Error("Missing AUTH_APPLE_CLIENT_ID")
  }
  return clientId
}

export async function resolveAppleWebConfig(env: AppleEnv) {
  const config = readAppleConfig(env)
  const privateKey =
    config.privateKey ??
    normalizePrivateKey(config.privateKeyB64) ??
    (await readPrivateKeyFromPath(config.privateKeyPath))
  if (!config.clientId || !config.teamId || !config.keyId || !privateKey) {
    throw new Error(
      "Missing AUTH_APPLE_CLIENT_ID/AUTH_APPLE_TEAM_ID/AUTH_APPLE_KEY_ID/AUTH_APPLE_PRIVATE_KEY",
    )
  }
  return {
    clientId: config.clientId,
    teamId: config.teamId,
    keyId: config.keyId,
    privateKey,
  }
}

async function buildAppleClientSecret(env: AppleEnv) {
  const config = await resolveAppleWebConfig(env)
  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: "ES256",
    kid: config.keyId,
    typ: "JWT",
  }
  const claims = {
    iss: config.teamId,
    iat: now,
    exp: now + 60 * 60 * 24 * 180,
    aud: APPLE_ISSUER,
    sub: config.clientId,
  }
  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
  const encodedClaims = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
  const payload = `${encodedHeader}.${encodedClaims}`
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(payload),
  )
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
  return `${payload}.${encodedSignature}`
}

async function fetchAppleKeys() {
  if (cachedAppleKeys && cachedAppleKeys.expiresAt > Date.now()) {
    return cachedAppleKeys.keys
  }

  const response = await fetch(APPLE_KEYS_URL, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error("Unable to fetch Apple public keys")
  }

  const payload = (await response.json()) as { keys?: AppleJwk[] }
  const cacheControl = response.headers.get("cache-control") ?? ""
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/)
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 60 * 60
  cachedAppleKeys = {
    expiresAt: Date.now() + maxAgeSeconds * 1000,
    keys: payload.keys ?? [],
  }
  return cachedAppleKeys.keys
}

async function verifyAppleJwt(identityToken: string) {
  const [encodedHeader, encodedPayload, encodedSignature] = identityToken.split(".")
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid Apple identity token")
  }

  const header = decodeJwtPart<AppleJwtHeader>(encodedHeader)
  const payload = decodeJwtPart<AppleJwtPayload>(encodedPayload)
  const keys = await fetchAppleKeys()
  const key = keys.find((candidate) => candidate.kid === header.kid)
  if (!key) {
    throw new Error("Apple signing key not found")
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  )
  const isValid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    base64UrlDecodeBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  )
  if (!isValid) {
    throw new Error("Apple identity token signature is invalid")
  }

  return payload
}

export async function verifyAppleIdentityToken(env: AppleEnv, identityToken: string) {
  const payload = await verifyAppleJwt(identityToken)
  const clientId = ensureAppleClientId(env)
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]

  if (payload.iss !== APPLE_ISSUER) {
    throw new Error("Apple identity token issuer is invalid")
  }
  if (!audiences.includes(clientId)) {
    throw new Error("Apple identity token audience is invalid")
  }
  if (!payload.sub) {
    throw new Error("Apple identity token subject is missing")
  }
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Apple identity token has expired")
  }

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    emailVerified: normalizeAppleBoolean(payload.email_verified),
    isPrivateEmail: normalizeAppleBoolean(payload.is_private_email),
  } satisfies AppleIdentity
}

export async function exchangeAppleCode(
  env: AppleEnv,
  code: string,
  redirectUri: string,
) {
  const config = await resolveAppleWebConfig(env)
  const clientSecret = await buildAppleClientSecret(env)
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  })

  const response = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Apple token exchange failed: ${text}`)
  }

  const payload = (await response.json()) as AppleTokenResponse
  if (!payload.id_token) {
    throw new Error("Apple token response did not include an identity token")
  }
  return payload
}

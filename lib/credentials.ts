const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const PBKDF2_ITERATIONS = 100_000
const HASH_BYTES = 32
const SALT_BYTES = 16

export type CredentialPayload = {
  email: string
  password: string
  name: string | null
}

type ValidateOptions = {
  requireName?: boolean
}

export type CredentialValidationResult =
  | { ok: true; data: CredentialPayload }
  | { ok: false; errors: string[] }

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function normalizeName(name: string | null | undefined) {
  const normalized = (name ?? "").trim()
  return normalized.length > 0 ? normalized : null
}

export function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email)
}

function bytesFromHex(hex: string) {
  if (hex.length % 2 !== 0) {
    return null
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    const pair = hex.slice(index, index + 2)
    const value = Number.parseInt(pair, 16)
    if (Number.isNaN(value)) {
      return null
    }
    bytes[index / 2] = value
  }
  return bytes
}

export function validateCredentials(raw: unknown, options: ValidateOptions = {}): CredentialValidationResult {
  const payload = raw as Record<string, unknown> | null
  const errors: string[] = []

  const email = normalizeEmail(typeof payload?.email === "string" ? payload.email : "")
  const password = typeof payload?.password === "string" ? payload.password : ""
  const name = normalizeName(typeof payload?.name === "string" ? payload.name : null)

  if (!email) {
    errors.push("Email is required")
  } else if (!isValidEmail(email)) {
    errors.push("Email is invalid")
  }

  if (!password) {
    errors.push("Password is required")
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`)
  }

  if (options.requireName && !name) {
    errors.push("Name is required")
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, data: { email, password, name } }
}

function toHex(bytes: Uint8Array) {
  let result = ""
  for (const byte of bytes) {
    const value = byte.toString(16).padStart(2, "0")
    result += value
  }
  return result
}

function normalizeHashHex(value: string | null) {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length % 2 !== 0) return null
  return /^[0-9a-f]+$/.test(trimmed) ? trimmed : null
}

function fromHex(hex: string | null): Uint8Array | null {
  if (!hex) return null
  return bytesFromHex(hex)
}

function constantTimeEquals(a: string, b: string) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return mismatch === 0
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    HASH_BYTES * 8,
  )

  return {
    password_hash: toHex(new Uint8Array(hash)),
    password_salt: toHex(salt),
  }
}

export async function verifyPassword(password: string, hashHex: string | null, saltHex: string | null) {
  if (!hashHex || !saltHex) return false

  const hash = normalizeHashHex(hashHex)
  const salt = fromHex(normalizeHashHex(saltHex) ?? "")
  if (!hash || !salt) return false

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const normalizedSalt = new Uint8Array(salt)
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: normalizedSalt,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    HASH_BYTES * 8,
  )

  return constantTimeEquals(toHex(new Uint8Array(derived)), hash)
}

export const credentialsConfig = {
  minPasswordLength: MIN_PASSWORD_LENGTH,
  pbkdf2Iterations: PBKDF2_ITERATIONS,
}

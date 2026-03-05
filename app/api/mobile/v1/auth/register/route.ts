import { getCloudflareContext } from "@opennextjs/cloudflare"
import { issueApiToken } from "@/lib/mobile-auth"
import { mobileError, mobileJson, handleMobileOptions } from "@/lib/mobile-http"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { hashPassword, validateCredentials } from "@/lib/credentials"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
    name?: string
    label?: string
  } | null

  const validation = validateCredentials(
    {
      email: body?.email ?? null,
      password: body?.password ?? null,
      name: body?.name ?? null,
    },
    { requireName: false },
  )
  if (!validation.ok) {
    return mobileError("VALIDATION_ERROR", validation.errors.join(", "), request, env, 400)
  }

  const email = validation.data.email
  const existing = await env.DB.prepare(`SELECT id FROM auth_users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>()
  if (existing?.id) {
    return mobileError("CONFLICT", "Email already exists", request, env, 409)
  }

  const credentials = await hashPassword(validation.data.password)
  const userId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO auth_users (id, email, name, image, password_hash, password_salt, password_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      userId,
      email,
      validation.data.name,
      null,
      credentials.password_hash,
      credentials.password_salt,
    )
    .run()

  const token = await issueApiToken(env, userId, body?.label ?? null)
  return mobileJson(
    {
      token: token.token,
      tokenId: token.tokenId,
      expiresAt: token.expiresAt,
      user: {
        id: userId,
        email,
        name: validation.data.name,
        image: null,
      },
    },
    request,
    env,
  )
}

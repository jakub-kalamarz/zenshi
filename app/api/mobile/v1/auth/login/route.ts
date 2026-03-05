import { getCloudflareContext } from "@opennextjs/cloudflare"
import { issueApiToken } from "@/lib/mobile-auth"
import { mobileError, mobileJson, handleMobileOptions } from "@/lib/mobile-http"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { validateCredentials, verifyPassword } from "@/lib/credentials"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
    label?: string
  } | null

  const validation = validateCredentials(
    {
      email: body?.email ?? null,
      password: body?.password ?? null,
      name: null,
    },
    { requireName: false },
  )
  if (!validation.ok) {
    return mobileError("VALIDATION_ERROR", validation.errors.join(", "), request, env, 400)
  }

  const user = await env.DB.prepare(
    `SELECT id, email, name, image, password_hash, password_salt
     FROM auth_users
     WHERE email = ?`,
  )
    .bind(validation.data.email)
    .first<{
      id: string
      email: string | null
      name: string | null
      image: string | null
      password_hash: string | null
      password_salt: string | null
    }>()
  if (!user) {
    return mobileError("UNAUTHORIZED", "Invalid credentials", request, env, 401)
  }

  const isValidPassword = await verifyPassword(
    validation.data.password,
    user.password_hash,
    user.password_salt,
  )
  if (!isValidPassword) {
    return mobileError("UNAUTHORIZED", "Invalid credentials", request, env, 401)
  }

  const token = await issueApiToken(env, user.id, body?.label ?? null)
  return mobileJson(
    {
      token: token.token,
      tokenId: token.tokenId,
      expiresAt: token.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
    },
    request,
    env,
  )
}

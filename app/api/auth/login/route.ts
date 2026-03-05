import { getCloudflareContext } from "@opennextjs/cloudflare"
import {
  buildSessionCookieFromRequest,
  createSessionForUser,
} from "@/lib/auth"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { validateCredentials, verifyPassword } from "@/lib/credentials"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  await ensureAuthSchema(env)

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
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
    return Response.json({ error: validation.errors.join(", ") }, { status: 400 })
  }

  const email = validation.data.email
  const row = await env.DB.prepare(
    `SELECT id, email, name, image, password_hash, password_salt
     FROM auth_users
     WHERE email = ?`,
  )
    .bind(email)
    .first<{
      id: string
      email: string
      name: string | null
      image: string | null
    password_hash: string | null
      password_salt: string | null
    }>()

  if (!row) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const isValidPassword = row.password_hash && row.password_salt
    ? await verifyPassword(validation.data.password, row.password_hash, row.password_salt)
    : false
  if (!isValidPassword) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const session = await createSessionForUser(env, row.id)
  const response = Response.json({
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
    },
  })
  response.headers.set("Set-Cookie", buildSessionCookieFromRequest(request, session.sessionToken))
  return response
}

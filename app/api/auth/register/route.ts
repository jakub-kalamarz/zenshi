import { getCloudflareContext } from "@opennextjs/cloudflare"
import {
  buildSessionCookieFromRequest,
  createSessionForUser,
} from "@/lib/auth"
import { ensureAuthSchema } from "@/lib/auth-schema"
import {
  hashPassword,
  normalizeName,
  validateCredentials,
} from "@/lib/credentials"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  await ensureAuthSchema(env)

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
    name?: string
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
    return Response.json({ error: validation.errors.join(", ") }, { status: 400 })
  }

  const email = validation.data.email
  const name = normalizeName(validation.data.name)
  const existingUser = await env.DB.prepare(`SELECT id FROM auth_users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>()
  if (existingUser?.id) {
    return Response.json({ error: "Email is already used" }, { status: 409 })
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
      name,
      null,
      credentials.password_hash,
      credentials.password_salt,
    )
    .run()

  const session = await createSessionForUser(env, userId)
  const response = Response.json(
    {
      user: {
        id: userId,
        email,
        name,
        image: null,
      },
    },
    { status: 201 },
  )
  response.headers.set("Set-Cookie", buildSessionCookieFromRequest(request, session.sessionToken))
  return response
}

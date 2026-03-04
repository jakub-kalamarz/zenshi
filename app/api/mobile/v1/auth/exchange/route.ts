import { getCloudflareContext } from "@opennextjs/cloudflare"
import { exchangeLoginCode, issueApiToken } from "@/lib/mobile-auth"
import { mobileError, mobileJson, handleMobileOptions } from "@/lib/mobile-http"
import { ensureAuthSchema } from "@/lib/auth-schema"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)

  const body = (await request.json().catch(() => null)) as {
    code?: string
    label?: string
  } | null
  const code = body?.code?.trim()
  if (!code) {
    return mobileError("VALIDATION_ERROR", "Missing code", request, env, 400)
  }

  const userId = await exchangeLoginCode(env, code)
  if (!userId) {
    return mobileError("UNAUTHORIZED", "Invalid or expired code", request, env, 401)
  }

  const token = await issueApiToken(env, userId, body?.label ?? null)
  const userRow = await env.DB.prepare(
    `SELECT id, email, name, image FROM auth_users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ id: string; email: string | null; name: string | null; image: string | null }>()

  return mobileJson(
    {
      token: token.token,
      tokenId: token.tokenId,
      expiresAt: token.expiresAt,
      user: userRow ?? { id: userId, email: null, name: null, image: null },
    },
    request,
    env,
  )
}

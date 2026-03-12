import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { GoogleRelinkTokenError, relinkGoogleAccountToUser } from "@/lib/auth"
import { requireMobileSession } from "@/lib/mobile-auth"
import { handleMobileOptions, mobileError, mobileJson } from "@/lib/mobile-http"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const body = (await request.json().catch(() => null)) as {
    relinkToken?: string
  } | null

  if (!body?.relinkToken) {
    return mobileError("VALIDATION_ERROR", "Missing relink token", request, env, 400)
  }

  try {
    await relinkGoogleAccountToUser(env, session.user.id, body.relinkToken)
  } catch (error) {
    if (error instanceof GoogleRelinkTokenError) {
      return mobileError(error.code, error.message, request, env, error.status)
    }
    throw error
  }

  return mobileJson(
    {
      linked: true,
      user: session.user,
    },
    request,
    env,
  )
}

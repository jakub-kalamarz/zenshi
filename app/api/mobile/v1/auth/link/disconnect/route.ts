import { getCloudflareContext } from "@opennextjs/cloudflare"
import { disconnectGoogleAccountFromUser, GoogleDisconnectError } from "@/lib/auth"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { buildMobileSession, requireMobileSession } from "@/lib/mobile-auth"
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

  try {
    await disconnectGoogleAccountFromUser(env, session.user.id)
  } catch (error) {
    if (error instanceof GoogleDisconnectError) {
      return mobileError(error.code, error.message, request, env, error.status)
    }
    throw error
  }

  const refreshedSession = await buildMobileSession(env, session)
  return mobileJson(refreshedSession, request, env)
}

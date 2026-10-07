import { getCloudflareContext } from "@opennextjs/cloudflare"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions } from "@/lib/mobile-http"
import { registerNotificationDevice } from "@/lib/notification-service"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const body = (await request.json().catch(() => null)) as {
    token?: string
    authorizationStatus?: "authorized" | "denied" | "notDetermined" | "provisional" | "ephemeral" | "unknown"
  } | null

  const result = await registerNotificationDevice(env, session.user.id, body ?? {})
  return mobileFromService(result, request, env)
}

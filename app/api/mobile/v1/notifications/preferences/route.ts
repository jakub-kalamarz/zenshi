import { getCloudflareContext } from "@opennextjs/cloudflare"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions } from "@/lib/mobile-http"
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/notification-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const result = await getNotificationPreferences(env, session.user.id)
  return mobileFromService(result, request, env)
}

export async function PUT(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const body = (await request.json().catch(() => null)) as {
    enabled?: boolean
    deliveryMode?: "digest" | "perSite"
    monitoredSiteIds?: string[]
  } | null

  const result = await updateNotificationPreferences(env, session.user.id, body ?? {})
  return mobileFromService(result, request, env)
}

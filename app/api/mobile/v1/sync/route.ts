import { getCloudflareContext } from "@opennextjs/cloudflare"
import {
  getMobileDemoSyncEnqueueResponse,
  getMobileDemoSyncResetResponse,
  isMobileDemoUser,
} from "@/lib/mobile-demo-data"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions, mobileJson } from "@/lib/mobile-http"
import { enqueueSync, resetAccountDashboardData } from "@/lib/gsc-service"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const body = (await request.json().catch(() => null)) as { siteId?: string } | null
  if (isMobileDemoUser(session.user)) {
    return mobileJson(getMobileDemoSyncEnqueueResponse(body?.siteId?.trim() ?? null), request, env)
  }

  const result = await enqueueSync(env, session.user.id, body?.siteId?.trim() ?? null)
  return mobileFromService(result, request, env)
}

export async function DELETE(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }
  if (isMobileDemoUser(session.user)) {
    return mobileJson(getMobileDemoSyncResetResponse(), request, env)
  }

  const result = await resetAccountDashboardData(env, session.user.id)
  return mobileFromService(result, request, env)
}

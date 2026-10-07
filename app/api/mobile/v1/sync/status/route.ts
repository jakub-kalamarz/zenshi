import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getMobileDemoSyncStatusResponse, isMobileDemoUser } from "@/lib/mobile-demo-data"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions, mobileJson } from "@/lib/mobile-http"
import { getSyncStatus } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }
  if (isMobileDemoUser(session.user)) {
    return mobileJson(getMobileDemoSyncStatusResponse(), request, env)
  }

  const result = await getSyncStatus(env, session.user.id)
  return mobileFromService(result, request, env)
}

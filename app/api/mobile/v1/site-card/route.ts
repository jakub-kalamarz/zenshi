import { getCloudflareContext } from "@opennextjs/cloudflare"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions } from "@/lib/mobile-http"
import { getSiteCardData } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const { searchParams } = new URL(request.url)
  const result = await getSiteCardData(env, session.user.id, {
    siteId: searchParams.get("siteId"),
    start: searchParams.get("start"),
    end: searchParams.get("end"),
    granularity: searchParams.get("granularity"),
  })
  return mobileFromService(result, request, env)
}

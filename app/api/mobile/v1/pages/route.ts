import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getMobileDemoPagesResponseForSite, isMobileDemoUser } from "@/lib/mobile-demo-data"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions, mobileJson } from "@/lib/mobile-http"
import { getPagesData } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const { searchParams } = new URL(request.url)
  if (isMobileDemoUser(session.user)) {
    return mobileJson(getMobileDemoPagesResponseForSite(searchParams.get("siteId")), request, env)
  }

  const result = await getPagesData(env, session.user.id, {
    siteId: searchParams.get("siteId"),
    start: searchParams.get("start"),
    end: searchParams.get("end"),
    compareStart: searchParams.get("compareStart"),
    compareEnd: searchParams.get("compareEnd"),
    granularity: searchParams.get("granularity"),
    limit: Number(searchParams.get("limit") || 200),
  })
  return mobileFromService(result, request, env)
}

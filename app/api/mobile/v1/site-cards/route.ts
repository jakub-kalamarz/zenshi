import { getCloudflareContext } from "@opennextjs/cloudflare"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions, mobileJson } from "@/lib/mobile-http"
import { getSiteCardsData, parseSiteCardsRequest } from "@/lib/gsc-service"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const parsedBody = parseSiteCardsRequest(await request.json())
  if (!parsedBody) {
    return mobileError("VALIDATION_ERROR", "Missing siteIds/start/end", request, env, 400)
  }

  const result = await getSiteCardsData(env, session.user.id, parsedBody)
  if (result.ok) {
    const payload = (result.data ?? {}) as { results?: unknown }
    return mobileJson(payload.results ?? {}, request, env)
  }
  return mobileFromService(result, request, env)
}

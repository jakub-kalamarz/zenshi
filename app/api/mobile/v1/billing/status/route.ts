import { getCloudflareContext } from "@opennextjs/cloudflare"
import { requireMobileSession } from "@/lib/mobile-auth"
import { getBillingStatus } from "@/lib/billing"
import { handleMobileOptions, mobileError, mobileJson } from "@/lib/mobile-http"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  return mobileJson(await getBillingStatus(env, session.user.id), request, env)
}

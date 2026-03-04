import { getCloudflareContext } from "@opennextjs/cloudflare"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileJson, handleMobileOptions } from "@/lib/mobile-http"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  return mobileJson(session, request, env)
}

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { parseBearerToken, revokeApiToken } from "@/lib/mobile-auth"
import { mobileError, mobileJson, handleMobileOptions } from "@/lib/mobile-http"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const token = parseBearerToken(request)
  if (!token) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const revoked = await revokeApiToken(env, token)
  return mobileJson({ revoked }, request, env)
}

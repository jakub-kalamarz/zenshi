import { getCloudflareContext } from "@opennextjs/cloudflare"
import { revokeApiToken } from "@/lib/mobile-auth"
import { mobileError, mobileJson, handleMobileOptions } from "@/lib/mobile-http"

function parseBearerToken(request: Request) {
  const header = request.headers.get("authorization") || ""
  const [scheme, value] = header.split(" ")
  if (scheme?.toLowerCase() !== "bearer") return null
  return value?.trim() || null
}

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

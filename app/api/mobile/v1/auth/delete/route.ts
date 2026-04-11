import { getCloudflareContext } from "@opennextjs/cloudflare"
import { deleteAccountForUser } from "@/lib/auth"
import { requireMobileSession } from "@/lib/mobile-auth"
import { handleMobileOptions, mobileError, mobileJson } from "@/lib/mobile-http"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  await deleteAccountForUser(env, session.user.id)
  return mobileJson({ deleted: true }, request, env)
}

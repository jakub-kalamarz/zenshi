import { getCloudflareContext } from "@opennextjs/cloudflare"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions } from "@/lib/mobile-http"
import { createSite, listSites, updateSiteFolder } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const refresh = new URL(request.url).searchParams.get("refresh") === "1"
  const result = await listSites(env, session.user.id, refresh)
  return mobileFromService(result, request, env)
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const body = (await request.json().catch(() => null)) as { siteUrl?: string } | null
  const result = await createSite(env, session.user.id, body?.siteUrl?.trim() ?? null)
  return mobileFromService(result, request, env)
}

export async function PATCH(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const body = (await request.json().catch(() => null)) as {
    siteId?: string
    folderId?: string | null
  } | null
  const result = await updateSiteFolder(
    env,
    session.user.id,
    body?.siteId?.trim() ?? null,
    body?.folderId?.trim() ?? null,
  )
  return mobileFromService(result, request, env)
}

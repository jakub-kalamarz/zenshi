import { getCloudflareContext } from "@opennextjs/cloudflare"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions } from "@/lib/mobile-http"
import { createShare, deleteShare, listShares, updateShare } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const result = await listShares(env, session.user.id, request)
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

  const body = (await request.json().catch(() => null)) as {
    scopeType?: unknown
    scopeId?: unknown
    expiresAt?: unknown
    branding?: unknown
    defaults?: unknown
  } | null
  const result = await createShare(env, session.user.id, request, body)
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
    shareId?: string
    status?: unknown
    expiresAt?: unknown
    branding?: unknown
    defaults?: unknown
  } | null
  const result = await updateShare(env, session.user.id, body)
  return mobileFromService(result, request, env)
}

export async function DELETE(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }

  const body = (await request.json().catch(() => null)) as { shareId?: string } | null
  const result = await deleteShare(env, session.user.id, body?.shareId?.trim() ?? null)
  return mobileFromService(result, request, env)
}

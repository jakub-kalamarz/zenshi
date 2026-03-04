import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createShare, deleteShare, listShares, updateShare } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const result = await listShares(env, session.user.id, request)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const body = (await request.json().catch(() => null)) as {
    scopeType?: unknown
    scopeId?: unknown
    expiresAt?: unknown
    branding?: unknown
    defaults?: unknown
  } | null
  const result = await createShare(env, session.user.id, request, body)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

export async function PATCH(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const body = (await request.json().catch(() => null)) as {
    shareId?: string
    status?: unknown
    expiresAt?: unknown
    branding?: unknown
    defaults?: unknown
  } | null
  const result = await updateShare(env, session.user.id, body)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

export async function DELETE(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const body = (await request.json().catch(() => null)) as { shareId?: string } | null
  const shareId = body?.shareId?.trim() ?? null
  const result = await deleteShare(env, session.user.id, shareId)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

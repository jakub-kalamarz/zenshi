import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createSite, listSites, updateSiteFolder } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get("refresh") === "1"

  const result = await listSites(env, session.user.id, refresh)
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
  const body = (await request.json().catch(() => null)) as { siteUrl?: string } | null
  const siteUrl = body?.siteUrl?.trim() ?? null
  const result = await createSite(env, session.user.id, siteUrl)
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

  const body = (await request.json().catch(() => null)) as {
    siteId?: string
    folderId?: string | null
  } | null
  const siteId = body?.siteId?.trim()
  const folderId = body?.folderId?.trim() ?? null

  const { env } = await getCloudflareContext({ async: true })
  const result = await updateSiteFolder(env, session.user.id, siteId ?? null, folderId)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

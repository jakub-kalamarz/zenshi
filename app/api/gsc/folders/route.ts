import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createFolder, deleteFolder, listFolders, updateFolder } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const result = await listFolders(env, session.user.id)
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
    name?: string
    icon?: string
    color?: string
  } | null
  const result = await createFolder(env, session.user.id, body)
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
    folderId?: string
    name?: string
    icon?: string
    color?: string
  } | null
  const result = await updateFolder(env, session.user.id, body)
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
  const body = (await request.json().catch(() => null)) as { folderId?: string } | null
  const folderId = body?.folderId?.trim() ?? null
  const result = await deleteFolder(env, session.user.id, folderId)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

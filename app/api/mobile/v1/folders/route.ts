import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getMobileDemoFoldersResponse, isMobileDemoUser } from "@/lib/mobile-demo-data"
import { requireMobileSession } from "@/lib/mobile-auth"
import { mobileError, mobileFromService, handleMobileOptions, mobileJson } from "@/lib/mobile-http"
import { createFolder, deleteFolder, listFolders, updateFolder } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  const session = await requireMobileSession(env, request)
  if (!session) {
    return mobileError("UNAUTHORIZED", "Unauthorized", request, env, 401)
  }
  if (isMobileDemoUser(session.user)) {
    return mobileJson(getMobileDemoFoldersResponse(), request, env)
  }

  const result = await listFolders(env, session.user.id)
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
    name?: string
    icon?: string
    color?: string
  } | null
  const result = await createFolder(env, session.user.id, body)
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
    folderId?: string
    name?: string
    icon?: string
    color?: string
  } | null
  const result = await updateFolder(env, session.user.id, body)
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

  const body = (await request.json().catch(() => null)) as { folderId?: string } | null
  const result = await deleteFolder(env, session.user.id, body?.folderId?.trim() ?? null)
  return mobileFromService(result, request, env)
}

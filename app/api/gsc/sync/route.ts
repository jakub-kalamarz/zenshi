import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { enqueueSync } from "@/lib/gsc-service"

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const body = (await request.json().catch(() => null)) as
    | { siteId?: string }
    | null
  const siteId = body?.siteId?.trim() ?? null
  const result = await enqueueSync(env, session.user.id, siteId)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

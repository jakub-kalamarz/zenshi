import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
import { enqueueSyncForSite } from "@/lib/gsc-sync"

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { siteId?: string }
    | null

  const siteId = body?.siteId?.trim()
  if (!siteId) {
    return new Response("Missing siteId", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const owner = await env.DB.prepare(
    `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(siteId, session.user.id)
    .first()

  if (!owner) {
    return new Response("Not found", { status: 404 })
  }

  const daysQueued = await enqueueSyncForSite(env, siteId)
  return Response.json({ ok: true, siteId, daysQueued })
}

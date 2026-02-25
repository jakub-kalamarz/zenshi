import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
import { filterAllowedSiteIds, resolveShareByToken } from "@/lib/gsc-share"
import { loadShareSiteCards } from "@/lib/gsc-share-data"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string
    siteIds?: string[]
    start?: string
    end?: string
    compareStart?: string
    compareEnd?: string
    granularity?: string
  } | null

  const start = body?.start?.trim()
  const end = body?.end?.trim()
  if (!start || !end) {
    return new Response("Missing start/end", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const resolved = await resolveShareByToken(env, request, body?.token ?? null)
  if (!resolved.ok) return resolved.response

  const requested = Array.isArray(body?.siteIds) ? body.siteIds : []
  const siteIds = filterAllowedSiteIds(resolved.share, requested)

  const payload = await loadShareSiteCards(
    env,
    siteIds,
    start,
    end,
    body?.compareStart?.trim() ?? null,
    body?.compareEnd?.trim() ?? null,
    body?.granularity ?? null,
  )

  return Response.json(payload)
}

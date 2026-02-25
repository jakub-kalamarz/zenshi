import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
import { resolveShareByToken, resolveTargetSiteId } from "@/lib/gsc-share"
import { loadSharePages } from "@/lib/gsc-share-data"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")
  const start = searchParams.get("start")?.trim()
  const end = searchParams.get("end")?.trim()

  if (!start || !end) {
    return new Response("Missing start/end", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const resolved = await resolveShareByToken(env, request, token)
  if (!resolved.ok) return resolved.response

  const siteId = resolveTargetSiteId(resolved.share, searchParams.get("siteId"))
  if (!siteId) {
    return new Response("Site out of share scope", { status: 403 })
  }

  const payload = await loadSharePages(
    env,
    siteId,
    start,
    end,
    searchParams.get("compareStart")?.trim() ?? null,
    searchParams.get("compareEnd")?.trim() ?? null,
    searchParams.get("limit"),
    searchParams.get("granularity"),
  )

  return Response.json(payload)
}

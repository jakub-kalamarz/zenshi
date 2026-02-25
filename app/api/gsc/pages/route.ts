import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
import { computeServedRange, getRetentionBounds, parseGranularity } from "@/lib/gsc-analytics"

type PageMetricsRow = {
  page: string
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const siteId = searchParams.get("siteId")?.trim()
  const start = searchParams.get("start")?.trim()
  const end = searchParams.get("end")?.trim()
  const granularity = parseGranularity(searchParams.get("granularity"))
  const limit = Math.min(Number(searchParams.get("limit") || 200), 1000)

  if (!siteId || !start || !end) {
    return new Response("Missing siteId/start/end", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)
  const [ownerResult, lastAvailableResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
    ).bind(siteId, session.user.id),
    env.DB.prepare(
      `SELECT MAX(date) AS lastDate FROM gsc_pages_daily WHERE site_id = ?`,
    ).bind(siteId),
  ])
  const owner = (ownerResult.results[0] as Record<string, unknown> | undefined) ?? null

  if (!owner) {
    return new Response("Not found", { status: 404 })
  }

  const lastAvailable =
    (lastAvailableResult.results[0] as { lastDate?: string | null } | undefined) ?? null
  const lastDateValue = typeof lastAvailable?.lastDate === "string" ? lastAvailable.lastDate : null
  const { effectiveStart: servedStart, effectiveEnd: servedEnd } = computeServedRange(
    start,
    end,
    lastDateValue,
  )

  const aggregationSql = `SELECT
       page,
       SUM(clicks) AS clicks,
       SUM(impressions) AS impressions,
       CASE
         WHEN SUM(impressions) > 0
         THEN SUM(clicks) * 1.0 / SUM(impressions)
         ELSE 0
       END AS ctr,
       CASE
         WHEN SUM(impressions) > 0
         THEN SUM(position * impressions) * 1.0 / SUM(impressions)
         ELSE 0
       END AS position
     FROM gsc_pages_daily
     WHERE site_id = ?
       AND date >= ?
       AND date <= ?
     GROUP BY page
     ORDER BY clicks DESC
     LIMIT ?`

  const result = await env.DB.prepare(aggregationSql)
    .bind(siteId, servedStart, servedEnd, limit)
    .all()

  const compareStart = searchParams.get("compareStart")?.trim()
  const compareEnd = searchParams.get("compareEnd")?.trim()

  if (compareStart && compareEnd) {
    const compareServed = computeServedRange(compareStart, compareEnd, lastDateValue)
    const compareResult = await env.DB.prepare(aggregationSql)
      .bind(siteId, compareServed.effectiveStart, compareServed.effectiveEnd, limit)
      .all()

    const primaryRows = (result.results ?? []) as PageMetricsRow[]
    const compareRows = (compareResult.results ?? []) as PageMetricsRow[]
    const compareMap = new Map(compareRows.map((row) => [row.page, row]))

    const pages = primaryRows.map((row) => {
      const cmp = compareMap.get(row.page)
      return {
        ...row,
        compareClicks: cmp?.clicks ?? null,
        compareImpressions: cmp?.impressions ?? null,
        compareCtr: cmp?.ctr ?? null,
        comparePosition: cmp?.position ?? null,
      }
    })
    const retention = getRetentionBounds()
    return Response.json({
      pages,
      requestedRange: { start, end },
      servedRange: { start: servedStart, end: servedEnd },
      effectiveRange: servedStart !== start || servedEnd !== end ? { start: servedStart, end: servedEnd } : null,
      retention: {
        start: retention.retentionStart,
        end: retention.retentionEnd,
        partiallyOutside: start < retention.retentionStart || end > retention.retentionEnd,
      },
      granularity,
    })
  }

  const retention = getRetentionBounds()
  return Response.json({
    pages: (result.results ?? []) as PageMetricsRow[],
    requestedRange: { start, end },
    servedRange: { start: servedStart, end: servedEnd },
    effectiveRange: servedStart !== start || servedEnd !== end ? { start: servedStart, end: servedEnd } : null,
    retention: {
      start: retention.retentionStart,
      end: retention.retentionEnd,
      partiallyOutside: start < retention.retentionStart || end > retention.retentionEnd,
    },
    granularity,
  })
}

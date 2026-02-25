import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
import {
  buildBucketExpression,
  type Granularity,
  computeServedRange,
  fillSeriesGaps,
  getRetentionBounds,
  parseGranularity,
} from "@/lib/gsc-analytics"
import {
  clampGranularity,
  getAllowedGranularities,
} from "@/lib/gsc-granularity"

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const siteId = searchParams.get("siteId")?.trim()
  const start = searchParams.get("start")?.trim()
  const end = searchParams.get("end")?.trim()
  const requestedGranularity = parseGranularity(searchParams.get("granularity"))

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
      `SELECT MAX(date) AS lastDate
       FROM gsc_pages_daily
       WHERE site_id = ?`,
    ).bind(siteId),
  ])
  const owner = (ownerResult.results[0] as Record<string, unknown> | undefined) ?? null

  if (!owner) {
    return new Response("Not found", { status: 404 })
  }

  const lastAvailable =
    (lastAvailableResult.results[0] as { lastDate?: string | null } | undefined) ?? null

  const lastDateValue =
    typeof lastAvailable?.lastDate === "string"
      ? lastAvailable.lastDate
      : null
  const { effectiveStart: servedStart, effectiveEnd: servedEnd } = computeServedRange(
    start,
    end,
    lastDateValue,
  )
  const allowedGranularities = getAllowedGranularities(servedStart, servedEnd)
  const granularity: Granularity = clampGranularity(
    requestedGranularity,
    servedStart,
    servedEnd,
  )

  const totals = await env.DB.prepare(
    `SELECT
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
       AND date <= ?`,
  )
    .bind(siteId, servedStart, servedEnd)
    .first()

  const bucketExpr = buildBucketExpression("date", granularity)
  const series = await env.DB.prepare(
    `SELECT
       ${bucketExpr} AS bucket,
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
     GROUP BY bucket
     ORDER BY bucket ASC`,
  )
    .bind(siteId, servedStart, servedEnd)
    .all()

  const filledSeries = fillSeriesGaps(series.results ?? [], servedStart, servedEnd, granularity)
  const retention = getRetentionBounds()

  return Response.json({
    total: totals ?? null,
    series: filledSeries.length > 0 ? filledSeries : (series.results ?? []),
    requestedRange: { start, end },
    servedRange: { start: servedStart, end: servedEnd },
    effectiveRange:
      servedStart !== start || servedEnd !== end
        ? { start: servedStart, end: servedEnd }
        : null,
    lastAvailable: lastDateValue,
    granularity,
    allowedGranularities,
    retention: {
      start: retention.retentionStart,
      end: retention.retentionEnd,
      partiallyOutside: start < retention.retentionStart || end > retention.retentionEnd,
    },
  })
}

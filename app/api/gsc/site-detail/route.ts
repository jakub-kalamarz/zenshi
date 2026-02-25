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

type DeviceMetricsRow = {
  device: string
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}
type PageMetricsRow = {
  page: string
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}
type QueryMetricsRow = {
  query: string
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
  const requestedGranularity = parseGranularity(searchParams.get("granularity"))
  const compareStart = searchParams.get("compareStart")?.trim()
  const compareEnd = searchParams.get("compareEnd")?.trim()
  const limit = Math.min(Number(searchParams.get("limit") || 200), 1000)
  const debug = searchParams.get("debug") === "1"

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

  const lastDateValue =
    typeof lastAvailable?.lastDate === "string" ? lastAvailable.lastDate : null
  const { effectiveStart, effectiveEnd } = computeServedRange(
    start,
    end,
    lastDateValue,
  )
  const allowedGranularities = getAllowedGranularities(effectiveStart, effectiveEnd)
  const granularity: Granularity = clampGranularity(
    requestedGranularity,
    effectiveStart,
    effectiveEnd,
  )
  const bucketExpr = buildBucketExpression("date", granularity)

  const statements: D1PreparedStatement[] = []

  // Totals primary
  statements.push(
    env.DB.prepare(
      `SELECT
         SUM(clicks) AS clicks,
         SUM(impressions) AS impressions,
         CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
         CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
       FROM gsc_pages_daily
       WHERE site_id = ? AND date >= ? AND date <= ?`,
    ).bind(siteId, effectiveStart, effectiveEnd),
  )

  // Series primary
  statements.push(
    env.DB.prepare(
      `SELECT
         ${bucketExpr} AS bucket,
         SUM(clicks) AS clicks,
         SUM(impressions) AS impressions,
         CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
         CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
       FROM gsc_pages_daily
       WHERE site_id = ? AND date >= ? AND date <= ?
       GROUP BY bucket
       ORDER BY bucket ASC`,
    ).bind(siteId, effectiveStart, effectiveEnd),
  )

  // Pages aggregation
  const pagesSql = `SELECT
       page,
       SUM(clicks) AS clicks,
       SUM(impressions) AS impressions,
       CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
       CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
     FROM gsc_pages_daily
     WHERE site_id = ? AND date >= ? AND date <= ?
     GROUP BY page
     ORDER BY clicks DESC
     LIMIT ?`

  statements.push(
    env.DB.prepare(pagesSql).bind(siteId, effectiveStart, effectiveEnd, limit),
  )

  // Queries aggregation
  const queriesSql = `SELECT
       query,
       SUM(clicks) AS clicks,
       SUM(impressions) AS impressions,
       CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
       CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
     FROM gsc_queries_daily
     WHERE site_id = ? AND date >= ? AND date <= ?
     GROUP BY query
     ORDER BY clicks DESC
     LIMIT ?`

  statements.push(
    env.DB.prepare(queriesSql).bind(siteId, effectiveStart, effectiveEnd, limit),
  )

  const devicesSql = `SELECT
       device,
       SUM(clicks) AS clicks,
       SUM(impressions) AS impressions,
       CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
       CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
     FROM gsc_page_device_daily
     WHERE site_id = ? AND date >= ? AND date <= ?
     GROUP BY device
     ORDER BY clicks DESC`
  statements.push(
    env.DB.prepare(devicesSql).bind(siteId, effectiveStart, effectiveEnd),
  )

  if (compareStart && compareEnd) {
    // Totals compare
    statements.push(
      env.DB.prepare(
        `SELECT
           SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
           CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
         FROM gsc_pages_daily
         WHERE site_id = ? AND date >= ? AND date <= ?`,
      ).bind(siteId, compareStart, compareEnd),
    )
    // Series compare
    statements.push(
      env.DB.prepare(
        `SELECT
           ${bucketExpr} AS bucket,
           SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
           CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
         FROM gsc_pages_daily
         WHERE site_id = ? AND date >= ? AND date <= ?
         GROUP BY bucket
         ORDER BY bucket ASC`,
      ).bind(siteId, compareStart, compareEnd),
    )
    // Pages compare
    statements.push(
      env.DB.prepare(pagesSql).bind(siteId, compareStart, compareEnd, limit),
    )
    // Queries compare
    statements.push(
      env.DB.prepare(queriesSql).bind(siteId, compareStart, compareEnd, limit),
    )
    statements.push(
      env.DB.prepare(devicesSql).bind(siteId, compareStart, compareEnd),
    )
  }

  const allResults = await env.DB.batch(statements)
  let idx = 0

  const totals = allResults[idx++].results[0] || null
  const seriesResults = allResults[idx++].results || []
  const pagesResults = allResults[idx++].results || []
  const queriesResults = allResults[idx++].results || []
  const devicesResults = allResults[idx++].results || []

  let compareTotals = null
  let compareSeriesResults: Array<Record<string, unknown>> = []
  let comparePagesResults: PageMetricsRow[] = []
  let compareQueriesResults: QueryMetricsRow[] = []
  let compareDevicesResults: DeviceMetricsRow[] = []

  if (compareStart && compareEnd) {
    compareTotals = allResults[idx++].results[0] || null
    compareSeriesResults = (allResults[idx++].results || []) as Array<Record<string, unknown>>
    comparePagesResults = (allResults[idx++].results || []) as PageMetricsRow[]
    compareQueriesResults = (allResults[idx++].results || []) as QueryMetricsRow[]
    compareDevicesResults = (allResults[idx++].results || []) as DeviceMetricsRow[]
  }

  // Fill series gaps
  const filledSeries = fillSeriesGaps(
    seriesResults as Array<Record<string, unknown>>,
    effectiveStart,
    effectiveEnd,
    granularity,
  )
  const filledCompareSeries =
    compareStart && compareEnd
      ? fillSeriesGaps(
        compareSeriesResults as Array<Record<string, unknown>>,
        compareStart,
        compareEnd,
        granularity,
      )
      : []

  const seriesStart =
    filledSeries.length > 0 ? (filledSeries[0].date as string) : null
  const seriesEnd =
    filledSeries.length > 0
      ? (filledSeries[filledSeries.length - 1].date as string)
      : null

  // Map comparisons for pages and queries
  const primaryPages = pagesResults as PageMetricsRow[]
  const primaryQueries = queriesResults as QueryMetricsRow[]
  const comparePagesMap = new Map(comparePagesResults.map((row) => [row.page, row]))
  const pages = primaryPages.map((row) => {
    const cmp = comparePagesMap.get(row.page)
    return {
      ...row,
      compareClicks: cmp?.clicks ?? null,
      compareImpressions: cmp?.impressions ?? null,
      compareCtr: cmp?.ctr ?? null,
      comparePosition: cmp?.position ?? null,
    }
  })

  const compareQueriesMap = new Map(compareQueriesResults.map((row) => [row.query, row]))
  const queries = primaryQueries.map((row) => {
    const cmp = compareQueriesMap.get(row.query)
    return {
      ...row,
      compareClicks: cmp?.clicks ?? null,
      compareImpressions: cmp?.impressions ?? null,
      compareCtr: cmp?.ctr ?? null,
      comparePosition: cmp?.position ?? null,
    }
  })

  const compareDevicesMap = new Map(
    compareDevicesResults.map((row) => [row.device, row]),
  )
  const devices = (devicesResults as DeviceMetricsRow[]).map((row) => {
    const cmp = compareDevicesMap.get(row.device)
    return {
      ...row,
      compareClicks: cmp?.clicks ?? null,
      compareImpressions: cmp?.impressions ?? null,
      compareCtr: cmp?.ctr ?? null,
      comparePosition: cmp?.position ?? null,
    }
  })

  const retention = getRetentionBounds()
  const payload: {
    card: Record<string, unknown>
    pages: Array<Record<string, unknown>>
    queries: Array<Record<string, unknown>>
    devices: Array<Record<string, unknown>>
    debug?: Record<string, unknown>
  } = {
    card: {
      total: totals,
      series: filledSeries,
      compareTotal: compareTotals,
      compareSeries: filledCompareSeries,
      requestedRange: { start, end },
      servedRange: { start: effectiveStart, end: effectiveEnd },
      effectiveRange:
        effectiveStart !== start || effectiveEnd !== end
          ? { start: effectiveStart, end: effectiveEnd }
          : null,
      lastAvailable: lastDateValue,
      granularity,
      allowedGranularities,
      retention: {
        start: retention.retentionStart,
        end: retention.retentionEnd,
        partiallyOutside: start < retention.retentionStart || end > retention.retentionEnd,
      },
    },
    pages,
    queries,
    devices,
  }

  if (debug) {
    payload.debug = {
      requestedRange: { start, end },
      effectiveRange: { start: effectiveStart, end: effectiveEnd },
      seriesStart,
      seriesEnd,
      seriesLength: filledSeries.length,
      lastAvailable: lastDateValue,
      compareRange:
        compareStart && compareEnd ? { start: compareStart, end: compareEnd } : null,
      granularity,
    }
  }

  return Response.json(payload)
}

import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
import {
  buildBucketExpression,
  computeServedRange,
  fillSeriesGaps,
  getRetentionBounds,
  parseGranularity,
} from "@/lib/gsc-analytics"
import {
  clampGranularityToAllowed,
  type Granularity,
  getAllowedGranularities,
  intersectGranularities,
} from "@/lib/gsc-granularity"

type SiteCardsRequestBody = {
  siteIds: string[]
  start: string
  end: string
  compareStart: string | null
  compareEnd: string | null
  debug: boolean
  granularity: string | null
}

function parseRequestBody(raw: unknown): SiteCardsRequestBody | null {
  if (!raw || typeof raw !== "object") return null
  const data = raw as Record<string, unknown>
  const siteIds =
    Array.isArray(data.siteIds) && data.siteIds.every((id) => typeof id === "string")
      ? (data.siteIds as string[])
      : null
  const start = typeof data.start === "string" ? data.start : null
  const end = typeof data.end === "string" ? data.end : null
  if (!siteIds || !start || !end) return null
  return {
    siteIds,
    start,
    end,
    compareStart: typeof data.compareStart === "string" ? data.compareStart : null,
    compareEnd: typeof data.compareEnd === "string" ? data.compareEnd : null,
    debug: data.debug === true,
    granularity: typeof data.granularity === "string" ? data.granularity : null,
  }
}

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const parsedBody = parseRequestBody(await request.json())
  if (!parsedBody) {
    return new Response("Missing siteIds/start/end", { status: 400 })
  }
  const { siteIds, start, end, compareStart, compareEnd, debug } = parsedBody
  const requestedGranularity = parseGranularity(parsedBody.granularity)

  if (siteIds.length === 0) {
    return Response.json({ results: {} })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  // Verify ownership of all sites
  const placeholders = siteIds.map(() => "?").join(",")
  const ownedSites = await env.DB.prepare(
    `SELECT id FROM gsc_sites WHERE id IN (${placeholders}) AND owner_user_id = ?`,
  )
    .bind(...siteIds, session.user.id)
    .all()

  const ownedIds = new Set(ownedSites.results.map((r) => r.id as string))
  const targetIds = siteIds.filter((id) => ownedIds.has(id))

  if (targetIds.length === 0) {
    return Response.json({ results: {} })
  }

  const results: Record<string, Record<string, unknown>> = {}
  const debugResults: Record<string, Record<string, unknown>> = {}
  const lastDatePlaceholders = targetIds.map(() => "?").join(",")
  const lastDateRows = await env.DB.prepare(
    `SELECT site_id, MAX(date) AS lastDate
     FROM gsc_pages_daily
     WHERE site_id IN (${lastDatePlaceholders})
     GROUP BY site_id`,
  )
    .bind(...targetIds)
    .all()
  const lastDateBySiteId = new Map<string, string | null>(
    (lastDateRows.results ?? []).map((row) => [
      row.site_id as string,
      (row.lastDate as string | null) ?? null,
    ]),
  )

  const siteContexts = targetIds.map((siteId) => {
    const lastDateValue = lastDateBySiteId.get(siteId) ?? null
    const { effectiveStart, effectiveEnd } = computeServedRange(
      start,
      end,
      lastDateValue,
    )
    const allowedGranularities = getAllowedGranularities(
      effectiveStart,
      effectiveEnd,
    )

    return {
      siteId,
      lastDateValue,
      effectiveStartStr: effectiveStart,
      effectiveEndStr: effectiveEnd,
      allowedGranularities: allowedGranularities as Granularity[],
    }
  })
  const globalAllowedGranularities = intersectGranularities(
    siteContexts.map((site) => site.allowedGranularities),
  )
  const granularity = clampGranularityToAllowed(
    requestedGranularity,
    globalAllowedGranularities,
  )

  const statements: D1PreparedStatement[] = []
  const bucketExpr = buildBucketExpression("date", granularity)
  for (const site of siteContexts) {
    // Totals primary (effective range)
    statements.push(
      env.DB.prepare(
        `SELECT
           SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
           CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
         FROM gsc_pages_daily
         WHERE site_id = ? AND date >= ? AND date <= ?`,
      ).bind(site.siteId, site.effectiveStartStr, site.effectiveEndStr),
    )
    // Series primary (effective range)
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
      ).bind(site.siteId, site.effectiveStartStr, site.effectiveEndStr),
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
        ).bind(site.siteId, compareStart, compareEnd),
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
        ).bind(site.siteId, compareStart, compareEnd),
      )
    }
  }

  const allData = await env.DB.batch(statements)
  let idx = 0
  const retention = getRetentionBounds()

  for (const site of siteContexts) {
    const total = allData[idx++].results[0] || null
    const seriesResults = allData[idx++].results || []

    let compareTotal = null
    let compareSeriesResults: Array<Record<string, unknown>> = []

    if (compareStart && compareEnd) {
      compareTotal = allData[idx++].results[0] || null
      compareSeriesResults = (allData[idx++].results || []) as Array<Record<string, unknown>>
    }

    // Fill series gaps for primary
    const filledSeries = fillSeriesGaps(
      seriesResults as Array<Record<string, unknown>>,
      site.effectiveStartStr,
      site.effectiveEndStr,
      granularity,
    )

    // Fill series gaps for compare
    const filledCompareSeries =
      compareStart && compareEnd
        ? fillSeriesGaps(
          compareSeriesResults,
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

    results[site.siteId] = {
      total,
      series: filledSeries,
      compareTotal,
      compareSeries: filledCompareSeries,
      requestedRange: { start, end },
      servedRange: { start: site.effectiveStartStr, end: site.effectiveEndStr },
      effectiveRange:
        site.effectiveStartStr !== start || site.effectiveEndStr !== end
          ? { start: site.effectiveStartStr, end: site.effectiveEndStr }
          : null,
      lastAvailable: site.lastDateValue,
      granularity,
      allowedGranularities: site.allowedGranularities,
      retention: {
        start: retention.retentionStart,
        end: retention.retentionEnd,
        partiallyOutside: start < retention.retentionStart || end > retention.retentionEnd,
      },
    }

    if (debug) {
      debugResults[site.siteId] = {
        requestedRange: { start, end },
        effectiveRange: {
          start: site.effectiveStartStr,
          end: site.effectiveEndStr,
        },
        seriesStart,
        seriesEnd,
        seriesLength: filledSeries.length,
        lastAvailable: site.lastDateValue,
        compareRange:
          compareStart && compareEnd
            ? { start: compareStart, end: compareEnd }
            : null,
      }
    }
  }

  if (debug) {
    return Response.json({ results, debug: debugResults })
  }
  return Response.json({ results })
}

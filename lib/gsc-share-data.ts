import {
  buildBucketExpression,
  computeServedRange,
  fillSeriesGaps,
  getRetentionBounds,
  parseGranularity,
  type Granularity,
} from "@/lib/gsc-analytics"
import {
  clampGranularity,
  clampGranularityToAllowed,
  getAllowedGranularities,
  intersectGranularities,
} from "@/lib/gsc-granularity"

type Summary = {
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}

type MetricsRow = {
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}

type PageMetricsRow = MetricsRow & {
  page: string
}

type QueryMetricsRow = MetricsRow & {
  query: string
}

type DeviceMetricsRow = MetricsRow & {
  device: string
}

type LastDateRow = { lastDate?: string | null }

function parseLimit(value: unknown, fallback = 200) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(Math.max(1, Math.floor(num)), 1000)
}

export async function loadSharePages(
  env: CloudflareEnv,
  siteId: string,
  start: string,
  end: string,
  compareStart: string | null,
  compareEnd: string | null,
  limitInput: unknown,
  granularityInput: string | null,
) {
  const granularity = parseGranularity(granularityInput)
  const limit = parseLimit(limitInput)

  const lastAvailable = await env.DB.prepare(
    `SELECT MAX(date) AS lastDate FROM gsc_pages_daily WHERE site_id = ?`,
  )
    .bind(siteId)
    .first<{ lastDate?: string }>()

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
       CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
       CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
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

  if (compareStart && compareEnd) {
    const compareServed = computeServedRange(compareStart, compareEnd, lastDateValue)
    const compareResult = await env.DB.prepare(aggregationSql)
      .bind(siteId, compareServed.effectiveStart, compareServed.effectiveEnd, limit)
      .all()
    const compareRows = (compareResult.results ?? []) as PageMetricsRow[]
    const compareMap = new Map(compareRows.map((row) => [row.page, row]))
    const pages = ((result.results ?? []) as PageMetricsRow[]).map((row) => {
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

    return {
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
    }
  }

  const retention = getRetentionBounds()
  return {
    pages: result.results ?? [],
    requestedRange: { start, end },
    servedRange: { start: servedStart, end: servedEnd },
    effectiveRange: servedStart !== start || servedEnd !== end ? { start: servedStart, end: servedEnd } : null,
    retention: {
      start: retention.retentionStart,
      end: retention.retentionEnd,
      partiallyOutside: start < retention.retentionStart || end > retention.retentionEnd,
    },
    granularity,
  }
}

export async function loadShareQueries(
  env: CloudflareEnv,
  siteId: string,
  start: string,
  end: string,
  compareStart: string | null,
  compareEnd: string | null,
  limitInput: unknown,
  granularityInput: string | null,
) {
  const granularity = parseGranularity(granularityInput)
  const limit = parseLimit(limitInput)

  const lastAvailable = await env.DB.prepare(
    `SELECT MAX(date) AS lastDate FROM gsc_queries_daily WHERE site_id = ?`,
  )
    .bind(siteId)
    .first<{ lastDate?: string }>()
  const lastDateValue = typeof lastAvailable?.lastDate === "string" ? lastAvailable.lastDate : null
  const { effectiveStart: servedStart, effectiveEnd: servedEnd } = computeServedRange(
    start,
    end,
    lastDateValue,
  )

  const aggregationSql = `SELECT
       query,
       SUM(clicks) AS clicks,
       SUM(impressions) AS impressions,
       CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
       CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
     FROM gsc_queries_daily
     WHERE site_id = ?
       AND date >= ?
       AND date <= ?
     GROUP BY query
     ORDER BY clicks DESC
     LIMIT ?`

  const result = await env.DB.prepare(aggregationSql)
    .bind(siteId, servedStart, servedEnd, limit)
    .all()

  if (compareStart && compareEnd) {
    const compareServed = computeServedRange(compareStart, compareEnd, lastDateValue)
    const compareResult = await env.DB.prepare(aggregationSql)
      .bind(siteId, compareServed.effectiveStart, compareServed.effectiveEnd, limit)
      .all()
    const compareRows = (compareResult.results ?? []) as QueryMetricsRow[]
    const compareMap = new Map(compareRows.map((row) => [row.query, row]))
    const queries = ((result.results ?? []) as QueryMetricsRow[]).map((row) => {
      const cmp = compareMap.get(row.query)
      return {
        ...row,
        compareClicks: cmp?.clicks ?? null,
        compareImpressions: cmp?.impressions ?? null,
        compareCtr: cmp?.ctr ?? null,
        comparePosition: cmp?.position ?? null,
      }
    })
    const retention = getRetentionBounds()
    return {
      queries,
      requestedRange: { start, end },
      servedRange: { start: servedStart, end: servedEnd },
      effectiveRange: servedStart !== start || servedEnd !== end ? { start: servedStart, end: servedEnd } : null,
      retention: {
        start: retention.retentionStart,
        end: retention.retentionEnd,
        partiallyOutside: start < retention.retentionStart || end > retention.retentionEnd,
      },
      granularity,
    }
  }

  const retention = getRetentionBounds()
  return {
    queries: result.results ?? [],
    requestedRange: { start, end },
    servedRange: { start: servedStart, end: servedEnd },
    effectiveRange: servedStart !== start || servedEnd !== end ? { start: servedStart, end: servedEnd } : null,
    retention: {
      start: retention.retentionStart,
      end: retention.retentionEnd,
      partiallyOutside: start < retention.retentionStart || end > retention.retentionEnd,
    },
    granularity,
  }
}

export async function loadShareSiteDetail(
  env: CloudflareEnv,
  siteId: string,
  start: string,
  end: string,
  compareStart: string | null,
  compareEnd: string | null,
  limitInput: unknown,
  granularityInput: string | null,
) {
  const requestedGranularity = parseGranularity(granularityInput)
  const limit = parseLimit(limitInput)

  const lastAvailable = await env.DB.prepare(
    `SELECT MAX(date) AS lastDate FROM gsc_pages_daily WHERE site_id = ?`,
  )
    .bind(siteId)
    .first<LastDateRow>()

  const lastDateValue = typeof lastAvailable?.lastDate === "string" ? lastAvailable.lastDate : null
  const { effectiveStart, effectiveEnd } = computeServedRange(start, end, lastDateValue)
  const allowedGranularities = getAllowedGranularities(effectiveStart, effectiveEnd)
  const granularity: Granularity = clampGranularity(
    requestedGranularity,
    effectiveStart,
    effectiveEnd,
  )

  const statements: D1PreparedStatement[] = []
  const bucketExpr = buildBucketExpression("date", granularity)

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

  statements.push(env.DB.prepare(pagesSql).bind(siteId, effectiveStart, effectiveEnd, limit))

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

  statements.push(env.DB.prepare(queriesSql).bind(siteId, effectiveStart, effectiveEnd, limit))

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
  statements.push(env.DB.prepare(devicesSql).bind(siteId, effectiveStart, effectiveEnd))

  if (compareStart && compareEnd) {
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
    statements.push(env.DB.prepare(pagesSql).bind(siteId, compareStart, compareEnd, limit))
    statements.push(env.DB.prepare(queriesSql).bind(siteId, compareStart, compareEnd, limit))
    statements.push(env.DB.prepare(devicesSql).bind(siteId, compareStart, compareEnd))
  }

  const allResults = await env.DB.batch(statements)
  let idx = 0

  const totals = (allResults[idx++].results?.[0] as Summary | undefined) ?? null
  const seriesResults = allResults[idx++].results ?? []
  const pagesResults = allResults[idx++].results ?? []
  const queriesResults = allResults[idx++].results ?? []
  const devicesResults = allResults[idx++].results ?? []

  let compareTotals: Summary | null = null
  let compareSeriesResults: Array<Record<string, unknown>> = []
  let comparePagesResults: PageMetricsRow[] = []
  let compareQueriesResults: QueryMetricsRow[] = []
  let compareDevicesResults: DeviceMetricsRow[] = []

  if (compareStart && compareEnd) {
    compareTotals = (allResults[idx++].results?.[0] as Summary | undefined) ?? null
    compareSeriesResults = (allResults[idx++].results ?? []) as Array<Record<string, unknown>>
    comparePagesResults = (allResults[idx++].results ?? []) as PageMetricsRow[]
    compareQueriesResults = (allResults[idx++].results ?? []) as QueryMetricsRow[]
    compareDevicesResults = (allResults[idx++].results ?? []) as DeviceMetricsRow[]
  }

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

  const comparePagesMap = new Map(comparePagesResults.map((row) => [row.page, row]))
  const pages = (pagesResults as PageMetricsRow[]).map((row) => {
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
  const queries = (queriesResults as QueryMetricsRow[]).map((row) => {
    const cmp = compareQueriesMap.get(row.query)
    return {
      ...row,
      compareClicks: cmp?.clicks ?? null,
      compareImpressions: cmp?.impressions ?? null,
      compareCtr: cmp?.ctr ?? null,
      comparePosition: cmp?.position ?? null,
    }
  })

  const compareDevicesMap = new Map(compareDevicesResults.map((row) => [row.device, row]))
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
  return {
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
}

export async function loadShareSiteCards(
  env: CloudflareEnv,
  siteIds: string[],
  start: string,
  end: string,
  compareStart: string | null,
  compareEnd: string | null,
  granularityInput: string | null,
) {
  if (siteIds.length === 0) return { results: {} }

  const requestedGranularity = parseGranularity(granularityInput)

  const results: Record<string, unknown> = {}
  const lastDatePlaceholders = siteIds.map(() => "?").join(",")
  const lastDateRows = await env.DB.prepare(
    `SELECT site_id, MAX(date) AS lastDate
     FROM gsc_pages_daily
     WHERE site_id IN (${lastDatePlaceholders})
     GROUP BY site_id`,
  )
    .bind(...siteIds)
    .all()
  const lastDateBySiteId = new Map<string, string | null>(
    (lastDateRows.results ?? []).map((row) => [
      row.site_id as string,
      (row.lastDate as string | null) ?? null,
    ]),
  )

  const siteContexts = siteIds.map((siteId) => {
    const lastDateValue = lastDateBySiteId.get(siteId) ?? null
    const { effectiveStart, effectiveEnd } = computeServedRange(start, end, lastDateValue)
    const allowedGranularities = getAllowedGranularities(effectiveStart, effectiveEnd)

    return {
      siteId,
      lastDateValue,
      effectiveStart,
      effectiveEnd,
      allowedGranularities,
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
    statements.push(
      env.DB.prepare(
        `SELECT
           SUM(clicks) AS clicks,
           SUM(impressions) AS impressions,
           CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
           CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
         FROM gsc_pages_daily
         WHERE site_id = ? AND date >= ? AND date <= ?`,
      ).bind(site.siteId, site.effectiveStart, site.effectiveEnd),
    )

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
      ).bind(site.siteId, site.effectiveStart, site.effectiveEnd),
    )

    if (compareStart && compareEnd) {
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
    const total = allData[idx++].results?.[0] ?? null
    const seriesResults = allData[idx++].results ?? []

    let compareTotal = null
    let compareSeriesResults: Array<Record<string, unknown>> = []

    if (compareStart && compareEnd) {
      compareTotal = allData[idx++].results?.[0] ?? null
      compareSeriesResults = (allData[idx++].results ?? []) as Array<Record<string, unknown>>
    }

    const filledSeries = fillSeriesGaps(
      seriesResults as Array<Record<string, unknown>>,
      site.effectiveStart,
      site.effectiveEnd,
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

    results[site.siteId] = {
      total,
      series: filledSeries,
      compareTotal,
      compareSeries: filledCompareSeries,
      requestedRange: { start, end },
      servedRange: { start: site.effectiveStart, end: site.effectiveEnd },
      effectiveRange:
        site.effectiveStart !== start || site.effectiveEnd !== end
          ? { start: site.effectiveStart, end: site.effectiveEnd }
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
  }

  return { results }
}

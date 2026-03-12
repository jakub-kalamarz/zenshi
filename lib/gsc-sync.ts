import { fetchSearchAnalytics, toGscSiteUrl } from "./gsc"
import { ensureGscSchema } from "./gsc-schema"
import { GSC_RETENTION_MONTHS } from "./gsc-analytics"

type GscRow = {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

type PageRow = {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

type PageDeviceRow = {
  page: string
  device: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type GscSyncMessage = {
  siteId: string
  startDate: string
  endDate: string
}

type SiteRecord = {
  id: string
  owner_user_id: string
  gsc_site_url: string
}

const RANGE_CHUNK_DAYS = 30
const DEFAULT_BACKFILL_DAYS_PER_RUN = 500
const PARALLEL_FETCHES = 3
const DEFAULT_GAP_REPAIR_DAYS = 120
const DEFAULT_GAP_REPAIR_LIMIT = 20
const DEFAULT_MAX_ENQUEUE_MESSAGES = 100
const DEFAULT_EMPTY_PAGE_RETRY_DAYS = 14
const DEFAULT_ROLLING_REFRESH_DAYS = 7
const DEFAULT_API_MAX_PAGES = 4

export async function enqueueDailySync(env: CloudflareEnv) {
  await ensureGscSchema(env)
  const config = getSyncConfig(env)
  const date = getYesterdayUtc()
  const sites = await env.DB.prepare(
    `SELECT id, owner_user_id, gsc_site_url
     FROM gsc_sites
     WHERE enabled = 1`,
  ).all<SiteRecord>()

  if (!sites.results?.length) return

  const messages: Array<{ body: GscSyncMessage }> = []

  for (const site of sites.results) {
    await ensureSyncState(env, site.id)

    // Collect all candidate dates, deduplicate
    const candidateDates = new Set<string>()
    candidateDates.add(date)
    for (const d of listRecentDates(date, config.rollingRefreshDays)) candidateDates.add(d)

    const missingDates = await findMissingDates(env, site.id, date, config)
    for (const d of missingDates) candidateDates.add(d)

    const backfillDates = await planBackfillDates(env, site.id, date, config)
    for (const d of backfillDates) candidateDates.add(d)

    // Filter out already-synced dates
    const unsyncedDates = await filterUnsyncedDates(env, site.id, [...candidateDates])

    // Group into ranges and enqueue
    const ranges = datesToRanges(unsyncedDates, RANGE_CHUNK_DAYS)
    for (const range of ranges) {
      if (messages.length >= config.maxEnqueueMessages) break
      messages.push({ body: { siteId: site.id, startDate: range.startDate, endDate: range.endDate } })
    }
  }

  if (!messages.length) return
  const batches = chunk(messages, 100)
  for (const batch of batches) {
    await env.GSC_SYNC_QUEUE.sendBatch(batch)
  }
}

export async function enqueueSyncForSite(env: CloudflareEnv, siteId: string): Promise<number> {
  await ensureGscSchema(env)
  const config = getSyncConfig(env)
  const date = getYesterdayUtc()
  await ensureSyncState(env, siteId)

  const candidateDates = new Set<string>()
  candidateDates.add(date)
  for (const d of listRecentDates(date, config.rollingRefreshDays)) candidateDates.add(d)

  const missingDates = await findMissingDates(env, siteId, date, config)
  for (const d of missingDates) candidateDates.add(d)

  const backfillDates = await planBackfillDates(env, siteId, date, config)
  for (const d of backfillDates) candidateDates.add(d)

  const unsyncedDates = await filterUnsyncedDates(env, siteId, [...candidateDates])
  const ranges = datesToRanges(unsyncedDates, RANGE_CHUNK_DAYS)

  const messages: Array<{ body: GscSyncMessage }> = []
  for (const range of ranges) {
    if (messages.length >= config.maxEnqueueMessages) break
    messages.push({ body: { siteId, startDate: range.startDate, endDate: range.endDate } })
  }

  if (!messages.length) return 0
  await beginSyncRun(env, siteId, unsyncedDates.length)
  const batches = chunk(messages, 100)
  for (const batch of batches) {
    await env.GSC_SYNC_QUEUE.sendBatch(batch)
  }
  return messages.length
}

export async function runDailySyncDirect(env: CloudflareEnv) {
  await ensureGscSchema(env)
  const config = getSyncConfig(env)
  const date = getYesterdayUtc()
  const sites = await env.DB.prepare(
    `SELECT id
     FROM gsc_sites
     WHERE enabled = 1`,
  ).all<{ id: string }>()

  if (!sites.results?.length) return

  for (const site of sites.results) {
    await ensureSyncState(env, site.id)
    await processSyncMessage({ siteId: site.id, startDate: date, endDate: date }, env)

    const missingDates = await findMissingDates(env, site.id, date, config)
    const backfillDates = await planBackfillDates(env, site.id, date, config)
    const rollingDates = listRecentDates(date, config.rollingRefreshDays)

    const allDates = [...new Set([...missingDates, ...backfillDates, ...rollingDates])]
    const allRanges = [
      ...datesToRanges(
        allDates.filter((d) => d !== date),
        RANGE_CHUNK_DAYS,
      ),
    ]

    // Process ranges in parallel batches
    const rangeChunks = chunk(allRanges, PARALLEL_FETCHES)
    for (const batch of rangeChunks) {
      await Promise.all(
        batch.map((range) =>
          processSyncMessage({ siteId: site.id, startDate: range.startDate, endDate: range.endDate }, env),
        ),
      )
    }
  }
}

export async function runRangeSyncDirect(
  env: CloudflareEnv,
  startDate: string,
  endDate: string,
) {
  await ensureGscSchema(env)
  const sites = await env.DB.prepare(
    `SELECT id
     FROM gsc_sites
     WHERE enabled = 1`,
  ).all<{ id: string }>()

  if (!sites.results?.length) return

  const ranges = datesToRanges(listDates(startDate, endDate), RANGE_CHUNK_DAYS)
  for (const site of sites.results) {
    const rangeChunks = chunk(ranges, PARALLEL_FETCHES)
    for (const batch of rangeChunks) {
      await Promise.all(
        batch.map((range) =>
          processSyncMessage({ siteId: site.id, startDate: range.startDate, endDate: range.endDate }, env),
        ),
      )
    }
  }
}

export async function processSyncMessage(message: GscSyncMessage, env: CloudflareEnv) {
  await ensureGscSchema(env)
  await ensureSyncState(env, message.siteId)
  await markSyncRunStage(env, message.siteId, "preparing", message.startDate)
  const site = await env.DB.prepare(
    `SELECT id, owner_user_id, gsc_site_url
     FROM gsc_sites
     WHERE id = ? AND enabled = 1`,
  )
    .bind(message.siteId)
    .first<SiteRecord>()

  if (!site) return

  await syncRangeForSite(env, site, message.startDate, message.endDate)
}

export async function processSyncBatch(
  messages: GscSyncMessage[],
  env: CloudflareEnv,
): Promise<Map<string, { ok: boolean }>> {
  const results = new Map<string, { ok: boolean }>()
  await ensureGscSchema(env)

  for (const msg of messages) {
    const key = `${msg.siteId}:${msg.startDate}:${msg.endDate}`
    await ensureSyncState(env, msg.siteId)
    const site = await env.DB.prepare(
      `SELECT id, owner_user_id, gsc_site_url
       FROM gsc_sites
       WHERE id = ? AND enabled = 1`,
    )
      .bind(msg.siteId)
      .first<SiteRecord>()

    if (!site) {
      results.set(key, { ok: false })
      continue
    }

    try {
      await syncRangeForSite(env, site, msg.startDate, msg.endDate)
      results.set(key, { ok: true })
    } catch (error) {
      console.error(`Sync failed for ${msg.siteId} ${msg.startDate}-${msg.endDate}`, error)
      results.set(key, { ok: false })
    }
  }

  return results
}

async function syncRangeForSite(
  env: CloudflareEnv,
  site: SiteRecord,
  startDate: string,
  endDate: string,
) {
  try {
    await markSyncRunStage(env, site.id, "syncing", startDate)
    const apiMaxPages = readIntEnv(env, "GSC_API_MAX_PAGES", DEFAULT_API_MAX_PAGES)
    const data = await fetchSearchAnalytics(
      env,
      site.owner_user_id,
      toGscSiteUrl(site.gsc_site_url),
      startDate,
      endDate,
      { dimensions: ["date", "page", "device"], maxPages: apiMaxPages },
    )

    const rows = data.rows ?? []

    // Group rows by date for upserting into device-level and page-level tables.
    const byDatePageDevice = new Map<string, PageDeviceRow[]>()
    const byDate = new Map<string, PageRow[]>()
    for (const row of rows) {
      // keys: [date, page, device]
      const date = row.keys[0]
      const page = row.keys[1]
      if (!date || !page) continue

      const normalizedDeviceRow: PageDeviceRow = {
        page,
        device: normalizeDevice(row.keys[2]),
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      }

      const dateDeviceRows = byDatePageDevice.get(date)
      if (dateDeviceRows) {
        dateDeviceRows.push(normalizedDeviceRow)
      } else {
        byDatePageDevice.set(date, [normalizedDeviceRow])
      }
    }

    for (const [date, dateDeviceRows] of byDatePageDevice) {
      const pageMap = new Map<
        string,
        {
          clicks: number
          impressions: number
          weightedPosition: number
        }
      >()

      for (const row of dateDeviceRows) {
        const existing = pageMap.get(row.page)
        const nextClicks = (existing?.clicks ?? 0) + row.clicks
        const nextImpressions = (existing?.impressions ?? 0) + row.impressions
        const nextWeightedPosition =
          (existing?.weightedPosition ?? 0) + row.position * row.impressions
        pageMap.set(row.page, {
          clicks: nextClicks,
          impressions: nextImpressions,
          weightedPosition: nextWeightedPosition,
        })
      }

      byDate.set(
        date,
        [...pageMap.entries()].map(([pageKey, totals]) => ({
          page: pageKey,
          clicks: totals.clicks,
          impressions: totals.impressions,
          ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
          position: totals.impressions > 0 ? totals.weightedPosition / totals.impressions : 0,
        })),
      )
    }

    // Fetch query-level data
    const queryData = await fetchSearchAnalytics(
      env,
      site.owner_user_id,
      toGscSiteUrl(site.gsc_site_url),
      startDate,
      endDate,
      { dimensions: ["date", "query"], maxPages: apiMaxPages },
    )

    const queryRows = queryData.rows ?? []
    const queryByDate = new Map<string, GscRow[]>()
    for (const row of queryRows) {
      const date = row.keys[0]
      const normalizedRow = { ...row, keys: [row.keys[1]] }
      const existing = queryByDate.get(date)
      if (existing) {
        existing.push(normalizedRow)
      } else {
        queryByDate.set(date, [normalizedRow])
      }
    }

    const allDates = listDates(startDate, endDate)
    const isTruncated = Boolean(data.meta?.truncated || queryData.meta?.truncated)
    if (isTruncated) {
      const details = [
        `pageRows=${rows.length}`,
        `queryRows=${queryRows.length}`,
        `maxPages=${apiMaxPages}`,
        `rowLimit=${data.meta?.rowLimit ?? 25000}`,
      ].join(", ")
      for (const date of allDates) {
        await updateSyncState(
          env,
          site.id,
          date,
          "truncated",
          `Potentially truncated GSC data detected (${details})`,
          false,
        )
        await insertSyncLog(env, site.id, date, 0, "truncated")
        await advanceSyncRunProgress(env, site.id, date, "truncated", false)
      }
      return
    }

    // Upsert each date's rows
    for (const date of allDates) {
      const dateRows = byDate.get(date) ?? []
      const datePageDeviceRows = byDatePageDevice.get(date) ?? []
      const dateQueryRows = queryByDate.get(date) ?? []

      // GSC data can arrive with delay. For recent dates, avoid marking
      // empty page results as final success so gap-repair can retry them.
      if (dateRows.length === 0 && shouldRetryEmptyPageDate(env, date)) {
        await updateSyncState(
          env,
          site.id,
          date,
          "empty",
          "No page rows returned from GSC yet; scheduled for retry",
          true,
        )
        await insertSyncLog(env, site.id, date, 0, "empty")
        await advanceSyncRunProgress(env, site.id, date, "empty", false)
        continue
      }

      await replacePageRowsForDate(env, site.id, date, dateRows)
      await replacePageDeviceRowsForDate(env, site.id, date, datePageDeviceRows)
      await replaceQueryRowsForDate(env, site.id, date, dateQueryRows)

      await updateSyncState(env, site.id, date, "ok", null, true)
      await insertSyncLog(env, site.id, date, dateRows.length, "ok")
      await advanceSyncRunProgress(env, site.id, date, "ok", true)
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    const allDates = listDates(startDate, endDate)
    for (const date of allDates) {
      await updateSyncState(env, site.id, date, "error", messageText, false)
      await insertSyncLog(env, site.id, date, 0, "error")
      await advanceSyncRunProgress(env, site.id, date, "error", false)
    }
    throw error
  }
}

function shouldRetryEmptyPageDate(env: CloudflareEnv, date: string) {
  const retryWindowDays = readIntEnv(
    env,
    "GSC_EMPTY_PAGE_RETRY_DAYS",
    DEFAULT_EMPTY_PAGE_RETRY_DAYS,
  )
  const retryStartDate = addDays(getYesterdayUtc(), -(retryWindowDays - 1))
  return compareDates(date, retryStartDate) >= 0
}

async function upsertRows(
  env: CloudflareEnv,
  siteId: string,
  date: string,
  rows: PageRow[],
) {
  const statements = rows.map((row) =>
    env.DB.prepare(
      `INSERT INTO gsc_pages_daily
       (site_id, date, page, clicks, impressions, ctr, position, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(site_id, date, page)
       DO UPDATE SET
         clicks = excluded.clicks,
         impressions = excluded.impressions,
         ctr = excluded.ctr,
         position = excluded.position,
         synced_at = datetime('now')`,
    ).bind(
      siteId,
      date,
      row.page,
      row.clicks,
      row.impressions,
      row.ctr,
      row.position,
    ),
  )

  const chunks = chunk(statements, 200)
  for (const batch of chunks) {
    await env.DB.batch(batch)
  }
}

async function upsertPageDeviceRows(
  env: CloudflareEnv,
  siteId: string,
  date: string,
  rows: PageDeviceRow[],
) {
  const statements = rows.map((row) =>
    env.DB.prepare(
      `INSERT INTO gsc_page_device_daily
       (site_id, date, page, device, clicks, impressions, ctr, position, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(site_id, date, page, device)
       DO UPDATE SET
         clicks = excluded.clicks,
         impressions = excluded.impressions,
         ctr = excluded.ctr,
         position = excluded.position,
         synced_at = datetime('now')`,
    ).bind(
      siteId,
      date,
      row.page,
      row.device,
      row.clicks,
      row.impressions,
      row.ctr,
      row.position,
    ),
  )

  const chunks = chunk(statements, 200)
  for (const batch of chunks) {
    await env.DB.batch(batch)
  }
}

async function upsertQueryRows(
  env: CloudflareEnv,
  siteId: string,
  date: string,
  rows: GscRow[],
) {
  const statements = rows.map((row) =>
    env.DB.prepare(
      `INSERT INTO gsc_queries_daily
       (site_id, date, query, clicks, impressions, ctr, position, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(site_id, date, query)
       DO UPDATE SET
         clicks = excluded.clicks,
         impressions = excluded.impressions,
         ctr = excluded.ctr,
         position = excluded.position,
         synced_at = datetime('now')`,
    ).bind(
      siteId,
      date,
      row.keys[0],
      row.clicks,
      row.impressions,
      row.ctr,
      row.position,
    ),
  )

  const chunks = chunk(statements, 200)
  for (const batch of chunks) {
    await env.DB.batch(batch)
  }
}

function getYesterdayUtc() {
  const now = new Date()
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  utc.setUTCDate(utc.getUTCDate() - 1)
  return formatDate(utc)
}

function getSyncConfig(env: CloudflareEnv) {
  return {
    backfillDaysPerRun: readIntEnv(
      env,
      "GSC_BACKFILL_DAYS_PER_RUN",
      DEFAULT_BACKFILL_DAYS_PER_RUN,
    ),
    gapRepairDays: readIntEnv(env, "GSC_GAP_REPAIR_DAYS", DEFAULT_GAP_REPAIR_DAYS),
    gapRepairLimit: readIntEnv(
      env,
      "GSC_GAP_REPAIR_LIMIT",
      DEFAULT_GAP_REPAIR_LIMIT,
    ),
    maxEnqueueMessages: readIntEnv(
      env,
      "GSC_SYNC_MAX_ENQUEUE",
      DEFAULT_MAX_ENQUEUE_MESSAGES,
    ),
    rollingRefreshDays: readIntEnv(
      env,
      "GSC_ROLLING_REFRESH_DAYS",
      DEFAULT_ROLLING_REFRESH_DAYS,
    ),
  }
}

function readIntEnv(
  env: CloudflareEnv,
  key: keyof CloudflareEnv | string,
  fallback: number,
) {
  const source = env as unknown as Record<string, string | undefined>
  const value = typeof key === "string" ? source[key] : source[key as string]
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function ensureSyncState(env: CloudflareEnv, siteId: string) {
  await env.DB.prepare(
    `INSERT INTO gsc_sync_state (site_id, status, updated_at)
     VALUES (?, 'ok', datetime('now'))
     ON CONFLICT(site_id) DO NOTHING`,
  )
    .bind(siteId)
    .run()
}

async function beginSyncRun(env: CloudflareEnv, siteId: string, totalUnits: number) {
  await env.DB.prepare(
    `UPDATE gsc_sync_state
     SET active_run_id = ?,
         active_run_state = 'queued',
         active_run_started_at = datetime('now'),
         active_run_last_progress_at = datetime('now'),
         active_run_finished_at = NULL,
         active_run_total_units = ?,
         active_run_processed_units = 0,
         active_run_warning_count = 0,
         active_run_error_count = 0,
         active_run_queue_position = NULL,
         active_run_queue_delay_seconds = NULL,
         active_run_data_fresh_through = last_synced_date,
         active_run_current_unit = backfill_cursor_date,
         updated_at = datetime('now')
     WHERE site_id = ?`,
  )
    .bind(crypto.randomUUID(), totalUnits, siteId)
    .run()
}

async function markSyncRunStage(
  env: CloudflareEnv,
  siteId: string,
  state: "preparing" | "syncing" | "finalizing",
  currentUnit: string | null,
) {
  await env.DB.prepare(
    `UPDATE gsc_sync_state
     SET active_run_state = CASE
           WHEN active_run_id IS NULL THEN active_run_state
           WHEN active_run_finished_at IS NOT NULL THEN active_run_state
           ELSE ?
         END,
         active_run_last_progress_at = CASE
           WHEN active_run_id IS NULL OR active_run_finished_at IS NOT NULL THEN active_run_last_progress_at
           ELSE datetime('now')
         END,
         active_run_current_unit = COALESCE(?, active_run_current_unit),
         updated_at = datetime('now')
     WHERE site_id = ?`,
  )
    .bind(state, currentUnit, siteId)
    .run()
}

async function advanceSyncRunProgress(
  env: CloudflareEnv,
  siteId: string,
  currentUnit: string,
  outcome: "ok" | "empty" | "truncated" | "error",
  advanceFreshness: boolean,
) {
  const warningIncrement = outcome === "empty" || outcome === "truncated" ? 1 : 0
  const errorIncrement = outcome === "error" ? 1 : 0

  await env.DB.prepare(
    `UPDATE gsc_sync_state
     SET active_run_processed_units = CASE
           WHEN active_run_total_units IS NULL THEN active_run_processed_units
           ELSE MIN(COALESCE(active_run_total_units, 0), COALESCE(active_run_processed_units, 0) + 1)
         END,
         active_run_warning_count = COALESCE(active_run_warning_count, 0) + ?,
         active_run_error_count = COALESCE(active_run_error_count, 0) + ?,
         active_run_last_progress_at = datetime('now'),
         active_run_current_unit = ?,
         active_run_data_fresh_through = CASE
           WHEN ? = 1 AND (active_run_data_fresh_through IS NULL OR ? > active_run_data_fresh_through) THEN ?
           ELSE active_run_data_fresh_through
         END,
         active_run_state = CASE
           WHEN active_run_id IS NULL THEN active_run_state
           WHEN active_run_total_units IS NOT NULL
             AND MIN(COALESCE(active_run_total_units, 0), COALESCE(active_run_processed_units, 0) + 1) >= COALESCE(active_run_total_units, 0)
             THEN CASE
               WHEN COALESCE(active_run_error_count, 0) + ? > 0 THEN 'error'
               WHEN COALESCE(active_run_warning_count, 0) + ? > 0 THEN 'partial'
               ELSE 'success'
             END
           ELSE 'syncing'
         END,
         active_run_finished_at = CASE
           WHEN active_run_id IS NULL THEN active_run_finished_at
           WHEN active_run_total_units IS NOT NULL
             AND MIN(COALESCE(active_run_total_units, 0), COALESCE(active_run_processed_units, 0) + 1) >= COALESCE(active_run_total_units, 0)
             THEN datetime('now')
           ELSE NULL
         END,
         updated_at = datetime('now')
     WHERE site_id = ?`,
  )
    .bind(
      warningIncrement,
      errorIncrement,
      currentUnit,
      advanceFreshness ? 1 : 0,
      currentUnit,
      currentUnit,
      errorIncrement,
      warningIncrement,
      siteId,
    )
    .run()
}

async function updateSyncState(
  env: CloudflareEnv,
  siteId: string,
  date: string,
  status: string,
  errorMessage: string | null,
  advanceLastSyncedDate: boolean,
) {
  await env.DB.prepare(
    `UPDATE gsc_sync_state
     SET last_synced_date = CASE
       WHEN ? = 1 AND (last_synced_date IS NULL OR ? > last_synced_date) THEN ?
       ELSE last_synced_date
     END,
     status = ?,
     error_message = ?,
     updated_at = datetime('now')
     WHERE site_id = ?`,
  )
    .bind(advanceLastSyncedDate ? 1 : 0, date, date, status, errorMessage, siteId)
    .run()
}

async function insertSyncLog(
  env: CloudflareEnv,
  siteId: string,
  date: string,
  rows: number,
  status: string,
) {
  await env.DB.prepare(
    `INSERT INTO gsc_sync_log (site_id, date, rows, status, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  )
    .bind(siteId, date, rows, status)
    .run()
}

async function planBackfillDates(
  env: CloudflareEnv,
  siteId: string,
  yesterday: string,
  config: ReturnType<typeof getSyncConfig>,
) {
  const oldestAvailable = subtractMonths(yesterday, GSC_RETENTION_MONTHS)
  const minDateRow = await env.DB.prepare(
    `SELECT MIN(date) as min_date FROM gsc_pages_daily WHERE site_id = ?`,
  )
    .bind(siteId)
    .first<{ min_date: string | null }>()

  const backfillEnd = minDateRow?.min_date ? addDays(minDateRow.min_date, -1) : yesterday
  if (!backfillEnd || compareDates(backfillEnd, oldestAvailable) < 0) {
    await setBackfillCursor(env, siteId, null)
    return []
  }

  const state = await env.DB.prepare(
    `SELECT backfill_cursor_date FROM gsc_sync_state WHERE site_id = ?`,
  )
    .bind(siteId)
    .first<{ backfill_cursor_date: string | null }>()

  let cursor = state?.backfill_cursor_date ?? null
  if (!cursor || compareDates(cursor, oldestAvailable) < 0) {
    cursor = oldestAvailable
  }

  if (compareDates(cursor, backfillEnd) > 0) {
    await setBackfillCursor(env, siteId, null)
    return []
  }

  const end = minDate(addDays(cursor, config.backfillDaysPerRun - 1), backfillEnd)
  const dates = listDates(cursor, end)
  const nextCursor = addDays(end, 1)
  if (compareDates(nextCursor, backfillEnd) > 0) {
    await setBackfillCursor(env, siteId, null)
  } else {
    await setBackfillCursor(env, siteId, nextCursor)
  }
  return dates
}

async function setBackfillCursor(env: CloudflareEnv, siteId: string, cursor: string | null) {
  await env.DB.prepare(
    `UPDATE gsc_sync_state
     SET backfill_cursor_date = ?, updated_at = datetime('now')
     WHERE site_id = ?`,
  )
    .bind(cursor, siteId)
    .run()
}

async function filterUnsyncedDates(
  env: CloudflareEnv,
  siteId: string,
  dates: string[],
): Promise<string[]> {
  if (!dates.length) return []

  const synced = new Set<string>()
  // D1 has a SQL variable limit — batch into chunks of 50
  const batches = chunk(dates, 50)
  for (const batch of batches) {
    const placeholders = batch.map(() => "?").join(", ")
    const rows = await env.DB.prepare(
      `SELECT DISTINCT date FROM gsc_sync_log
       WHERE site_id = ? AND status = 'ok' AND date IN (${placeholders})`,
    )
      .bind(siteId, ...batch)
      .all<{ date: string }>()

    for (const r of rows.results ?? []) synced.add(r.date)
  }

  const rollingRefreshDays = readIntEnv(
    env,
    "GSC_ROLLING_REFRESH_DAYS",
    DEFAULT_ROLLING_REFRESH_DAYS,
  )
  const rollingRefreshSet = new Set(listRecentDates(getYesterdayUtc(), rollingRefreshDays))

  // Force refresh for recent dates even if previously synced as "ok".
  return dates.filter((d) => !synced.has(d) || rollingRefreshSet.has(d))
}

async function replacePageRowsForDate(
  env: CloudflareEnv,
  siteId: string,
  date: string,
  rows: PageRow[],
) {
  await env.DB.prepare(`DELETE FROM gsc_pages_daily WHERE site_id = ? AND date = ?`)
    .bind(siteId, date)
    .run()
  await upsertRows(env, siteId, date, rows)
}

async function replacePageDeviceRowsForDate(
  env: CloudflareEnv,
  siteId: string,
  date: string,
  rows: PageDeviceRow[],
) {
  await env.DB.prepare(`DELETE FROM gsc_page_device_daily WHERE site_id = ? AND date = ?`)
    .bind(siteId, date)
    .run()
  await upsertPageDeviceRows(env, siteId, date, rows)
}

async function replaceQueryRowsForDate(
  env: CloudflareEnv,
  siteId: string,
  date: string,
  rows: GscRow[],
) {
  await env.DB.prepare(`DELETE FROM gsc_queries_daily WHERE site_id = ? AND date = ?`)
    .bind(siteId, date)
    .run()
  await upsertQueryRows(env, siteId, date, rows)
}

async function findMissingDates(
  env: CloudflareEnv,
  siteId: string,
  yesterday: string,
  config: ReturnType<typeof getSyncConfig>,
) {
  const startDate = addDays(yesterday, -(config.gapRepairDays - 1))
  const rows = await env.DB.prepare(
    `WITH RECURSIVE dates(d) AS (
       SELECT ?
       UNION ALL
       SELECT date(d, '+1 day') FROM dates WHERE d < ?
     )
     SELECT d as date
     FROM dates
     LEFT JOIN gsc_sync_log l
       ON l.site_id = ? AND l.date = d AND l.status = 'ok'
     WHERE l.site_id IS NULL
     ORDER BY d DESC
     LIMIT ?`,
  )
    .bind(startDate, yesterday, siteId, config.gapRepairLimit)
    .all<{ date: string }>()

  return rows.results?.map((row) => row.date) ?? []
}

/** Group a list of date strings into contiguous ranges, capped at maxDays each */
function datesToRanges(dates: string[], maxDays: number): Array<{ startDate: string; endDate: string }> {
  if (!dates.length) return []

  const sorted = [...dates].sort()
  const ranges: Array<{ startDate: string; endDate: string }> = []
  let rangeStart = sorted[0]
  let rangeEnd = sorted[0]
  let rangeLen = 1

  for (let i = 1; i < sorted.length; i++) {
    const expected = addDays(rangeEnd, 1)
    if (sorted[i] === expected && rangeLen < maxDays) {
      rangeEnd = sorted[i]
      rangeLen++
    } else {
      ranges.push({ startDate: rangeStart, endDate: rangeEnd })
      rangeStart = sorted[i]
      rangeEnd = sorted[i]
      rangeLen = 1
    }
  }
  ranges.push({ startDate: rangeStart, endDate: rangeEnd })

  return ranges
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0")
  const day = `${date.getUTCDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function listDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  if (start > end) return []

  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(formatDate(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function compareDates(a: string, b: string) {
  return a.localeCompare(b)
}

function minDate(a: string, b: string) {
  return compareDates(a, b) <= 0 ? a : b
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(value.getTime())) return date
  value.setUTCDate(value.getUTCDate() + days)
  return formatDate(value)
}

function subtractMonths(date: string, months: number) {
  const value = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(value.getTime())) return date
  value.setUTCMonth(value.getUTCMonth() - months)
  return formatDate(value)
}

function listRecentDates(endDate: string, days: number) {
  if (days <= 0) return []
  const start = addDays(endDate, -(days - 1))
  return listDates(start, endDate)
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size))
  }
  return output
}

function normalizeDevice(raw: string | undefined) {
  const value = raw?.toLowerCase()
  if (value === "mobile" || value === "desktop" || value === "tablet") return value
  return "other"
}

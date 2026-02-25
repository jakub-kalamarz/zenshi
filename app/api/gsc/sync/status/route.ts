import { auth } from "@/lib/auth"
import { ensureGscSchema } from "@/lib/gsc-schema"
import { getRetentionBounds, getYesterdayUtcYmd } from "@/lib/gsc-analytics"
import { getCloudflareContext } from "@opennextjs/cloudflare"

function diffDaysInclusive(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T00:00:00Z`)
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return 0
  const diffMs = endDate.getTime() - startDate.getTime()
  if (diffMs < 0) return 0
  return Math.floor(diffMs / 86_400_000) + 1
}

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const yesterday = getYesterdayUtcYmd()
  const { retentionStart, retentionEnd } = getRetentionBounds(yesterday)
  const expectedDays = diffDaysInclusive(retentionStart, retentionEnd)

  const result = await env.DB.prepare(
    `WITH user_sites AS (
       SELECT id, gsc_site_url
       FROM gsc_sites
       WHERE owner_user_id = ? AND enabled = 1
     ),
     log AS (
       SELECT l.site_id,
              SUM(l.rows) AS total_rows,
              COUNT(DISTINCT CASE WHEN l.status = 'ok' THEN l.date END) AS dates_synced,
              COUNT(DISTINCT CASE WHEN l.status = 'truncated' THEN l.date END) AS truncated_dates,
              MIN(CASE WHEN l.status = 'ok' THEN l.date END) AS min_date,
              MAX(CASE WHEN l.status = 'ok' THEN l.date END) AS max_date
       FROM gsc_sync_log l
       INNER JOIN user_sites us ON us.id = l.site_id
       GROUP BY l.site_id
     )
     SELECT us.id, us.gsc_site_url,
            ss.last_synced_date, ss.status, ss.error_message, ss.updated_at,
            ss.backfill_cursor_date,
            log.total_rows, log.dates_synced, log.truncated_dates, log.min_date, log.max_date
     FROM user_sites us
     LEFT JOIN gsc_sync_state ss ON ss.site_id = us.id
     LEFT JOIN log ON log.site_id = us.id
     ORDER BY us.gsc_site_url ASC`,
  )
    .bind(session.user.id)
    .all()

  const now = Date.now()

  const statuses = (result.results ?? []).map((row: Record<string, unknown>) => {
    const updatedAt = (row.updated_at as string) ?? null
    const updatedMs = updatedAt ? new Date(updatedAt.includes("T") ? updatedAt : `${updatedAt}Z`).getTime() : 0
    const isSyncing = updatedAt ? now - updatedMs < 60_000 : false
    const syncedDaysRaw = Number(row.dates_synced ?? 0)
    const syncedDays = Number.isFinite(syncedDaysRaw) ? Math.max(0, syncedDaysRaw) : 0
    const clampedSyncedDays = Math.min(syncedDays, expectedDays)
    const remainingDays = Math.max(0, expectedDays - clampedSyncedDays)
    const syncProgressPct = expectedDays > 0 ? Math.round((clampedSyncedDays / expectedDays) * 100) : 0

    return {
      siteId: row.id as string,
      siteUrl: row.gsc_site_url as string,
      lastSyncedDate: (row.last_synced_date as string) ?? null,
      status: (row.status as string) ?? null,
      errorMessage: (row.error_message as string) ?? null,
      updatedAt,
      backfillCursorDate: (row.backfill_cursor_date as string) ?? null,
      totalRows: (row.total_rows as number) ?? 0,
      datesSynced: (row.dates_synced as number) ?? 0,
      truncatedDates: (row.truncated_dates as number) ?? 0,
      minDate: (row.min_date as string) ?? null,
      maxDate: (row.max_date as string) ?? null,
      isSyncing,
      retentionStart,
      retentionEnd,
      expectedDays,
      syncedDays: clampedSyncedDays,
      remainingDays,
      syncProgressPct,
    }
  })

  return Response.json({ statuses })
}

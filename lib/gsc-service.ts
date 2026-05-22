import { ensureGscSchema } from "@/lib/gsc-schema"
import { isBillingPro } from "@/lib/billing"
import {
  listUserGscSites,
  MissingGoogleAccountError,
  normalizeGscSiteUrl,
} from "@/lib/gsc"
import { enqueueDailySync, enqueueSyncForSite } from "@/lib/gsc-sync"
import {
  buildBucketExpression,
  computeServedRange,
  fillSeriesGaps,
  getRetentionBounds,
  getYesterdayUtcYmd,
  parseGranularity,
} from "@/lib/gsc-analytics"
import {
  clampGranularity,
  clampGranularityToAllowed,
  type Granularity,
  getAllowedGranularities,
  intersectGranularities,
} from "@/lib/gsc-granularity"
import {
  buildShareUrl,
  createDefaultExpiry,
  generateShareToken,
  normalizeExpiry,
  sanitizeShareBranding,
  sanitizeShareDefaults,
  validateScopeType,
  verifyOwnerScope,
} from "@/lib/gsc-share"

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data }
}

function err(status: number, message: string): ServiceResult<never> {
  return { ok: false, status, message }
}

function mapGscError(error: unknown): ServiceResult<never> {
  if (error instanceof MissingGoogleAccountError) {
    return err(error.status, error.message)
  }

  const message = error instanceof Error ? error.message : "GSC request failed"
  return err(500, message)
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

type DeviceMetricsRow = {
  device: string
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}

const NAME_MAX = 60
const ALLOWED_ICONS = new Set([
  "folder",
  "globe",
  "chart",
  "rocket",
  "briefcase",
  "store",
  "code",
  "megaphone",
  "money",
  "users",
  "shield",
  "wrench",
  "lightning",
  "database",
  "house",
  "target",
  "cart",
  "puzzle",
  "cloud",
  "star",
  "settings",
  "palette",
  "news",
  "health",
])
const ALLOWED_COLORS = new Set([
  "#6b7280",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
])

function normalizeName(input: string) {
  return input.trim()
}

function normalizeIcon(input?: string) {
  const icon = (input ?? "folder").trim().toLowerCase()
  return ALLOWED_ICONS.has(icon) ? icon : null
}

function normalizeColor(input?: string) {
  const color = (input ?? "#6b7280").trim().toLowerCase()
  return ALLOWED_COLORS.has(color) ? color : null
}

async function fetchSiteRows(env: CloudflareEnv, userId: string) {
  return env.DB.prepare(
    `SELECT s.id, s.gsc_site_url, s.enabled, s.created_at,
            sf.folder_id, f.name as folder_name
     FROM gsc_sites s
     LEFT JOIN gsc_site_folders sf ON sf.site_id = s.id
     LEFT JOIN gsc_folders f ON f.id = sf.folder_id
     WHERE s.owner_user_id = ?
     ORDER BY s.created_at DESC`,
  )
    .bind(userId)
    .all()
}

type DiscoveredSiteRecord = {
  id: string
  siteUrl: string
  permissionLevel: string
}

async function discoverUserSites(
  env: CloudflareEnv,
  userId: string,
): Promise<ServiceResult<{ sites: DiscoveredSiteRecord[] }>> {
  await ensureGscSchema(env)

  let remoteSites: { siteUrl: string; permissionLevel: string }[]
  try {
    remoteSites = await listUserGscSites(env, userId)
  } catch (error) {
    return mapGscError(error)
  }

  const existing = await env.DB.prepare(
    `SELECT id, gsc_site_url
     FROM gsc_sites
     WHERE owner_user_id = ?`,
  )
    .bind(userId)
    .all<{ id: string; gsc_site_url: string }>()

  const existingIdsByUrl = new Map(
    (existing.results ?? []).map((row) => [row.gsc_site_url, row.id]),
  )
  const existingSiteCount = existingIdsByUrl.size
  const isPro = await isBillingPro(env, userId)
  const discovered = new Map<string, DiscoveredSiteRecord>()

  for (const site of remoteSites) {
    const normalized = normalizeGscSiteUrl(site.siteUrl)
    if (!normalized || discovered.has(normalized)) continue
    if (!isPro && !existingIdsByUrl.has(normalized) && existingSiteCount + discovered.size >= 1) {
      continue
    }

    const id = existingIdsByUrl.get(normalized) ?? crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO gsc_sites (id, owner_user_id, gsc_site_url, enabled)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(owner_user_id, gsc_site_url)
       DO UPDATE SET enabled = 1`,
    )
      .bind(id, userId, normalized)
      .run()

    discovered.set(normalized, {
      id,
      siteUrl: normalized,
      permissionLevel: site.permissionLevel,
    })
  }

  return ok({ sites: [...discovered.values()] })
}

export async function listSites(
  env: CloudflareEnv,
  userId: string,
  refresh: boolean,
): Promise<ServiceResult<{ sites: unknown[] }>> {
  await ensureGscSchema(env)
  let existing = await fetchSiteRows(env, userId)

  if (refresh || (existing.results?.length ?? 0) === 0) {
    const discovered = await discoverUserSites(env, userId)
    if (!discovered.ok && (existing.results?.length ?? 0) === 0) return discovered
    if (discovered.ok) {
      existing = await fetchSiteRows(env, userId)
      await enqueueDailySync(env)
    }
  }

  return ok({ sites: existing.results ?? [] })
}

export async function createSite(
  env: CloudflareEnv,
  userId: string,
  siteUrl: string | null,
): Promise<ServiceResult<{ id: string; siteUrl: string }>> {
  if (!siteUrl) return err(400, "Missing siteUrl")
  await ensureGscSchema(env)
  const isPro = await isBillingPro(env, userId)
  if (!isPro) {
    const existing = await env.DB.prepare(
      `SELECT COUNT(*) as count
       FROM gsc_sites
       WHERE owner_user_id = ? AND enabled = 1`,
    )
      .bind(userId)
      .first<{ count: number | null }>()
    if ((existing?.count ?? 0) >= 1) {
      return err(402, "Zenshi Pro is required to add more than 1 site.")
    }
  }
  let availableSites: { siteUrl: string; permissionLevel: string }[]
  try {
    availableSites = await listUserGscSites(env, userId)
  } catch (error) {
    return mapGscError(error)
  }

  const normalized = normalizeGscSiteUrl(siteUrl)
  if (!normalized) return err(400, "Invalid siteUrl")

  const allowedSet = new Set(
    availableSites
      .map((site) => normalizeGscSiteUrl(site.siteUrl))
      .filter((value): value is string => Boolean(value)),
  )
  const isAllowed = allowedSet.has(normalized)
  if (!isAllowed) return err(403, "Site not accessible in GSC")

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO gsc_sites (id, owner_user_id, gsc_site_url, enabled)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(owner_user_id, gsc_site_url)
     DO UPDATE SET enabled = 1`,
  )
    .bind(id, userId, normalized)
    .run()

  await enqueueSyncForSite(env, id)
  return ok({ id, siteUrl: normalized })
}

export async function updateSiteFolder(
  env: CloudflareEnv,
  userId: string,
  siteId: string | null,
  folderId: string | null,
): Promise<ServiceResult<{ ok: true }>> {
  if (!siteId) return err(400, "Missing siteId")
  await ensureGscSchema(env)
  const site = await env.DB.prepare(
    `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(siteId, userId)
    .first()

  if (!site) return err(404, "Site not found")

  if (!folderId) {
    await env.DB.prepare(
      `DELETE FROM gsc_site_folders WHERE site_id = ?`,
    )
      .bind(siteId)
      .run()
    return ok({ ok: true })
  }

  const folder = await env.DB.prepare(
    `SELECT id FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(folderId, userId)
    .first()

  if (!folder) return err(404, "Folder not found")

  await env.DB.prepare(
    `INSERT INTO gsc_site_folders (site_id, folder_id, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(site_id) DO UPDATE SET
       folder_id = excluded.folder_id,
       updated_at = datetime('now')`,
  )
    .bind(siteId, folderId)
    .run()

  return ok({ ok: true })
}

export async function listFolders(
  env: CloudflareEnv,
  userId: string,
): Promise<ServiceResult<{ folders: unknown[] }>> {
  await ensureGscSchema(env)
  const folders = await env.DB.prepare(
    `SELECT id, name, icon, color, created_at, updated_at
     FROM gsc_folders
     WHERE owner_user_id = ?
     ORDER BY name ASC`,
  )
    .bind(userId)
    .all()
  return ok({ folders: folders.results ?? [] })
}

export async function createFolder(
  env: CloudflareEnv,
  userId: string,
  payload: { name?: string; icon?: string; color?: string } | null,
): Promise<ServiceResult<{ id: string; name: string; icon: string; color: string }>> {
  const name = normalizeName(payload?.name ?? "")
  const icon = normalizeIcon(payload?.icon)
  const color = normalizeColor(payload?.color)
  if (!name || name.length > NAME_MAX) return err(400, "Invalid name")
  if (!icon || !color) return err(400, "Invalid icon or color")

  await ensureGscSchema(env)
  const existing = await env.DB.prepare(
    `SELECT id FROM gsc_folders
     WHERE owner_user_id = ? AND lower(name) = lower(?)`,
  )
    .bind(userId, name)
    .first()

  if (existing) return err(409, "Folder name already exists")

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO gsc_folders (id, owner_user_id, name, icon, color)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, name, icon, color)
    .run()

  return ok({ id, name, icon, color })
}

export async function updateFolder(
  env: CloudflareEnv,
  userId: string,
  payload: { folderId?: string; name?: string; icon?: string; color?: string } | null,
): Promise<ServiceResult<{ ok: true }>> {
  const folderId = payload?.folderId?.trim()
  const name = normalizeName(payload?.name ?? "")
  const icon = normalizeIcon(payload?.icon)
  const color = normalizeColor(payload?.color)

  if (!folderId || !name || name.length > NAME_MAX) {
    return err(400, "Invalid request")
  }
  if (!icon || !color) {
    return err(400, "Invalid icon or color")
  }

  await ensureGscSchema(env)
  const folder = await env.DB.prepare(
    `SELECT id FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(folderId, userId)
    .first()

  if (!folder) return err(404, "Folder not found")

  const existing = await env.DB.prepare(
    `SELECT id FROM gsc_folders
     WHERE owner_user_id = ? AND lower(name) = lower(?) AND id != ?`,
  )
    .bind(userId, name, folderId)
    .first()

  if (existing) return err(409, "Folder name already exists")

  await env.DB.prepare(
    `UPDATE gsc_folders
     SET name = ?, icon = ?, color = ?, updated_at = datetime('now')
     WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(name, icon, color, folderId, userId)
    .run()

  return ok({ ok: true })
}

export async function deleteFolder(
  env: CloudflareEnv,
  userId: string,
  folderId: string | null,
): Promise<ServiceResult<{ ok: true }>> {
  if (!folderId) return err(400, "Missing folderId")

  await ensureGscSchema(env)
  const folder = await env.DB.prepare(
    `SELECT id FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(folderId, userId)
    .first()

  if (!folder) return err(404, "Folder not found")

  await env.DB.prepare(
    `DELETE FROM gsc_site_folders WHERE folder_id = ?`,
  )
    .bind(folderId)
    .run()

  await env.DB.prepare(
    `DELETE FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(folderId, userId)
    .run()

  return ok({ ok: true })
}

export async function listShares(
  env: CloudflareEnv,
  userId: string,
  request: Request,
): Promise<ServiceResult<{ shares: unknown[] }>> {
  await ensureGscSchema(env)
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM gsc_share_branding
       WHERE share_id IN (
         SELECT id
         FROM gsc_share_links
         WHERE owner_user_id = ?
           AND status = 'revoked'
       )`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_share_links
       WHERE owner_user_id = ?
         AND status = 'revoked'`,
    ).bind(userId),
  ])

  const rows = await env.DB.prepare(
    `SELECT
       s.id,
       s.scope_type,
       s.scope_id,
       s.status,
       s.expires_at,
       s.created_at,
       s.revoked_at,
       s.last_accessed_at,
       s.default_start,
       s.default_end,
       s.default_compare_mode,
       s.default_compare_start,
       s.default_compare_end,
       s.default_granularity,
       s.token,
       b.brand_name,
       b.logo_url,
       b.favicon_url,
       b.accent_color,
       b.header_bg_color,
       b.text_color,
       b.show_powered_by,
       site.gsc_site_url AS site_label,
       folder.name AS folder_label
     FROM gsc_share_links s
     LEFT JOIN gsc_share_branding b ON b.share_id = s.id
     LEFT JOIN gsc_sites site ON s.scope_type = 'site' AND site.id = s.scope_id
     LEFT JOIN gsc_folders folder ON s.scope_type = 'folder' AND folder.id = s.scope_id
     WHERE s.owner_user_id = ?
       AND s.status != 'revoked'
     ORDER BY s.created_at DESC`,
  )
    .bind(userId)
    .all<Record<string, unknown>>()

  const results = (rows.results ?? []).map((row) => ({
    ...row,
    shareUrl: row.token ? buildShareUrl(request, row.token as string) : null,
  }))

  return ok({ shares: results })
}

export async function createShare(
  env: CloudflareEnv,
  userId: string,
  request: Request,
  payload: {
    scopeType?: unknown
    scopeId?: unknown
    expiresAt?: unknown
    branding?: unknown
    defaults?: unknown
  } | null,
): Promise<ServiceResult<{ id: string; scopeType: string; scopeId: string; expiresAt: string; shareUrl: string }>> {
  const scopeType = validateScopeType(payload?.scopeType)
  const scopeId = typeof payload?.scopeId === "string" ? payload.scopeId.trim() : ""
  if (!scopeType || !scopeId) return err(400, "Invalid scope")

  await ensureGscSchema(env)
  const ownedScope = await verifyOwnerScope(env, userId, scopeType, scopeId)
  if (!ownedScope) return err(404, "Scope not found")

  const existing = await env.DB.prepare(
    `SELECT id, scope_type, scope_id, token, expires_at
     FROM gsc_share_links
     WHERE owner_user_id = ?
       AND scope_type = ?
       AND scope_id = ?
       AND status = 'active'
       AND expires_at > datetime('now')
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(userId, scopeType, scopeId)
    .first<{ id: string; scope_type: string; scope_id: string; token: string; expires_at: string }>()

  if (existing?.token) {
    return ok({
      id: existing.id,
      scopeType: existing.scope_type,
      scopeId: existing.scope_id,
      expiresAt: existing.expires_at,
      shareUrl: buildShareUrl(request, existing.token),
    })
  }

  const branding = sanitizeShareBranding(payload?.branding)
  const defaults = payload?.defaults !== undefined ? sanitizeShareDefaults(payload.defaults) : null
  const persistedCompareMode = defaults?.compareMode ?? "disabled"
  const persistedGranularity = defaults?.granularity ?? "day"
  const expiresAtIso = normalizeExpiry(payload?.expiresAt) ?? createDefaultExpiry()

  const { rawToken, tokenHash } = await generateShareToken()
  const shareId = crypto.randomUUID()

  await env.DB.prepare(
    `INSERT INTO gsc_share_links (
       id,
       owner_user_id,
       scope_type,
       scope_id,
       token,
       token_hash,
       status,
       expires_at,
       default_start,
       default_end,
       default_compare_mode,
       default_compare_start,
       default_compare_end,
       default_granularity
     ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      shareId,
      userId,
      scopeType,
      scopeId,
      rawToken,
      tokenHash,
      expiresAtIso,
      defaults?.start ?? null,
      defaults?.end ?? null,
      persistedCompareMode,
      defaults?.compareStart ?? null,
      defaults?.compareEnd ?? null,
      persistedGranularity,
    )
    .run()

  await env.DB.prepare(
    `INSERT INTO gsc_share_branding (
       share_id,
       brand_name,
       logo_url,
       favicon_url,
       accent_color,
       header_bg_color,
       text_color,
       show_powered_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      shareId,
      branding.brandName,
      branding.logoUrl,
      branding.faviconUrl,
      branding.accentColor,
      branding.headerBgColor,
      branding.textColor,
      branding.showPoweredBy ? 1 : 0,
    )
    .run()

  return ok({
    id: shareId,
    scopeType,
    scopeId,
    expiresAt: expiresAtIso,
    shareUrl: buildShareUrl(request, rawToken),
  })
}

export async function updateShare(
  env: CloudflareEnv,
  userId: string,
  payload: {
    shareId?: string
    status?: unknown
    expiresAt?: unknown
    branding?: unknown
    defaults?: unknown
  } | null,
): Promise<ServiceResult<{ ok: true }>> {
  const shareId = payload?.shareId?.trim()
  if (!shareId) return err(400, "Missing shareId")

  await ensureGscSchema(env)
  const existing = await env.DB.prepare(
    `SELECT id FROM gsc_share_links WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(shareId, userId)
    .first()

  if (!existing) return err(404, "Share not found")

  const expiresAt = normalizeExpiry(payload?.expiresAt)
  const defaults = sanitizeShareDefaults(payload?.defaults)
  const status = payload?.status === "active" || payload?.status === "revoked" ? payload.status : null

  await env.DB.prepare(
    `UPDATE gsc_share_links
     SET
       status = COALESCE(?, status),
       expires_at = COALESCE(?, expires_at),
       default_start = COALESCE(?, default_start),
       default_end = COALESCE(?, default_end),
       default_compare_mode = COALESCE(?, default_compare_mode),
       default_compare_start = COALESCE(?, default_compare_start),
       default_compare_end = COALESCE(?, default_compare_end),
       default_granularity = COALESCE(?, default_granularity),
       revoked_at = CASE
         WHEN ? = 'revoked' THEN datetime('now')
         WHEN ? = 'active' THEN NULL
         ELSE revoked_at
       END
     WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(
      status,
      expiresAt,
      defaults.start,
      defaults.end,
      defaults.compareMode,
      defaults.compareStart,
      defaults.compareEnd,
      defaults.granularity,
      status,
      status,
      shareId,
      userId,
    )
    .run()

  if (payload?.branding !== undefined) {
    const branding = sanitizeShareBranding(payload.branding)
    await env.DB.prepare(
      `INSERT INTO gsc_share_branding (
         share_id,
         brand_name,
         logo_url,
         favicon_url,
         accent_color,
         header_bg_color,
         text_color,
         show_powered_by,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(share_id) DO UPDATE SET
         brand_name = excluded.brand_name,
         logo_url = excluded.logo_url,
         favicon_url = excluded.favicon_url,
         accent_color = excluded.accent_color,
         header_bg_color = excluded.header_bg_color,
         text_color = excluded.text_color,
         show_powered_by = excluded.show_powered_by,
         updated_at = datetime('now')`,
    )
      .bind(
        shareId,
        branding.brandName,
        branding.logoUrl,
        branding.faviconUrl,
        branding.accentColor,
        branding.headerBgColor,
        branding.textColor,
        branding.showPoweredBy ? 1 : 0,
      )
      .run()
  }

  return ok({ ok: true })
}

export async function deleteShare(
  env: CloudflareEnv,
  userId: string,
  shareId: string | null,
): Promise<ServiceResult<{ ok: true }>> {
  if (!shareId) return err(400, "Missing shareId")
  await ensureGscSchema(env)

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM gsc_share_branding
       WHERE share_id = ?
         AND EXISTS (
           SELECT 1
           FROM gsc_share_links
           WHERE id = ?
             AND owner_user_id = ?
         )`,
    ).bind(shareId, shareId, userId),
    env.DB.prepare(
      `DELETE FROM gsc_share_links
       WHERE id = ?
         AND owner_user_id = ?`,
    ).bind(shareId, userId),
  ])

  return ok({ ok: true })
}

export async function getPagesData(
  env: CloudflareEnv,
  userId: string,
  params: {
    siteId: string | null
    start: string | null
    end: string | null
    compareStart?: string | null
    compareEnd?: string | null
    granularity?: string | null
    limit?: number | null
  },
): Promise<ServiceResult<Record<string, unknown>>> {
  const siteId = params.siteId?.trim()
  const start = params.start?.trim()
  const end = params.end?.trim()
  const granularity = parseGranularity(params.granularity ?? null)
  const limit = Math.min(Number(params.limit || 200), 1000)

  if (!siteId || !start || !end) return err(400, "Missing siteId/start/end")

  await ensureGscSchema(env)
  const [ownerResult, lastAvailableResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
    ).bind(siteId, userId),
    env.DB.prepare(
      `SELECT MAX(date) AS lastDate FROM gsc_pages_daily WHERE site_id = ?`,
    ).bind(siteId),
  ])
  const owner = (ownerResult.results[0] as Record<string, unknown> | undefined) ?? null
  if (!owner) return err(404, "Not found")

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

  const compareStart = params.compareStart?.trim()
  const compareEnd = params.compareEnd?.trim()
  const retention = getRetentionBounds()

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

    return ok({
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

  return ok({
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

export async function getQueriesData(
  env: CloudflareEnv,
  userId: string,
  params: {
    siteId: string | null
    start: string | null
    end: string | null
    compareStart?: string | null
    compareEnd?: string | null
    granularity?: string | null
    limit?: number | null
  },
): Promise<ServiceResult<Record<string, unknown>>> {
  const siteId = params.siteId?.trim()
  const start = params.start?.trim()
  const end = params.end?.trim()
  const granularity = parseGranularity(params.granularity ?? null)
  const limit = Math.min(Number(params.limit || 200), 1000)

  if (!siteId || !start || !end) return err(400, "Missing siteId/start/end")

  await ensureGscSchema(env)
  const [ownerResult, lastAvailableResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
    ).bind(siteId, userId),
    env.DB.prepare(
      `SELECT MAX(date) AS lastDate FROM gsc_queries_daily WHERE site_id = ?`,
    ).bind(siteId),
  ])
  const owner = (ownerResult.results[0] as Record<string, unknown> | undefined) ?? null
  if (!owner) return err(404, "Not found")

  const lastAvailable =
    (lastAvailableResult.results[0] as { lastDate?: string | null } | undefined) ?? null
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

  const compareStart = params.compareStart?.trim()
  const compareEnd = params.compareEnd?.trim()
  const retention = getRetentionBounds()

  if (compareStart && compareEnd) {
    const compareServed = computeServedRange(compareStart, compareEnd, lastDateValue)
    const compareResult = await env.DB.prepare(aggregationSql)
      .bind(siteId, compareServed.effectiveStart, compareServed.effectiveEnd, limit)
      .all()

    const primaryRows = (result.results ?? []) as QueryMetricsRow[]
    const compareRows = (compareResult.results ?? []) as QueryMetricsRow[]
    const compareMap = new Map(compareRows.map((row) => [row.query, row]))

    const queries = primaryRows.map((row) => {
      const cmp = compareMap.get(row.query)
      return {
        ...row,
        compareClicks: cmp?.clicks ?? null,
        compareImpressions: cmp?.impressions ?? null,
        compareCtr: cmp?.ctr ?? null,
        comparePosition: cmp?.position ?? null,
      }
    })

    return ok({
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
    })
  }

  return ok({
    queries: (result.results ?? []) as QueryMetricsRow[],
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

export async function getDevicesData(
  env: CloudflareEnv,
  userId: string,
  params: {
    siteId: string | null
    start: string | null
    end: string | null
    compareStart?: string | null
    compareEnd?: string | null
    granularity?: string | null
    limit?: number | null
  },
): Promise<ServiceResult<Record<string, unknown>>> {
  const siteId = params.siteId?.trim()
  const start = params.start?.trim()
  const end = params.end?.trim()
  const granularity = parseGranularity(params.granularity ?? null)
  const limit = Math.min(Number(params.limit || 200), 1000)

  if (!siteId || !start || !end) return err(400, "Missing siteId/start/end")

  await ensureGscSchema(env)
  const [ownerResult, lastAvailableResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
    ).bind(siteId, userId),
    env.DB.prepare(
      `SELECT MAX(date) AS lastDate FROM gsc_page_device_daily WHERE site_id = ?`,
    ).bind(siteId),
  ])
  const owner = (ownerResult.results[0] as Record<string, unknown> | undefined) ?? null
  if (!owner) return err(404, "Not found")

  const lastAvailable =
    (lastAvailableResult.results[0] as { lastDate?: string | null } | undefined) ?? null
  const lastDateValue = typeof lastAvailable?.lastDate === "string" ? lastAvailable.lastDate : null
  const { effectiveStart: servedStart, effectiveEnd: servedEnd } = computeServedRange(
    start,
    end,
    lastDateValue,
  )

  const aggregationSql = `SELECT
       device,
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
     FROM gsc_page_device_daily
     WHERE site_id = ?
       AND date >= ?
       AND date <= ?
     GROUP BY device
     ORDER BY clicks DESC
     LIMIT ?`

  const result = await env.DB.prepare(aggregationSql)
    .bind(siteId, servedStart, servedEnd, limit)
    .all()

  const compareStart = params.compareStart?.trim()
  const compareEnd = params.compareEnd?.trim()
  const retention = getRetentionBounds()

  if (compareStart && compareEnd) {
    const compareServed = computeServedRange(compareStart, compareEnd, lastDateValue)
    const compareResult = await env.DB.prepare(aggregationSql)
      .bind(siteId, compareServed.effectiveStart, compareServed.effectiveEnd, limit)
      .all()

    const primaryRows = (result.results ?? []) as DeviceMetricsRow[]
    const compareRows = (compareResult.results ?? []) as DeviceMetricsRow[]
    const compareMap = new Map(compareRows.map((row) => [row.device, row]))

    const devices = primaryRows.map((row) => {
      const cmp = compareMap.get(row.device)
      return {
        ...row,
        compareClicks: cmp?.clicks ?? null,
        compareImpressions: cmp?.impressions ?? null,
        compareCtr: cmp?.ctr ?? null,
        comparePosition: cmp?.position ?? null,
      }
    })

    return ok({
      devices,
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

  return ok({
    devices: (result.results ?? []) as DeviceMetricsRow[],
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

export async function getSiteCardData(
  env: CloudflareEnv,
  userId: string,
  params: { siteId: string | null; start: string | null; end: string | null; compareStart?: string | null; compareEnd?: string | null; granularity?: string | null },
): Promise<ServiceResult<Record<string, unknown>>> {
  const siteId = params.siteId?.trim()
  const start = params.start?.trim()
  const end = params.end?.trim()
  const requestedGranularity = parseGranularity(params.granularity ?? null)

  if (!siteId || !start || !end) return err(400, "Missing siteId/start/end")

  await ensureGscSchema(env)
  const [ownerResult, lastAvailableResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
    ).bind(siteId, userId),
    env.DB.prepare(
      `SELECT MAX(date) AS lastDate
       FROM gsc_pages_daily
       WHERE site_id = ?`,
    ).bind(siteId),
  ])
  const owner = (ownerResult.results[0] as Record<string, unknown> | undefined) ?? null
  if (!owner) return err(404, "Not found")

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

  let compareTotal: Record<string, unknown> | null = null
  let compareSeries: Array<Record<string, unknown>> = []
  const compareStart = params.compareStart?.trim()
  const compareEnd = params.compareEnd?.trim()

  if (compareStart && compareEnd) {
    const compareTotalsResult = await env.DB.prepare(
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
      .bind(siteId, compareStart, compareEnd)
      .first<Record<string, unknown>>()

    const compareSeriesResult = await env.DB.prepare(
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
      .bind(siteId, compareStart, compareEnd)
      .all()

    compareTotal = compareTotalsResult ?? null
    compareSeries = fillSeriesGaps(compareSeriesResult.results ?? [], compareStart, compareEnd, granularity)
  }

  return ok({
    total: totals ?? null,
    series: filledSeries.length > 0 ? filledSeries : (series.results ?? []),
    compareTotal,
    compareSeries,
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

export type SiteCardsRequestBody = {
  siteIds: string[]
  start: string
  end: string
  compareStart: string | null
  compareEnd: string | null
  debug: boolean
  granularity: string | null
}

export function parseSiteCardsRequest(raw: unknown): SiteCardsRequestBody | null {
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

export async function getSiteCardsData(
  env: CloudflareEnv,
  userId: string,
  body: SiteCardsRequestBody,
): Promise<ServiceResult<Record<string, unknown>>> {
  const { siteIds, start, end, compareStart, compareEnd, debug } = body
  const requestedGranularity = parseGranularity(body.granularity)

  if (siteIds.length === 0) return ok({ results: {} })
  await ensureGscSchema(env)

  const placeholders = siteIds.map(() => "?").join(",")
  const ownedSites = await env.DB.prepare(
    `SELECT id FROM gsc_sites WHERE id IN (${placeholders}) AND owner_user_id = ?`,
  )
    .bind(...siteIds, userId)
    .all()

  const ownedIds = new Set(ownedSites.results.map((r) => r.id as string))
  const targetIds = siteIds.filter((id) => ownedIds.has(id))

  if (targetIds.length === 0) return ok({ results: {} })

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
    const total = allData[idx++].results[0] || null
    const seriesResults = allData[idx++].results || []

    let compareTotal = null
    let compareSeriesResults: Array<Record<string, unknown>> = []

    if (compareStart && compareEnd) {
      compareTotal = allData[idx++].results[0] || null
      compareSeriesResults = (allData[idx++].results || []) as Array<Record<string, unknown>>
    }

    const filledSeries = fillSeriesGaps(
      seriesResults as Array<Record<string, unknown>>,
      site.effectiveStartStr,
      site.effectiveEndStr,
      granularity,
    )

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

  if (debug) return ok({ results, debug: debugResults })
  return ok({ results })
}

export async function enqueueSync(
  env: CloudflareEnv,
  userId: string,
  siteId: string | null,
): Promise<ServiceResult<{ ok: true; siteId: string; daysQueued: number }>> {
  if (!siteId) return err(400, "Missing siteId")
  await ensureGscSchema(env)

  const owner = await env.DB.prepare(
    `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(siteId, userId)
    .first()

  if (!owner) return err(404, "Not found")

  const daysQueued = await enqueueSyncForSite(env, siteId)
  return ok({ ok: true, siteId, daysQueued })
}

type ReseedCandidateRow = {
  id: string
  gsc_site_url: string
  active_run_id: string | null
  active_run_finished_at: string | null
  last_synced_date: string | null
  dates_synced: number | null
  total_rows: number | null
}

function hasSeededData(row: ReseedCandidateRow) {
  return Boolean(row.last_synced_date) || Number(row.dates_synced ?? 0) > 0 || Number(row.total_rows ?? 0) > 0
}

function hasPendingRun(row: ReseedCandidateRow) {
  return Boolean(row.active_run_id) && row.active_run_finished_at === null
}

async function listReseedCandidates(
  env: CloudflareEnv,
  userId: string,
) {
  return env.DB.prepare(
    `WITH log AS (
       SELECT l.site_id,
              SUM(l.rows) AS total_rows,
              COUNT(DISTINCT CASE WHEN l.status = 'ok' THEN l.date END) AS dates_synced
       FROM gsc_sync_log l
       INNER JOIN gsc_sites s ON s.id = l.site_id
       WHERE s.owner_user_id = ?
       GROUP BY l.site_id
     )
     SELECT s.id, s.gsc_site_url,
            ss.active_run_id, ss.active_run_finished_at, ss.last_synced_date,
            log.dates_synced, log.total_rows
     FROM gsc_sites s
     LEFT JOIN gsc_sync_state ss ON ss.site_id = s.id
     LEFT JOIN log ON log.site_id = s.id
     WHERE s.owner_user_id = ?
       AND s.enabled = 1
     ORDER BY s.gsc_site_url ASC`,
  )
    .bind(userId, userId)
    .all<ReseedCandidateRow>()
}

export async function reseedAccountDashboardData(
  env: CloudflareEnv,
  userId: string,
): Promise<ServiceResult<{
  ok: true
  discoveredSites: number
  eligibleSites: number
  queuedSites: number
  queuedSiteIds: string[]
  queuedDays: number
  skippedRunningSites: number
  skippedReadySites: number
}>> {
  const discovered = await discoverUserSites(env, userId)
  if (!discovered.ok) return discovered

  const candidates = await listReseedCandidates(env, userId)
  const rows = candidates.results ?? []
  const queuedSiteIds: string[] = []
  let queuedDays = 0
  let skippedRunningSites = 0
  let skippedReadySites = 0

  for (const row of rows) {
    if (hasPendingRun(row)) {
      skippedRunningSites += 1
      continue
    }

    if (hasSeededData(row)) {
      skippedReadySites += 1
      continue
    }

    const daysQueued = await enqueueSyncForSite(env, row.id)
    if (daysQueued > 0) {
      queuedSiteIds.push(row.id)
      queuedDays += daysQueued
    }
  }

  return ok({
    ok: true,
    discoveredSites: discovered.data.sites.length,
    eligibleSites: Math.max(0, rows.length - skippedRunningSites - skippedReadySites),
    queuedSites: queuedSiteIds.length,
    queuedSiteIds,
    queuedDays,
    skippedRunningSites,
    skippedReadySites,
  })
}

export async function resetAccountDashboardData(
  env: CloudflareEnv,
  userId: string,
): Promise<ServiceResult<{ ok: true }>> {
  await ensureGscSchema(env)

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM gsc_share_branding
       WHERE share_id IN (
         SELECT id
         FROM gsc_share_links
         WHERE owner_user_id = ?
       )`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_share_links
       WHERE owner_user_id = ?`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_user_preferences
       WHERE user_id = ?`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_site_folders
       WHERE site_id IN (
         SELECT id
         FROM gsc_sites
         WHERE owner_user_id = ?
       )`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_pages_daily
       WHERE site_id IN (
         SELECT id
         FROM gsc_sites
         WHERE owner_user_id = ?
       )`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_page_device_daily
       WHERE site_id IN (
         SELECT id
         FROM gsc_sites
         WHERE owner_user_id = ?
       )`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_queries_daily
       WHERE site_id IN (
         SELECT id
         FROM gsc_sites
         WHERE owner_user_id = ?
       )`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_sync_log
       WHERE site_id IN (
         SELECT id
         FROM gsc_sites
         WHERE owner_user_id = ?
       )`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_sync_state
       WHERE site_id IN (
         SELECT id
         FROM gsc_sites
         WHERE owner_user_id = ?
       )`,
    ).bind(userId),
    env.DB.prepare(
      `DELETE FROM gsc_folders
       WHERE owner_user_id = ?`,
    ).bind(userId),
  ])

  return ok({ ok: true })
}

function diffDaysInclusive(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T00:00:00Z`)
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return 0
  const diffMs = endDate.getTime() - startDate.getTime()
  if (diffMs < 0) return 0
  return Math.floor(diffMs / 86_400_000) + 1
}

type SyncStatusRow = Record<string, unknown>

type SyncRunView = {
  runId: string
  state: string
  progressPercent: number
  processedUnits: number
  totalUnits: number
  unitLabel: "days"
  currentUnit: string | null
  dataFreshThrough: string | null
  etaSeconds: number | null
  startedAt: string | null
  lastProgressAt: string | null
  finishedAt: string | null
  queuePosition: number | null
  queueDelaySeconds: number | null
  stallState: "normal" | "delayed" | "stalled"
  stallReason: string | null
  errorMessage: string | null
}

type SyncStatusPhase = "idle" | "bootstrapping" | "syncing" | "ready" | "error"

type SyncStatusView = {
  siteId: string
  siteUrl: string
  lastSyncedDate: string | null
  status: string | null
  errorMessage: string | null
  updatedAt: string | null
  backfillCursorDate: string | null
  totalRows: number
  datesSynced: number
  truncatedDates: number
  minDate: string | null
  maxDate: string | null
  isSyncing: boolean
  retentionStart: string
  retentionEnd: string
  expectedDays: number
  syncedDays: number
  remainingDays: number
  syncProgressPct: number
  activeRun: SyncRunView | null
  lastCompletedRun: SyncRunView | null
  lastSuccessfulDataFreshThrough: string | null
  lastVisibleDataUpdatedAt: string | null
  healthSummary: "healthy" | "delayed" | "stalled" | "partial" | "error"
  phase: SyncStatusPhase
  hasData: boolean
  needsReseed: boolean
  bootstrapProgress: number | null
}

function asFiniteInt(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.trunc(parsed)
}

function parseDateMs(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return null
  const normalized = value.includes("T") ? value : `${value}Z`
  const ms = new Date(normalized).getTime()
  return Number.isFinite(ms) ? ms : null
}

function deriveStallState(
  lastProgressMs: number | null,
  nowMs: number,
  state: string | null,
): SyncRunView["stallState"] {
  if (state === "queued") return "normal"
  if (!lastProgressMs) return "normal"
  const ageMs = nowMs - lastProgressMs
  if (ageMs >= 5 * 60_000) return "stalled"
  if (ageMs >= 90_000) return "delayed"
  return "normal"
}

function deriveEtaSeconds(
  startedAtMs: number | null,
  processedUnits: number,
  totalUnits: number,
  state: string,
  nowMs: number,
) {
  if (!startedAtMs || processedUnits <= 0 || totalUnits <= processedUnits) return null
  if (!["preparing", "syncing", "finalizing"].includes(state)) return null
  const elapsedSeconds = Math.max(1, Math.round((nowMs - startedAtMs) / 1000))
  const unitsPerSecond = processedUnits / elapsedSeconds
  if (!Number.isFinite(unitsPerSecond) || unitsPerSecond <= 0) return null
  return Math.max(1, Math.round((totalUnits - processedUnits) / unitsPerSecond))
}

function deriveSyncPhase(args: {
  activeRun: SyncRunView | null
  lastCompletedRun: SyncRunView | null
  status: string | null
  hasData: boolean
}): SyncStatusPhase {
  if (args.activeRun) {
    return args.hasData ? "syncing" : "bootstrapping"
  }

  if (args.lastCompletedRun?.state === "error" || args.status === "error") {
    return args.hasData ? "ready" : "error"
  }

  if (!args.hasData) return "idle"
  return "ready"
}

function buildAccountSyncSummary(statuses: SyncStatusView[]) {
  const hasAnySites = statuses.length > 0
  const activeStatuses = statuses.filter((status) => status.activeRun?.state && status.activeRun.state !== "queued")
  const queuedStatuses = statuses.filter((status) => status.activeRun?.state === "queued")
  const bootstrappingStatuses = statuses.filter((status) => status.phase === "bootstrapping" || (status.needsReseed && !status.hasData))
  const needsReseedSites = statuses.filter((status) => status.needsReseed).length
  const readySites = statuses.filter((status) => status.phase === "ready").length
  const attentionSites = statuses.filter((status) => status.healthSummary !== "healthy").length
  const progressValues = bootstrappingStatuses
    .map((status) => status.bootstrapProgress)
    .filter((value): value is number => value !== null)
  const bootstrapProgress = progressValues.length > 0
    ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
    : null

  let phase: SyncStatusPhase = "idle"
  if (bootstrappingStatuses.some((status) => status.activeRun !== null)) {
    phase = "bootstrapping"
  } else if (activeStatuses.length > 0 || queuedStatuses.some((status) => status.hasData)) {
    phase = "syncing"
  } else if (hasAnySites && needsReseedSites === 0) {
    phase = attentionSites > 0 && readySites === 0 ? "error" : "ready"
  }

  return {
    phase,
    hasAnySites,
    needsReseed: needsReseedSites > 0,
    totalSites: statuses.length,
    activeSites: activeStatuses.length,
    queuedSites: queuedStatuses.length,
    readySites,
    needsReseedSites,
    attentionSites,
    bootstrapProgress,
  }
}

export function buildSyncStatusView(
  row: SyncStatusRow,
  options: {
    expectedDays: number
    retentionStart: string
    retentionEnd: string
    nowMs?: number
  },
) {
  const nowMs = options.nowMs ?? Date.now()
  const updatedAt = (row.updated_at as string) ?? null
  const syncedDays = Math.min(options.expectedDays, Math.max(0, asFiniteInt(row.dates_synced)))
  const remainingDays = Math.max(0, options.expectedDays - syncedDays)
  const syncProgressPct = options.expectedDays > 0 ? Math.round((syncedDays / options.expectedDays) * 100) : 0
  const lastSuccessfulDataFreshThrough =
    (row.last_synced_date as string) ??
    (row.max_date as string) ??
    null

  const runId = typeof row.active_run_id === "string" && row.active_run_id.length > 0
    ? row.active_run_id
    : null
  const runState = typeof row.active_run_state === "string" && row.active_run_state.length > 0
    ? row.active_run_state
    : null
  const startedAt = (row.active_run_started_at as string) ?? null
  const lastProgressAt = (row.active_run_last_progress_at as string) ?? updatedAt
  const finishedAt = (row.active_run_finished_at as string) ?? null
  const totalUnits = Math.max(0, asFiniteInt(row.active_run_total_units))
  const processedUnits = Math.max(0, Math.min(totalUnits || Number.MAX_SAFE_INTEGER, asFiniteInt(row.active_run_processed_units)))
  const stallState = deriveStallState(parseDateMs(lastProgressAt), nowMs, runState)
  const queuePosition = row.active_run_queue_position == null ? null : asFiniteInt(row.active_run_queue_position)
  const queueDelaySeconds = row.active_run_queue_delay_seconds == null ? null : asFiniteInt(row.active_run_queue_delay_seconds)
  const activeRunDataFreshThrough =
    (row.active_run_data_fresh_through as string) ??
    lastSuccessfulDataFreshThrough
  const currentUnit =
    (row.active_run_current_unit as string) ??
    (row.backfill_cursor_date as string) ??
    null
  const errorMessage = (row.error_message as string) ?? null

  const runView: SyncRunView | null = runId && runState
    ? {
        runId,
        state: runState,
        progressPercent: totalUnits > 0 ? Math.round((processedUnits / totalUnits) * 100) : 0,
        processedUnits,
        totalUnits,
        unitLabel: "days",
        currentUnit,
        dataFreshThrough: activeRunDataFreshThrough,
        etaSeconds: deriveEtaSeconds(parseDateMs(startedAt), processedUnits, totalUnits, runState, nowMs),
        startedAt,
        lastProgressAt,
        finishedAt,
        queuePosition,
        queueDelaySeconds,
        stallState,
        stallReason: stallState === "delayed"
          ? "Progress is slower than usual."
          : stallState === "stalled"
            ? "No progress detected recently."
            : null,
        errorMessage,
      }
    : null

  const hasData =
    syncedDays > 0
    || asFiniteInt(row.total_rows) > 0
    || lastSuccessfulDataFreshThrough !== null
  const activeRunStates = new Set(["queued", "preparing", "syncing", "finalizing"])
  const activeRun = runView && activeRunStates.has(runView.state) ? runView : null
  const lastCompletedRun = runView && !activeRunStates.has(runView.state) ? runView : null
  const phase = deriveSyncPhase({
    activeRun,
    lastCompletedRun,
    status: (row.status as string) ?? null,
    hasData,
  })
  const needsReseed = !hasData && activeRun === null
  const bootstrapProgress = phase === "bootstrapping"
    ? activeRun?.progressPercent ?? 0
    : phase === "ready" && !needsReseed
      ? 100
      : null

  const healthSummary =
    activeRun?.stallState === "stalled"
      ? "stalled"
      : activeRun?.stallState === "delayed"
        ? "delayed"
        : lastCompletedRun?.state === "error" || (!hasData && phase === "error")
          ? "error"
          : lastCompletedRun?.state === "partial"
            ? "partial"
            : "healthy"

  return {
    siteId: row.id as string,
    siteUrl: row.gsc_site_url as string,
    lastSyncedDate: (row.last_synced_date as string) ?? null,
    status: (row.status as string) ?? null,
    errorMessage,
    updatedAt,
    backfillCursorDate: (row.backfill_cursor_date as string) ?? null,
    totalRows: asFiniteInt(row.total_rows),
    datesSynced: asFiniteInt(row.dates_synced),
    truncatedDates: asFiniteInt(row.truncated_dates),
    minDate: (row.min_date as string) ?? null,
    maxDate: (row.max_date as string) ?? null,
    isSyncing: activeRun !== null,
    retentionStart: options.retentionStart,
    retentionEnd: options.retentionEnd,
    expectedDays: options.expectedDays,
    syncedDays,
    remainingDays,
    syncProgressPct,
    activeRun,
    lastCompletedRun,
    lastSuccessfulDataFreshThrough,
    lastVisibleDataUpdatedAt: updatedAt,
    healthSummary,
    phase,
    hasData,
    needsReseed,
    bootstrapProgress,
  } satisfies SyncStatusView
}

export async function getSyncStatus(
  env: CloudflareEnv,
  userId: string,
): Promise<ServiceResult<{ statuses: SyncStatusView[]; summary: ReturnType<typeof buildAccountSyncSummary> }>> {
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
            ss.active_run_id, ss.active_run_state, ss.active_run_started_at,
            ss.active_run_last_progress_at, ss.active_run_finished_at,
            ss.active_run_total_units, ss.active_run_processed_units,
            ss.active_run_queue_position, ss.active_run_queue_delay_seconds,
            ss.active_run_data_fresh_through, ss.active_run_current_unit,
            log.total_rows, log.dates_synced, log.truncated_dates, log.min_date, log.max_date
     FROM user_sites us
     LEFT JOIN gsc_sync_state ss ON ss.site_id = us.id
     LEFT JOIN log ON log.site_id = us.id
     ORDER BY us.gsc_site_url ASC`,
  )
    .bind(userId)
    .all()

  const statuses = (result.results ?? []).map((row: Record<string, unknown>) =>
    buildSyncStatusView(row, {
      expectedDays,
      retentionStart,
      retentionEnd,
    }),
  )

  return ok({
    statuses,
    summary: buildAccountSyncSummary(statuses),
  })
}

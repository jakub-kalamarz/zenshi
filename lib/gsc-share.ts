import { SEO_CONFIG } from "@/lib/seo"
import { parseGranularity } from "@/lib/gsc-analytics"
import type { Granularity } from "@/lib/gsc-granularity"

export type ShareScopeType = "site" | "folder"
export type ShareStatus = "active" | "revoked" | "expired"
export type ShareCompareMode = "disabled" | "previous" | "yoy" | "custom"

export type ShareSite = {
  id: string
  gsc_site_url: string
  folder_id: string | null
  folder_name: string | null
}

export type ShareBranding = {
  brandName: string
  logoUrl: string | null
  faviconUrl: string | null
  accentColor: string
  headerBgColor: string | null
  textColor: string | null
  showPoweredBy: boolean
}

export type ShareDefaults = {
  start: string | null
  end: string | null
  compareMode: ShareCompareMode
  compareStart: string | null
  compareEnd: string | null
  granularity: Granularity
}

export type ResolvedShare = {
  id: string
  ownerUserId: string
  scopeType: ShareScopeType
  scopeId: string
  status: ShareStatus
  expiresAt: string
  createdAt: string
  revokedAt: string | null
  lastAccessedAt: string | null
  defaults: ShareDefaults
  branding: ShareBranding
  sites: ShareSite[]
}

const DEFAULT_ACCENT = "#3b82f6"
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const TOKEN_BYTES = 32
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 240

type RateBucket = { count: number; resetAt: number }

const rateBuckets = new Map<string, RateBucket>()

function base64UrlEncode(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function nowIso() {
  return new Date().toISOString()
}

function sqliteDateToIso(value: string) {
  if (!value) return value
  const normalized = value.replace(" ", "T")
  return normalized.endsWith("Z") ? normalized : `${normalized}Z`
}

function isPastSqlDate(value: string) {
  const ts = Date.parse(sqliteDateToIso(value))
  return Number.isFinite(ts) ? ts <= Date.now() : false
}

function isValidYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function sanitizeColor(input: unknown) {
  if (typeof input !== "string") return null
  const value = input.trim()
  if (!COLOR_RE.test(value)) return null
  return value.toLowerCase()
}

function sanitizeUrl(input: unknown) {
  if (typeof input !== "string") return null
  const value = input.trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:") return null
    return parsed.toString()
  } catch {
    return null
  }
}

function timingSafeEqual(a: string, b: string) {
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  const max = Math.max(aBytes.length, bBytes.length)
  let diff = aBytes.length ^ bBytes.length
  for (let i = 0; i < max; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0)
  }
  return diff === 0
}

function getRequestIp(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim()
  if (cfIp) return cfIp
  const forwarded = request.headers.get("x-forwarded-for")
  if (!forwarded) return "unknown"
  return forwarded.split(",")[0]?.trim() || "unknown"
}

function consumeRateLimit(tokenHash: string, request: Request) {
  const now = Date.now()
  if (rateBuckets.size > 10_000) {
    for (const [key, value] of rateBuckets.entries()) {
      if (value.resetAt <= now) rateBuckets.delete(key)
    }
  }

  const key = `${tokenHash}:${getRequestIp(request)}`
  const bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }

  if (bucket.count >= RATE_LIMIT) {
    return false
  }

  bucket.count += 1
  rateBuckets.set(key, bucket)
  return true
}

export function sanitizeShareBranding(input: unknown): ShareBranding {
  const payload = (input ?? {}) as Record<string, unknown>
  const brandName =
    typeof payload.brandName === "string" && payload.brandName.trim().length > 0
      ? payload.brandName.trim().slice(0, 80)
      : SEO_CONFIG.brandName

  return {
    brandName,
    logoUrl: sanitizeUrl(payload.logoUrl),
    faviconUrl: sanitizeUrl(payload.faviconUrl),
    accentColor: sanitizeColor(payload.accentColor) ?? DEFAULT_ACCENT,
    headerBgColor: sanitizeColor(payload.headerBgColor),
    textColor: sanitizeColor(payload.textColor),
    showPoweredBy: Boolean(payload.showPoweredBy),
  }
}

export function sanitizeShareDefaults(input: unknown): ShareDefaults {
  const payload = (input ?? {}) as Record<string, unknown>
  const compareMode =
    payload.compareMode === "previous" ||
    payload.compareMode === "yoy" ||
    payload.compareMode === "custom"
      ? payload.compareMode
      : "disabled"

  return {
    start: isValidYmd(payload.start) ? payload.start : null,
    end: isValidYmd(payload.end) ? payload.end : null,
    compareMode,
    compareStart: isValidYmd(payload.compareStart) ? payload.compareStart : null,
    compareEnd: isValidYmd(payload.compareEnd) ? payload.compareEnd : null,
    granularity: parseGranularity(
      typeof payload.granularity === "string" ? payload.granularity : null,
    ),
  }
}

export function createDefaultExpiry() {
  // Immortal by default for share links.
  return "9999-12-31T23:59:59.000Z"
}

export function normalizeExpiry(input: unknown) {
  if (typeof input !== "string") return null
  const value = input.trim()
  if (!value) return null
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return null
  if (ts <= Date.now()) return null
  return new Date(ts).toISOString()
}

export function validateScopeType(input: unknown): ShareScopeType | null {
  return input === "site" || input === "folder" ? input : null
}

export async function generateShareToken() {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  const rawToken = base64UrlEncode(bytes)
  const tokenHash = await hashToken(rawToken)
  return { rawToken, tokenHash }
}

export async function hashToken(rawToken: string) {
  const bytes = new TextEncoder().encode(rawToken)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Buffer.from(new Uint8Array(digest)).toString("hex")
}

export function buildShareUrl(request: Request, token: string) {
  const url = new URL(request.url)
  return `${url.origin}/s/${encodeURIComponent(token)}`
}

export async function verifyOwnerScope(
  env: CloudflareEnv,
  ownerUserId: string,
  scopeType: ShareScopeType,
  scopeId: string,
) {
  if (scopeType === "site") {
    const site = await env.DB.prepare(
      `SELECT id, gsc_site_url FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
    )
      .bind(scopeId, ownerUserId)
      .first<{ id: string; gsc_site_url: string }>()
    return site
  }

  const folder = await env.DB.prepare(
    `SELECT id, name FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(scopeId, ownerUserId)
    .first<{ id: string; name: string }>()
  return folder
}

async function loadScopeSites(
  env: CloudflareEnv,
  ownerUserId: string,
  scopeType: ShareScopeType,
  scopeId: string,
): Promise<ShareSite[]> {
  if (scopeType === "site") {
    const row = await env.DB.prepare(
      `SELECT s.id, s.gsc_site_url, sf.folder_id, f.name AS folder_name
       FROM gsc_sites s
       LEFT JOIN gsc_site_folders sf ON sf.site_id = s.id
       LEFT JOIN gsc_folders f ON f.id = sf.folder_id
       WHERE s.id = ? AND s.owner_user_id = ? AND s.enabled = 1`,
    )
      .bind(scopeId, ownerUserId)
      .first<ShareSite>()
    return row ? [row] : []
  }

  const rows = await env.DB.prepare(
    `SELECT s.id, s.gsc_site_url, sf.folder_id, f.name AS folder_name
     FROM gsc_sites s
     JOIN gsc_site_folders sf ON sf.site_id = s.id
     JOIN gsc_folders f ON f.id = sf.folder_id
     WHERE s.owner_user_id = ? AND sf.folder_id = ? AND s.enabled = 1
     ORDER BY s.created_at DESC`,
  )
    .bind(ownerUserId, scopeId)
    .all<ShareSite>()
  return rows.results ?? []
}

function rowToBranding(row: Record<string, unknown>): ShareBranding {
  return {
    brandName:
      typeof row.brand_name === "string" && row.brand_name.trim().length > 0
        ? row.brand_name
        : SEO_CONFIG.brandName,
    logoUrl: typeof row.logo_url === "string" ? row.logo_url : null,
    faviconUrl: typeof row.favicon_url === "string" ? row.favicon_url : null,
    accentColor:
      typeof row.accent_color === "string" && COLOR_RE.test(row.accent_color)
        ? row.accent_color.toLowerCase()
        : DEFAULT_ACCENT,
    headerBgColor:
      typeof row.header_bg_color === "string" && COLOR_RE.test(row.header_bg_color)
        ? row.header_bg_color.toLowerCase()
        : null,
    textColor:
      typeof row.text_color === "string" && COLOR_RE.test(row.text_color)
        ? row.text_color.toLowerCase()
        : null,
    showPoweredBy: Boolean(row.show_powered_by),
  }
}

export async function resolveShareByToken(
  env: CloudflareEnv,
  request: Request,
  rawToken: string | null,
) {
  const token = rawToken?.trim() ?? ""
  if (!token) {
    return { ok: false as const, response: new Response("Missing token", { status: 400 }) }
  }

  const tokenHash = await hashToken(token)

  if (!consumeRateLimit(tokenHash, request)) {
    return { ok: false as const, response: new Response("Too Many Requests", { status: 429 }) }
  }

  const row = await env.DB.prepare(
    `SELECT
       s.id,
       s.owner_user_id,
       s.scope_type,
       s.scope_id,
       s.token_hash,
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
       b.brand_name,
       b.logo_url,
       b.favicon_url,
       b.accent_color,
       b.header_bg_color,
       b.text_color,
       b.show_powered_by
     FROM gsc_share_links s
     LEFT JOIN gsc_share_branding b ON b.share_id = s.id
     WHERE s.token_hash = ?
     LIMIT 1`,
  )
    .bind(tokenHash)
    .first<Record<string, unknown>>()

  if (!row || typeof row.token_hash !== "string") {
    return { ok: false as const, response: new Response("Not found", { status: 404 }) }
  }

  if (!timingSafeEqual(row.token_hash, tokenHash)) {
    return { ok: false as const, response: new Response("Not found", { status: 404 }) }
  }

  const status = (row.status as ShareStatus) ?? "active"
  if (status === "revoked") {
    return { ok: false as const, response: new Response("Link revoked", { status: 410 }) }
  }

  const expiresAt = typeof row.expires_at === "string" ? row.expires_at : ""
  if (!expiresAt || isPastSqlDate(expiresAt)) {
    await env.DB.prepare(
      `UPDATE gsc_share_links
       SET status = 'expired'
       WHERE id = ? AND status = 'active'`,
    )
      .bind(row.id)
      .run()
    return { ok: false as const, response: new Response("Link expired", { status: 410 }) }
  }

  const scopeType = row.scope_type === "folder" ? "folder" : "site"
  const ownerUserId = typeof row.owner_user_id === "string" ? row.owner_user_id : ""
  const scopeId = typeof row.scope_id === "string" ? row.scope_id : ""
  const sites = await loadScopeSites(env, ownerUserId, scopeType, scopeId)

  if (sites.length === 0) {
    return {
      ok: false as const,
      response: new Response("Share scope unavailable", { status: 410 }),
    }
  }

  await env.DB.prepare(
    `UPDATE gsc_share_links
     SET last_accessed_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(row.id)
    .run()

  const defaults: ShareDefaults = {
    start: isValidYmd(row.default_start) ? row.default_start : null,
    end: isValidYmd(row.default_end) ? row.default_end : null,
    compareMode:
      row.default_compare_mode === "previous" ||
      row.default_compare_mode === "yoy" ||
      row.default_compare_mode === "custom"
        ? row.default_compare_mode
        : "disabled",
    compareStart: isValidYmd(row.default_compare_start) ? row.default_compare_start : null,
    compareEnd: isValidYmd(row.default_compare_end) ? row.default_compare_end : null,
    granularity: parseGranularity(
      typeof row.default_granularity === "string" ? row.default_granularity : null,
    ),
  }

  const share: ResolvedShare = {
    id: String(row.id),
    ownerUserId,
    scopeType,
    scopeId,
    status: "active",
    expiresAt: expiresAt,
    createdAt: typeof row.created_at === "string" ? row.created_at : nowIso(),
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    lastAccessedAt:
      typeof row.last_accessed_at === "string" ? row.last_accessed_at : null,
    defaults,
    branding: rowToBranding(row),
    sites,
  }

  return { ok: true as const, share }
}

export function resolveTargetSiteId(share: ResolvedShare, requestedSiteId: string | null) {
  if (share.scopeType === "site") {
    return share.scopeId
  }

  const safeRequested = requestedSiteId?.trim() ?? ""
  if (safeRequested) {
    const exists = share.sites.some((site) => site.id === safeRequested)
    if (!exists) return null
    return safeRequested
  }

  return share.sites[0]?.id ?? null
}

export function filterAllowedSiteIds(share: ResolvedShare, siteIds: string[]) {
  const allowed = new Set(share.sites.map((site) => site.id))
  if (share.scopeType === "site") return [share.scopeId]

  const deduped: string[] = []
  for (const id of siteIds) {
    if (!allowed.has(id)) continue
    if (deduped.includes(id)) continue
    deduped.push(id)
  }

  return deduped.length > 0 ? deduped : share.sites.map((site) => site.id)
}

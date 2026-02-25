import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
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

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  // Cleanup legacy revoked links so they no longer appear and do not linger in storage.
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM gsc_share_branding
       WHERE share_id IN (
         SELECT id
         FROM gsc_share_links
         WHERE owner_user_id = ?
           AND status = 'revoked'
       )`,
    ).bind(session.user.id),
    env.DB.prepare(
      `DELETE FROM gsc_share_links
       WHERE owner_user_id = ?
         AND status = 'revoked'`,
    ).bind(session.user.id),
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
    .bind(session.user.id)
    .all<Record<string, unknown>>()

  const results = (rows.results ?? []).map((row) => ({
    ...row,
    shareUrl: row.token ? buildShareUrl(request, row.token as string) : null,
  }))

  return Response.json({ shares: results })
}

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    scopeType?: unknown
    scopeId?: unknown
    expiresAt?: unknown
    branding?: unknown
    defaults?: unknown
  } | null

  const scopeType = validateScopeType(body?.scopeType)
  const scopeId = typeof body?.scopeId === "string" ? body.scopeId.trim() : ""
  if (!scopeType || !scopeId) {
    return new Response("Invalid scope", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const ownedScope = await verifyOwnerScope(env, session.user.id, scopeType, scopeId)
  if (!ownedScope) {
    return new Response("Scope not found", { status: 404 })
  }

  const branding = sanitizeShareBranding(body?.branding)
  const defaults = body?.defaults !== undefined ? sanitizeShareDefaults(body.defaults) : null
  const persistedCompareMode = defaults?.compareMode ?? "disabled"
  const persistedGranularity = defaults?.granularity ?? "day"
  const expiresAtIso = normalizeExpiry(body?.expiresAt) ?? createDefaultExpiry()

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
      session.user.id,
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

  return Response.json({
    id: shareId,
    scopeType,
    scopeId,
    expiresAt: expiresAtIso,
    shareUrl: buildShareUrl(request, rawToken),
  })
}

export async function PATCH(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    shareId?: string
    status?: unknown
    expiresAt?: unknown
    branding?: unknown
    defaults?: unknown
  } | null
  const shareId = body?.shareId?.trim()
  if (!shareId) {
    return new Response("Missing shareId", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const existing = await env.DB.prepare(
    `SELECT id FROM gsc_share_links WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(shareId, session.user.id)
    .first()

  if (!existing) {
    return new Response("Share not found", { status: 404 })
  }

  const expiresAt = normalizeExpiry(body?.expiresAt)
  const defaults = sanitizeShareDefaults(body?.defaults)
  const status = body?.status === "active" || body?.status === "revoked" ? body.status : null

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
      session.user.id,
    )
    .run()

  if (body?.branding !== undefined) {
    const branding = sanitizeShareBranding(body.branding)
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

  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { shareId?: string } | null
  const shareId = body?.shareId?.trim()
  if (!shareId) {
    return new Response("Missing shareId", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
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
    ).bind(shareId, shareId, session.user.id),
    env.DB.prepare(
      `DELETE FROM gsc_share_links
       WHERE id = ?
         AND owner_user_id = ?`,
    ).bind(shareId, session.user.id),
  ])

  return Response.json({ ok: true })
}

import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { listUserGscSites, normalizeGscSiteUrl } from "@/lib/gsc"
import { ensureGscSchema } from "@/lib/gsc-schema"
import { enqueueDailySync, enqueueSyncForSite } from "@/lib/gsc-sync"

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)
  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get("refresh") === "1"

  let existing = await env.DB.prepare(
    `SELECT s.id, s.gsc_site_url, s.enabled, s.created_at,
            sf.folder_id, f.name as folder_name
     FROM gsc_sites s
     LEFT JOIN gsc_site_folders sf ON sf.site_id = s.id
     LEFT JOIN gsc_folders f ON f.id = sf.folder_id
     WHERE s.owner_user_id = ?
     ORDER BY s.created_at DESC`,
  )
    .bind(session.user.id)
    .all()

  if (refresh || (existing.results?.length ?? 0) === 0) {
    const remoteSites = await listUserGscSites(env, session.user.id)
    for (const site of remoteSites) {
      const normalized = normalizeGscSiteUrl(site.siteUrl)
      if (!normalized) continue
      await env.DB.prepare(
        `INSERT INTO gsc_sites (id, owner_user_id, gsc_site_url, enabled)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(owner_user_id, gsc_site_url)
         DO UPDATE SET enabled = 1`,
      )
        .bind(crypto.randomUUID(), session.user.id, normalized)
        .run()
    }

    existing = await env.DB.prepare(
      `SELECT s.id, s.gsc_site_url, s.enabled, s.created_at,
              sf.folder_id, f.name as folder_name
       FROM gsc_sites s
       LEFT JOIN gsc_site_folders sf ON sf.site_id = s.id
       LEFT JOIN gsc_folders f ON f.id = sf.folder_id
       WHERE s.owner_user_id = ?
       ORDER BY s.created_at DESC`,
    )
      .bind(session.user.id)
      .all()

    await enqueueDailySync(env)
  }

  return Response.json({ sites: existing.results ?? [] })
}

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { siteUrl?: string } | null
  const siteUrl = body?.siteUrl?.trim()
  if (!siteUrl) {
    return new Response("Missing siteUrl", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)
  const availableSites = await listUserGscSites(env, session.user.id)
  const normalized = normalizeGscSiteUrl(siteUrl)
  if (!normalized) {
    return new Response("Invalid siteUrl", { status: 400 })
  }
  const allowedSet = new Set(
    availableSites
      .map((site) => normalizeGscSiteUrl(site.siteUrl))
      .filter((value): value is string => Boolean(value)),
  )
  const isAllowed = allowedSet.has(normalized)

  if (!isAllowed) {
    return new Response("Site not accessible in GSC", { status: 403 })
  }

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO gsc_sites (id, owner_user_id, gsc_site_url, enabled)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(owner_user_id, gsc_site_url)
     DO UPDATE SET enabled = 1`,
  )
    .bind(id, session.user.id, normalized)
    .run()

  await enqueueSyncForSite(env, id)
  return Response.json({ id, siteUrl: normalized })
}

export async function PATCH(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    siteId?: string
    folderId?: string | null
  } | null
  const siteId = body?.siteId?.trim()
  const folderId = body?.folderId?.trim() ?? null

  if (!siteId) {
    return new Response("Missing siteId", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const site = await env.DB.prepare(
    `SELECT id FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(siteId, session.user.id)
    .first()

  if (!site) {
    return new Response("Site not found", { status: 404 })
  }

  if (!folderId) {
    await env.DB.prepare(
      `DELETE FROM gsc_site_folders WHERE site_id = ?`,
    )
      .bind(siteId)
      .run()
    return Response.json({ ok: true })
  }

  const folder = await env.DB.prepare(
    `SELECT id FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(folderId, session.user.id)
    .first()

  if (!folder) {
    return new Response("Folder not found", { status: 404 })
  }

  await env.DB.prepare(
    `INSERT INTO gsc_site_folders (site_id, folder_id, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(site_id) DO UPDATE SET
       folder_id = excluded.folder_id,
       updated_at = datetime('now')`,
  )
    .bind(siteId, folderId)
    .run()

  return Response.json({ ok: true })
}

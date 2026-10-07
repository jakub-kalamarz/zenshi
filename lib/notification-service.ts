import { ensureGscSchema } from "@/lib/gsc-schema"

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }

type NotificationDeliveryMode = "digest" | "perSite"

type NotificationPremiumAccess = {
  isPremium: boolean
  source: "allowlist" | "none"
}

type NotificationSiteOption = {
  id: string
  siteUrl: string
}

type NotificationPreferencesView = {
  access: NotificationPremiumAccess
  preferences: {
    enabled: boolean
    deliveryMode: NotificationDeliveryMode
    monitoredSiteIds: string[]
  }
  sites: NotificationSiteOption[]
}

type NotificationPreferencesPayload = {
  enabled?: boolean
  deliveryMode?: NotificationDeliveryMode
  monitoredSiteIds?: string[]
}

type DeviceTokenPayload = {
  token?: string
  authorizationStatus?: "authorized" | "denied" | "notDetermined" | "provisional" | "ephemeral" | "unknown"
}

type NotificationEventRow = {
  id: string
  user_id: string
  site_id: string | null
  delivery_mode: NotificationDeliveryMode
  freshness_date: string
  dedupe_key: string
  site_ids_json: string
  title: string
  body: string
  status: string
}

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data }
}

function fail<T>(status: number, message: string): ServiceResult<T> {
  return { ok: false, status, message }
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
  } catch {
    return []
  }
}

function uniqueStringArray(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  )
}

function normalizeDeviceToken(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase()
}

function siteTitle(siteUrl: string) {
  if (siteUrl.startsWith("sc-domain:")) {
    return siteUrl.replace("sc-domain:", "")
  }

  try {
    return new URL(siteUrl).hostname || siteUrl
  } catch {
    return siteUrl
  }
}

async function loadOwnedSites(env: CloudflareEnv, userId: string): Promise<NotificationSiteOption[]> {
  const rows = await env.DB.prepare(
    `SELECT id, gsc_site_url
     FROM gsc_sites
     WHERE owner_user_id = ? AND enabled = 1
     ORDER BY gsc_site_url ASC`,
  )
    .bind(userId)
    .all<{ id: string; gsc_site_url: string }>()

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    siteUrl: row.gsc_site_url,
  }))
}

async function resolveNotificationPremiumAccess(
  env: CloudflareEnv,
  userId: string,
): Promise<NotificationPremiumAccess> {
  const source = env as unknown as Record<string, string | undefined>
  const allowedEmails = uniqueStringArray((source.NOTIFICATION_PREMIUM_EMAILS ?? "").split(","))
    .map((value) => value.toLowerCase())
  const allowedUserIds = uniqueStringArray((source.NOTIFICATION_PREMIUM_USER_IDS ?? "").split(","))

  if (allowedEmails.length === 0 && allowedUserIds.length === 0) {
    return { isPremium: false, source: "none" }
  }

  if (allowedUserIds.includes(userId)) {
    return { isPremium: true, source: "allowlist" }
  }

  const user = await env.DB.prepare(
    `SELECT email
     FROM auth_users
     WHERE id = ?`,
  )
    .bind(userId)
    .first<{ email: string | null }>()

  const email = user?.email?.trim().toLowerCase() ?? null
  return {
    isPremium: email !== null && allowedEmails.includes(email),
    source: "allowlist",
  }
}

async function loadStoredNotificationPreferences(env: CloudflareEnv, userId: string) {
  const row = await env.DB.prepare(
    `SELECT enabled, delivery_mode, monitored_site_ids
     FROM gsc_notification_preferences
     WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{
      enabled: number
      delivery_mode: NotificationDeliveryMode | null
      monitored_site_ids: string | null
    }>()

  return {
    enabled: Boolean(row?.enabled),
    deliveryMode: row?.delivery_mode === "perSite" ? "perSite" : "digest",
    monitoredSiteIds: parseStringArray(row?.monitored_site_ids ?? "[]"),
  } satisfies NotificationPreferencesView["preferences"]
}

export async function getNotificationPreferences(
  env: CloudflareEnv,
  userId: string,
): Promise<ServiceResult<NotificationPreferencesView>> {
  await ensureGscSchema(env)

  const [access, sites, preferences] = await Promise.all([
    resolveNotificationPremiumAccess(env, userId),
    loadOwnedSites(env, userId),
    loadStoredNotificationPreferences(env, userId),
  ])

  return ok({
    access,
    preferences: {
      ...preferences,
      monitoredSiteIds: preferences.monitoredSiteIds.filter((siteId) => sites.some((site) => site.id === siteId)),
    },
    sites,
  })
}

export async function updateNotificationPreferences(
  env: CloudflareEnv,
  userId: string,
  payload: NotificationPreferencesPayload,
): Promise<ServiceResult<NotificationPreferencesView["preferences"]>> {
  await ensureGscSchema(env)

  const access = await resolveNotificationPremiumAccess(env, userId)
  if (!access.isPremium) {
    return fail(403, "New data notifications are part of the premium plan.")
  }

  const sites = await loadOwnedSites(env, userId)
  const allowedSiteIds = new Set(sites.map((site) => site.id))
  const monitoredSiteIds = uniqueStringArray(payload.monitoredSiteIds ?? [])
  if (monitoredSiteIds.some((siteId) => !allowedSiteIds.has(siteId))) {
    return fail(400, "Notification scope contains unknown sites.")
  }

  const preferences = {
    enabled: Boolean(payload.enabled),
    deliveryMode: payload.deliveryMode === "perSite" ? "perSite" : "digest",
    monitoredSiteIds,
  } satisfies NotificationPreferencesView["preferences"]

  await env.DB.prepare(
    `INSERT INTO gsc_notification_preferences (
       user_id,
       enabled,
       delivery_mode,
       monitored_site_ids,
       updated_at
     ) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       enabled = excluded.enabled,
       delivery_mode = excluded.delivery_mode,
       monitored_site_ids = excluded.monitored_site_ids,
       updated_at = datetime('now')`,
  )
    .bind(
      userId,
      preferences.enabled ? 1 : 0,
      preferences.deliveryMode,
      JSON.stringify(preferences.monitoredSiteIds),
    )
    .run()

  return ok(preferences)
}

export async function registerNotificationDevice(
  env: CloudflareEnv,
  userId: string,
  payload: DeviceTokenPayload,
): Promise<ServiceResult<{ ok: true }>> {
  await ensureGscSchema(env)

  const access = await resolveNotificationPremiumAccess(env, userId)
  if (!access.isPremium) {
    return fail(403, "New data notifications are part of the premium plan.")
  }

  if (typeof payload.token !== "string" || payload.token.trim().length < 16) {
    return fail(400, "A valid device token is required.")
  }

  const token = normalizeDeviceToken(payload.token)
  const authorizationStatus = payload.authorizationStatus ?? "unknown"

  await env.DB.prepare(
    `INSERT INTO gsc_notification_devices (
       id,
       user_id,
       platform,
       token,
       authorization_status,
       updated_at,
       created_at
     ) VALUES (?, ?, 'ios', ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(token) DO UPDATE SET
       user_id = excluded.user_id,
       authorization_status = excluded.authorization_status,
       updated_at = datetime('now')`,
  )
    .bind(crypto.randomUUID(), userId, token, authorizationStatus)
    .run()

  return ok({ ok: true })
}

export async function queueFreshnessNotificationCandidate(
  env: CloudflareEnv,
  args: { userId: string; siteId: string; siteUrl: string; freshnessDate: string },
) {
  await ensureGscSchema(env)

  const access = await resolveNotificationPremiumAccess(env, args.userId)
  if (!access.isPremium) return

  const prefs = await loadStoredNotificationPreferences(env, args.userId)
  if (!prefs.enabled) return
  if (prefs.monitoredSiteIds.length > 0 && !prefs.monitoredSiteIds.includes(args.siteId)) return

  if (prefs.deliveryMode === "perSite") {
    const title = `New Search Console data is ready for ${siteTitle(args.siteUrl)}`
    const body = `Data is now available through ${args.freshnessDate}.`

    await env.DB.prepare(
      `INSERT INTO gsc_notification_events (
         id,
         user_id,
         site_id,
         delivery_mode,
         freshness_date,
         dedupe_key,
         site_ids_json,
         title,
         body,
         status,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, 'perSite', ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
       ON CONFLICT(dedupe_key) DO NOTHING`,
    )
      .bind(
        crypto.randomUUID(),
        args.userId,
        args.siteId,
        args.freshnessDate,
        `per-site:${args.userId}:${args.siteId}:${args.freshnessDate}`,
        JSON.stringify([args.siteId]),
        title,
        body,
      )
      .run()
    return
  }

  const dedupeKey = `digest:${args.userId}:${args.freshnessDate}`
  const existing = await env.DB.prepare(
    `SELECT id, site_ids_json
     FROM gsc_notification_events
     WHERE dedupe_key = ?`,
  )
    .bind(dedupeKey)
    .first<{ id: string; site_ids_json: string | null }>()

  const nextSiteIds = uniqueStringArray([
    ...(existing ? parseStringArray(existing.site_ids_json ?? "[]") : []),
    args.siteId,
  ])
  const title = nextSiteIds.length === 1
    ? `New Search Console data is ready for ${siteTitle(args.siteUrl)}`
    : `New Search Console data is ready for ${nextSiteIds.length} sites`
  const body = nextSiteIds.length === 1
    ? `Data is now available through ${args.freshnessDate}.`
    : `Fresh Search Console data is now available through ${args.freshnessDate}.`

  await env.DB.prepare(
    `INSERT INTO gsc_notification_events (
       id,
       user_id,
       site_id,
       delivery_mode,
       freshness_date,
       dedupe_key,
       site_ids_json,
       title,
       body,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, NULL, 'digest', ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
     ON CONFLICT(dedupe_key) DO UPDATE SET
       site_ids_json = excluded.site_ids_json,
       title = excluded.title,
       body = excluded.body,
       updated_at = datetime('now')`,
  )
    .bind(
      existing?.id ?? crypto.randomUUID(),
      args.userId,
      args.freshnessDate,
      dedupeKey,
      JSON.stringify(nextSiteIds),
      title,
      body,
    )
    .run()
}

export async function processPendingNotificationEvents(env: CloudflareEnv) {
  await ensureGscSchema(env)

  const deliveryEnabled = (env as unknown as Record<string, string | undefined>).NOTIFICATION_DELIVERY_ENABLED === "1"
  if (!deliveryEnabled) return

  const rows = await env.DB.prepare(
    `SELECT id, user_id, site_id, delivery_mode, freshness_date, dedupe_key, site_ids_json, title, body, status
     FROM gsc_notification_events
     WHERE status = 'pending'
     ORDER BY created_at ASC`,
  )
    .all<NotificationEventRow>()

  for (const row of rows.results ?? []) {
    const devices = await env.DB.prepare(
      `SELECT token
       FROM gsc_notification_devices
       WHERE user_id = ?
         AND authorization_status IN ('authorized', 'provisional', 'ephemeral')`,
    )
      .bind(row.user_id)
      .all<{ token: string }>()

    if ((devices.results ?? []).length === 0) {
      continue
    }

    await env.DB.prepare(
      `UPDATE gsc_notification_events
       SET status = 'sent',
           sent_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(row.id)
      .run()
  }
}

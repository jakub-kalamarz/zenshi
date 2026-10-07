import assert from "node:assert/strict"
import {
  getNotificationPreferences,
  processPendingNotificationEvents,
  queueFreshnessNotificationCandidate,
  registerNotificationDevice,
  updateNotificationPreferences,
} from "./notification-service"

type FakeRow = Record<string, unknown>

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

function createNotificationDb(seed?: {
  authUsers?: FakeRow[]
  sites?: FakeRow[]
  preferences?: FakeRow[]
  devices?: FakeRow[]
  events?: FakeRow[]
}) {
  const state = {
    authUsers: [...(seed?.authUsers ?? [])],
    sites: [...(seed?.sites ?? [])],
    preferences: [...(seed?.preferences ?? [])],
    devices: [...(seed?.devices ?? [])],
    events: [...(seed?.events ?? [])],
  }

  return {
    prepare(sql: string) {
      const normalized = normalize(sql)
      let bound: unknown[] = []

      const statement = {
        bind(...values: unknown[]) {
          bound = values
          return statement
        },
        async first<T>() {
          if (normalized.includes("from sqlite_master")) {
            return { count: 14 } as T
          }

          if (normalized === "pragma table_info(gsc_sync_state)") {
            return null
          }

          if (normalized.includes("select email") && normalized.includes("from auth_users")) {
            const row = state.authUsers.find((user) => user.id === bound[0]) ?? null
            return row ? ({ email: row.email ?? null } as T) : null
          }

          if (normalized.includes("from gsc_notification_preferences")) {
            const row = state.preferences.find((item) => item.user_id === bound[0]) ?? null
            return row ? (row as T) : null
          }

          if (normalized.includes("from gsc_notification_events") && normalized.includes("where dedupe_key")) {
            const row = state.events.find((item) => item.dedupe_key === bound[0]) ?? null
            return row ? ({ id: row.id, site_ids_json: row.site_ids_json ?? "[]" } as T) : null
          }

          return null
        },
        async all<T>() {
          if (normalized === "pragma table_info(gsc_sync_state)") {
            return {
              results: [
                { name: "active_run_id" },
                { name: "active_run_state" },
                { name: "active_run_started_at" },
                { name: "active_run_last_progress_at" },
                { name: "active_run_finished_at" },
                { name: "active_run_total_units" },
                { name: "active_run_processed_units" },
                { name: "active_run_warning_count" },
                { name: "active_run_error_count" },
                { name: "active_run_queue_position" },
                { name: "active_run_queue_delay_seconds" },
                { name: "active_run_data_fresh_through" },
                { name: "active_run_current_unit" },
              ] as T[],
            }
          }

          if (normalized.includes("from gsc_sites")) {
            return {
              results: state.sites
                .filter((site) => site.owner_user_id === bound[0] && site.enabled === 1)
                .map((site) => ({ id: site.id, gsc_site_url: site.gsc_site_url })) as T[],
            }
          }

          if (normalized.includes("from gsc_notification_events") && normalized.includes("where status = 'pending'")) {
            return { results: state.events.filter((event) => event.status === "pending") as T[] }
          }

          if (normalized.includes("from gsc_notification_devices")) {
            return {
              results: state.devices.filter((device) =>
                device.user_id === bound[0]
                  && ["authorized", "provisional", "ephemeral"].includes(String(device.authorization_status))
              ) as T[],
            }
          }

          return { results: [] as T[] }
        },
        async run() {
          if (normalized.startsWith("insert into gsc_notification_preferences")) {
            const [userId, enabled, deliveryMode, monitoredSiteIds] = bound
            const existing = state.preferences.find((item) => item.user_id === userId)
            const row = {
              user_id: userId,
              enabled,
              delivery_mode: deliveryMode,
              monitored_site_ids: monitoredSiteIds,
            }
            if (existing) {
              Object.assign(existing, row)
            } else {
              state.preferences.push(row)
            }
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("insert into gsc_notification_devices")) {
            const [id, userId, token, authorizationStatus] = bound
            const existing = state.devices.find((item) => item.token === token)
            if (existing) {
              existing.user_id = userId
              existing.authorization_status = authorizationStatus
            } else {
              state.devices.push({
                id,
                user_id: userId,
                token,
                authorization_status: authorizationStatus,
              })
            }
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("insert into gsc_notification_events")) {
            const isDigest = normalized.includes("'digest'")
            if (isDigest) {
              const [id, userId, freshnessDate, dedupeKey, siteIdsJson, title, body] = bound
              const existing = state.events.find((item) => item.dedupe_key === dedupeKey)
              const row = {
                id: existing?.id ?? id,
                user_id: userId,
                site_id: null,
                delivery_mode: "digest",
                freshness_date: freshnessDate,
                dedupe_key: dedupeKey,
                site_ids_json: siteIdsJson,
                title,
                body,
                status: existing?.status ?? "pending",
              }
              if (existing) {
                Object.assign(existing, row)
              } else {
                state.events.push(row)
              }
            } else {
              const [id, userId, siteId, freshnessDate, dedupeKey, siteIdsJson, title, body] = bound
              if (!state.events.some((item) => item.dedupe_key === dedupeKey)) {
                state.events.push({
                  id,
                  user_id: userId,
                  site_id: siteId,
                  delivery_mode: "perSite",
                  freshness_date: freshnessDate,
                  dedupe_key: dedupeKey,
                  site_ids_json: siteIdsJson,
                  title,
                  body,
                  status: "pending",
                })
              }
            }
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("update gsc_notification_events")) {
            const event = state.events.find((item) => item.id === bound[0])
            if (event) {
              event.status = "sent"
            }
            return { success: true, meta: { changes: 1 } }
          }

          return { success: true, meta: { changes: 0 } }
        },
      }

      return statement
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      for (const statement of statements) {
        await statement.run()
      }
      return []
    },
    state,
  }
}

{
  const db = createNotificationDb({
    authUsers: [{ id: "user-1", email: "owner@example.com" }],
    sites: [{ id: "site-1", owner_user_id: "user-1", gsc_site_url: "https://example.com", enabled: 1 }],
  })
  const env = {
    DB: db,
    NOTIFICATION_PREMIUM_EMAILS: "owner@example.com",
  } as unknown as CloudflareEnv

  const result = await getNotificationPreferences(env, "user-1")

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.data.access.isPremium, true)
    assert.equal(result.data.preferences.enabled, false)
    assert.equal(result.data.preferences.deliveryMode, "digest")
    assert.deepEqual(result.data.sites, [{ id: "site-1", siteUrl: "https://example.com" }])
  }
}

{
  const db = createNotificationDb({
    authUsers: [{ id: "user-1", email: "owner@example.com" }],
    sites: [
      { id: "site-1", owner_user_id: "user-1", gsc_site_url: "https://example.com", enabled: 1 },
      { id: "site-2", owner_user_id: "user-1", gsc_site_url: "https://blog.example.com", enabled: 1 },
    ],
  })
  const env = {
    DB: db,
    NOTIFICATION_PREMIUM_EMAILS: "owner@example.com",
  } as unknown as CloudflareEnv

  const result = await updateNotificationPreferences(env, "user-1", {
    enabled: true,
    deliveryMode: "perSite",
    monitoredSiteIds: ["site-2"],
  })

  assert.equal(result.ok, true)
  assert.deepEqual(db.state.preferences[0], {
    user_id: "user-1",
    enabled: 1,
    delivery_mode: "perSite",
    monitored_site_ids: JSON.stringify(["site-2"]),
  })
}

{
  const db = createNotificationDb({
    authUsers: [{ id: "user-1", email: "owner@example.com" }],
  })
  const env = {
    DB: db,
    NOTIFICATION_PREMIUM_EMAILS: "owner@example.com",
  } as unknown as CloudflareEnv

  const result = await registerNotificationDevice(env, "user-1", {
    token: " abcd1234abcd1234 ",
    authorizationStatus: "authorized",
  })

  assert.equal(result.ok, true)
  assert.equal(db.state.devices[0].token, "abcd1234abcd1234")
  assert.equal(db.state.devices[0].authorization_status, "authorized")
}

{
  const db = createNotificationDb({
    authUsers: [{ id: "user-1", email: "owner@example.com" }],
    preferences: [{
      user_id: "user-1",
      enabled: 1,
      delivery_mode: "digest",
      monitored_site_ids: "[]",
    }],
    devices: [{
      id: "device-1",
      user_id: "user-1",
      token: "abcd1234",
      authorization_status: "authorized",
    }],
  })
  const env = {
    DB: db,
    NOTIFICATION_PREMIUM_EMAILS: "owner@example.com",
    NOTIFICATION_DELIVERY_ENABLED: "1",
  } as unknown as CloudflareEnv

  await queueFreshnessNotificationCandidate(env, {
    userId: "user-1",
    siteId: "site-1",
    siteUrl: "https://example.com",
    freshnessDate: "2026-03-08",
  })
  await queueFreshnessNotificationCandidate(env, {
    userId: "user-1",
    siteId: "site-2",
    siteUrl: "https://blog.example.com",
    freshnessDate: "2026-03-08",
  })
  assert.equal(db.state.events.length, 1)
  assert.equal(db.state.events[0].delivery_mode, "digest")
  assert.equal(db.state.events[0].title, "New Search Console data is ready for 2 sites")

  await processPendingNotificationEvents(env)
  assert.equal(db.state.events[0].status, "sent")
}

console.log("notification-service spec passed")

import assert from "node:assert/strict"
import { mock } from "bun:test"

type FakeRow = Record<string, unknown>

const listUserGscSites = mock(async () => [])
const enqueueDailySync = mock(async () => {})
const enqueueSyncForSite = mock(async () => 0)

mock.module("./gsc", () => ({
  MissingGoogleAccountError: class MissingGoogleAccountError extends Error {
    status = 403
  },
  listUserGscSites,
  normalizeGscSiteUrl: (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (trimmed.startsWith("sc-domain:")) {
      return trimmed.replace("sc-domain:", "").toLowerCase()
    }
    try {
      return new URL(trimmed).toString()
    } catch {
      return trimmed.toLowerCase()
    }
  },
}))

mock.module("./gsc-sync", () => ({
  enqueueDailySync,
  enqueueSyncForSite,
}))

const { reseedAccountDashboardData, resetAccountDashboardData } = await import("./gsc-service")

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

function createReseedDb(seed?: {
  sites?: FakeRow[]
  shareLinks?: FakeRow[]
  shareBranding?: FakeRow[]
  preferences?: FakeRow[]
  siteFolders?: FakeRow[]
  pages?: FakeRow[]
  devices?: FakeRow[]
  queries?: FakeRow[]
  syncLog?: FakeRow[]
  syncState?: FakeRow[]
  folders?: FakeRow[]
}) {
  const state = {
    sites: [...(seed?.sites ?? [])],
    shareLinks: [...(seed?.shareLinks ?? [])],
    shareBranding: [...(seed?.shareBranding ?? [])],
    preferences: [...(seed?.preferences ?? [])],
    siteFolders: [...(seed?.siteFolders ?? [])],
    pages: [...(seed?.pages ?? [])],
    devices: [...(seed?.devices ?? [])],
    queries: [...(seed?.queries ?? [])],
    syncLog: [...(seed?.syncLog ?? [])],
    syncState: [...(seed?.syncState ?? [])],
    folders: [...(seed?.folders ?? [])],
  }

  function userSiteIds(userId: unknown) {
    return new Set(
      state.sites
        .filter((site) => site.owner_user_id === userId)
        .map((site) => site.id),
    )
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
            return { count: 11 } as T
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

          if (
            normalized.startsWith("select id, gsc_site_url")
            && normalized.includes("from gsc_sites")
            && normalized.includes("where owner_user_id = ?")
          ) {
            return {
              results: state.sites
                .filter((site) => site.owner_user_id === bound[0])
                .map((site) => ({
                  id: site.id,
                  gsc_site_url: site.gsc_site_url,
                })) as T[],
            }
          }

          if (normalized.startsWith("with log as (")) {
            const sites = state.sites
              .filter((site) => site.owner_user_id === bound[0] && site.enabled === 1)
              .map((site) => {
                const rows = state.syncLog.filter((entry) => entry.site_id === site.id)
                const totalRows = rows.reduce((sum, row) => sum + Number(row.rows ?? 0), 0)
                const okDates = new Set(
                  rows
                    .filter((row) => row.status === "ok")
                    .map((row) => row.date),
                )
                const syncState = state.syncState.find((entry) => entry.site_id === site.id) ?? null
                return {
                  id: site.id,
                  gsc_site_url: site.gsc_site_url,
                  active_run_id: syncState?.active_run_id ?? null,
                  active_run_finished_at: syncState?.active_run_finished_at ?? null,
                  last_synced_date: syncState?.last_synced_date ?? null,
                  dates_synced: okDates.size,
                  total_rows: totalRows,
                }
              })
            return { results: sites as T[] }
          }

          return { results: [] as T[] }
        },
        async run() {
          if (normalized.startsWith("insert into gsc_sites")) {
            const [id, ownerUserId, siteUrl] = bound
            const existing = state.sites.find(
              (site) => site.owner_user_id === ownerUserId && site.gsc_site_url === siteUrl,
            )
            if (existing) {
              existing.enabled = 1
            } else {
              state.sites.push({
                id,
                owner_user_id: ownerUserId,
                gsc_site_url: siteUrl,
                enabled: 1,
              })
            }
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_share_branding")) {
            const shareIds = new Set(
              state.shareLinks
                .filter((share) => share.owner_user_id === bound[0])
                .map((share) => share.id),
            )
            state.shareBranding = state.shareBranding.filter((row) => !shareIds.has(row.share_id))
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_share_links")) {
            state.shareLinks = state.shareLinks.filter((row) => row.owner_user_id !== bound[0])
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_user_preferences")) {
            state.preferences = state.preferences.filter((row) => row.user_id !== bound[0])
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_site_folders")) {
            const ids = userSiteIds(bound[0])
            state.siteFolders = state.siteFolders.filter((row) => !ids.has(row.site_id))
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_pages_daily")) {
            const ids = userSiteIds(bound[0])
            state.pages = state.pages.filter((row) => !ids.has(row.site_id))
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_page_device_daily")) {
            const ids = userSiteIds(bound[0])
            state.devices = state.devices.filter((row) => !ids.has(row.site_id))
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_queries_daily")) {
            const ids = userSiteIds(bound[0])
            state.queries = state.queries.filter((row) => !ids.has(row.site_id))
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_sync_log")) {
            const ids = userSiteIds(bound[0])
            state.syncLog = state.syncLog.filter((row) => !ids.has(row.site_id))
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_sync_state")) {
            const ids = userSiteIds(bound[0])
            state.syncState = state.syncState.filter((row) => !ids.has(row.site_id))
            return { success: true, meta: { changes: 1 } }
          }

          if (normalized.startsWith("delete from gsc_folders")) {
            state.folders = state.folders.filter((row) => row.owner_user_id !== bound[0])
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
  const db = createReseedDb({
    sites: [
      { id: "site-empty", owner_user_id: "user-1", gsc_site_url: "https://empty.example.com/", enabled: 1 },
      { id: "site-ready", owner_user_id: "user-1", gsc_site_url: "https://ready.example.com/", enabled: 1 },
    ],
    shareLinks: [{ id: "share-1", owner_user_id: "user-1" }],
    shareBranding: [{ share_id: "share-1" }],
    preferences: [{ user_id: "user-1" }],
    siteFolders: [{ site_id: "site-empty", folder_id: "folder-1" }],
    pages: [{ site_id: "site-empty", date: "2026-03-08", page: "/" }],
    devices: [{ site_id: "site-empty", date: "2026-03-08", page: "/", device: "mobile" }],
    queries: [{ site_id: "site-empty", date: "2026-03-08", query: "brand" }],
    syncLog: [{ site_id: "site-empty", date: "2026-03-08", rows: 10, status: "ok" }],
    syncState: [{ site_id: "site-empty", last_synced_date: "2026-03-08" }],
    folders: [{ id: "folder-1", owner_user_id: "user-1", name: "Main" }],
  })
  const env = { DB: db } as unknown as CloudflareEnv

  const result = await resetAccountDashboardData(env, "user-1")

  assert.equal(result.ok, true)
  assert.equal(db.state.sites.length, 2)
  assert.equal(db.state.pages.length, 0)
  assert.equal(db.state.devices.length, 0)
  assert.equal(db.state.queries.length, 0)
  assert.equal(db.state.syncLog.length, 0)
  assert.equal(db.state.syncState.length, 0)
  assert.equal(db.state.shareLinks.length, 0)
  assert.equal(db.state.shareBranding.length, 0)
}

{
  enqueueSyncForSite.mockImplementation(async (_env, siteId: string) => {
    if (siteId === "site-empty") return 42
    if (siteId === "site-ready") return 0
    return 21
  })
  listUserGscSites.mockImplementation(async () => ([
    { siteUrl: "https://empty.example.com", permissionLevel: "siteOwner" },
    { siteUrl: "https://ready.example.com", permissionLevel: "siteOwner" },
    { siteUrl: "https://new.example.com", permissionLevel: "siteOwner" },
  ]))

  const db = createReseedDb({
    sites: [
      { id: "site-empty", owner_user_id: "user-1", gsc_site_url: "https://empty.example.com/", enabled: 1 },
      { id: "site-ready", owner_user_id: "user-1", gsc_site_url: "https://ready.example.com/", enabled: 1 },
    ],
    syncLog: [{ site_id: "site-ready", date: "2026-03-08", rows: 25, status: "ok" }],
    syncState: [{ site_id: "site-ready", last_synced_date: "2026-03-08" }],
  })
  const env = { DB: db } as unknown as CloudflareEnv

  const result = await reseedAccountDashboardData(env, "user-1")
  assert.equal(result.ok, true)
  assert.equal(result.data.discoveredSites, 3)
  assert.equal(result.data.eligibleSites, 2)
  assert.equal(result.data.queuedSites, 2)
  assert.equal(result.data.queuedDays, 63)
  assert.equal(result.data.skippedReadySites, 1)
  assert.equal(result.data.skippedRunningSites, 0)
  assert.equal(enqueueSyncForSite.mock.calls.length, 2)

  const newSite = db.state.sites.find((site) => site.gsc_site_url === "https://new.example.com/")
  assert.ok(newSite)
  assert.equal(result.data.queuedSiteIds.includes("site-empty"), true)
  assert.equal(result.data.queuedSiteIds.includes(String(newSite?.id)), true)
}

console.log("gsc-reseed-service spec passed")

import assert from "node:assert/strict"
import { createShare } from "./gsc-service"

type FakeRow = Record<string, unknown>

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

function createShareDb(seed?: {
  sites?: FakeRow[]
  folders?: FakeRow[]
  shares?: FakeRow[]
  branding?: FakeRow[]
}) {
  const state = {
    sites: [...(seed?.sites ?? [])],
    folders: [...(seed?.folders ?? [])],
    shares: [...(seed?.shares ?? [])],
    branding: [...(seed?.branding ?? [])],
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

          if (normalized.startsWith("select id, gsc_site_url from gsc_sites")) {
            const row = state.sites.find(
              (site) => site.id === bound[0] && site.owner_user_id === bound[1],
            )
            return (row ? { id: row.id, gsc_site_url: row.gsc_site_url } : null) as T | null
          }

          if (normalized.startsWith("select id, name from gsc_folders")) {
            const row = state.folders.find(
              (folder) => folder.id === bound[0] && folder.owner_user_id === bound[1],
            )
            return (row ? { id: row.id, name: row.name } : null) as T | null
          }

          if (
            normalized.includes("from gsc_share_links")
            && normalized.includes("owner_user_id = ?")
            && normalized.includes("scope_type = ?")
            && normalized.includes("scope_id = ?")
            && normalized.includes("status = 'active'")
          ) {
            const row = state.shares.find(
              (share) =>
                share.owner_user_id === bound[0]
                && share.scope_type === bound[1]
                && share.scope_id === bound[2]
                && share.status === "active",
            )
            return (row
              ? {
                  id: row.id,
                  token: row.token,
                  expires_at: row.expires_at,
                  scope_type: row.scope_type,
                  scope_id: row.scope_id,
                }
              : null) as T | null
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

          return { results: [] as T[] }
        },
        async run() {
          if (normalized.startsWith("insert into gsc_share_links")) {
            state.shares.push({
              id: bound[0],
              owner_user_id: bound[1],
              scope_type: bound[2],
              scope_id: bound[3],
              token: bound[4],
              token_hash: bound[5],
              status: "active",
              expires_at: bound[6],
              default_start: bound[7],
              default_end: bound[8],
              default_compare_mode: bound[9],
              default_compare_start: bound[10],
              default_compare_end: bound[11],
              default_granularity: bound[12],
            })
          }

          if (normalized.startsWith("insert into gsc_share_branding")) {
            state.branding.push({
              share_id: bound[0],
              brand_name: bound[1],
              logo_url: bound[2],
              favicon_url: bound[3],
              accent_color: bound[4],
              header_bg_color: bound[5],
              text_color: bound[6],
              show_powered_by: bound[7],
            })
          }

          return { success: true, meta: { changes: 1 } }
        },
      }

      return statement
    },
    async batch(_statements: unknown[]) {
      return []
    },
    state,
  }
}

async function main() {
  const db = createShareDb({
    sites: [{ id: "site-1", owner_user_id: "user-1", gsc_site_url: "https://example.com/" }],
  })

  const env = {
    DB: db,
  } as unknown as CloudflareEnv

  const request = new Request("https://zenshi.dev/api/mobile/v1/shares", {
    method: "POST",
  })

  const first = await createShare(env, "user-1", request, {
    scopeType: "site",
    scopeId: "site-1",
  })

  assert.equal(first.ok, true)

  const second = await createShare(env, "user-1", request, {
    scopeType: "site",
    scopeId: "site-1",
  })

  assert.equal(second.ok, true)
  assert.equal(second.data.id, first.data.id)
  assert.equal(second.data.shareUrl, first.data.shareUrl)
  assert.equal(db.state.shares.length, 1)

  console.log("gsc-share-service spec passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

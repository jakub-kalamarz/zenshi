import assert from "node:assert/strict"
import { buildSyncStatusView } from "./gsc-service"

const active = buildSyncStatusView(
  {
    id: "site-1",
    gsc_site_url: "sc-domain:example.com",
    last_synced_date: "2026-03-08",
    status: "ok",
    error_message: null,
    updated_at: "2026-03-12T10:10:00.000Z",
    backfill_cursor_date: null,
    total_rows: 1200,
    dates_synced: 112,
    truncated_dates: 0,
    min_date: "2025-09-01",
    max_date: "2026-03-08",
    active_run_id: "run-1",
    active_run_state: "syncing",
    active_run_started_at: "2026-03-12T10:00:00.000Z",
    active_run_last_progress_at: "2026-03-12T10:10:00.000Z",
    active_run_finished_at: null,
    active_run_total_units: 175,
    active_run_processed_units: 112,
    active_run_warning_count: 0,
    active_run_error_count: 0,
  },
  {
    expectedDays: 175,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    nowMs: new Date("2026-03-12T10:10:30.000Z").getTime(),
  },
)

assert.equal(active.siteId, "site-1")
assert.equal(active.activeRun?.runId, "run-1")
assert.equal(active.activeRun?.state, "syncing")
assert.equal(active.activeRun?.progressPercent, 64)
assert.equal(active.activeRun?.dataFreshThrough, "2026-03-08")
assert.equal(active.activeRun?.stallState, "normal")
assert.equal(active.activeRun?.etaSeconds, 354)
assert.equal(active.lastCompletedRun, null)

const queued = buildSyncStatusView(
  {
    id: "site-2",
    gsc_site_url: "https://example.org",
    last_synced_date: "2026-03-05",
    status: "ok",
    error_message: null,
    updated_at: "2026-03-12T09:55:00.000Z",
    backfill_cursor_date: null,
    total_rows: 200,
    dates_synced: 90,
    truncated_dates: 0,
    min_date: "2025-09-01",
    max_date: "2026-03-05",
    active_run_id: "run-2",
    active_run_state: "queued",
    active_run_started_at: "2026-03-12T10:08:00.000Z",
    active_run_last_progress_at: "2026-03-12T10:08:00.000Z",
    active_run_finished_at: null,
    active_run_total_units: 20,
    active_run_processed_units: 0,
    active_run_warning_count: 0,
    active_run_error_count: 0,
  },
  {
    expectedDays: 175,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    nowMs: new Date("2026-03-12T10:10:30.000Z").getTime(),
  },
)

assert.equal(queued.activeRun?.state, "queued")
assert.equal(queued.activeRun?.etaSeconds, null)
assert.equal(queued.activeRun?.stallState, "normal")
assert.equal(queued.lastSuccessfulDataFreshThrough, "2026-03-05")

const stalled = buildSyncStatusView(
  {
    id: "site-3",
    gsc_site_url: "https://example.net",
    last_synced_date: "2026-03-07",
    status: "error",
    error_message: "Rate limited",
    updated_at: "2026-03-12T10:00:00.000Z",
    backfill_cursor_date: "2025-11-02",
    total_rows: 500,
    dates_synced: 100,
    truncated_dates: 2,
    min_date: "2025-09-01",
    max_date: "2026-03-07",
    active_run_id: "run-3",
    active_run_state: "error",
    active_run_started_at: "2026-03-12T09:50:00.000Z",
    active_run_last_progress_at: "2026-03-12T09:58:00.000Z",
    active_run_finished_at: "2026-03-12T09:58:00.000Z",
    active_run_total_units: 20,
    active_run_processed_units: 14,
    active_run_warning_count: 1,
    active_run_error_count: 1,
  },
  {
    expectedDays: 175,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    nowMs: new Date("2026-03-12T10:10:30.000Z").getTime(),
  },
)

assert.equal(stalled.activeRun, null)
assert.equal(stalled.lastCompletedRun?.state, "error")
assert.equal(stalled.lastCompletedRun?.stallState, "stalled")
assert.equal(stalled.lastCompletedRun?.errorMessage, "Rate limited")

console.log("gsc-sync-status spec passed")

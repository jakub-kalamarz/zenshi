import assert from "node:assert/strict"
import {
  buildSyncDashboardSummary,
  describeSyncCardState,
  type SyncStatus,
} from "./sync-dashboard"

const statuses: SyncStatus[] = [
  {
    siteId: "site-1",
    siteUrl: "sc-domain:example.com",
    lastSyncedDate: "2026-03-08",
    status: "ok",
    errorMessage: null,
    updatedAt: "2026-03-12T10:10:00.000Z",
    backfillCursorDate: null,
    totalRows: 1200,
    datesSynced: 112,
    truncatedDates: 0,
    minDate: "2025-09-01",
    maxDate: "2026-03-08",
    isSyncing: true,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    expectedDays: 175,
    syncedDays: 112,
    remainingDays: 63,
    syncProgressPct: 64,
    activeRun: {
      runId: "run-1",
      state: "syncing",
      progressPercent: 64,
      processedUnits: 112,
      totalUnits: 175,
      unitLabel: "days",
      currentUnit: "2026-03-08",
      dataFreshThrough: "2026-03-08",
      etaSeconds: 354,
      startedAt: "2026-03-12T10:00:00.000Z",
      lastProgressAt: "2026-03-12T10:10:00.000Z",
      finishedAt: null,
      queuePosition: null,
      queueDelaySeconds: null,
      stallState: "normal",
      stallReason: null,
      errorMessage: null,
    },
    lastCompletedRun: null,
    lastSuccessfulDataFreshThrough: "2026-03-08",
    lastVisibleDataUpdatedAt: "2026-03-12T10:10:00.000Z",
    healthSummary: "healthy",
  },
  {
    siteId: "site-2",
    siteUrl: "https://example.org",
    lastSyncedDate: "2026-03-05",
    status: "ok",
    errorMessage: null,
    updatedAt: "2026-03-12T10:08:00.000Z",
    backfillCursorDate: null,
    totalRows: 200,
    datesSynced: 90,
    truncatedDates: 0,
    minDate: "2025-09-01",
    maxDate: "2026-03-05",
    isSyncing: true,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    expectedDays: 175,
    syncedDays: 90,
    remainingDays: 85,
    syncProgressPct: 51,
    activeRun: {
      runId: "run-2",
      state: "queued",
      progressPercent: 0,
      processedUnits: 0,
      totalUnits: 20,
      unitLabel: "days",
      currentUnit: null,
      dataFreshThrough: "2026-03-05",
      etaSeconds: null,
      startedAt: "2026-03-12T10:08:00.000Z",
      lastProgressAt: "2026-03-12T10:08:00.000Z",
      finishedAt: null,
      queuePosition: 2,
      queueDelaySeconds: 90,
      stallState: "normal",
      stallReason: null,
      errorMessage: null,
    },
    lastCompletedRun: null,
    lastSuccessfulDataFreshThrough: "2026-03-05",
    lastVisibleDataUpdatedAt: "2026-03-12T10:08:00.000Z",
    healthSummary: "healthy",
  },
  {
    siteId: "site-3",
    siteUrl: "https://example.net",
    lastSyncedDate: "2026-03-07",
    status: "error",
    errorMessage: "Rate limited",
    updatedAt: "2026-03-12T09:58:00.000Z",
    backfillCursorDate: null,
    totalRows: 500,
    datesSynced: 100,
    truncatedDates: 2,
    minDate: "2025-09-01",
    maxDate: "2026-03-07",
    isSyncing: false,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    expectedDays: 175,
    syncedDays: 100,
    remainingDays: 75,
    syncProgressPct: 57,
    activeRun: null,
    lastCompletedRun: {
      runId: "run-3",
      state: "error",
      progressPercent: 70,
      processedUnits: 14,
      totalUnits: 20,
      unitLabel: "days",
      currentUnit: "2026-03-07",
      dataFreshThrough: "2026-03-07",
      etaSeconds: null,
      startedAt: "2026-03-12T09:50:00.000Z",
      lastProgressAt: "2026-03-12T09:58:00.000Z",
      finishedAt: "2026-03-12T09:58:00.000Z",
      queuePosition: null,
      queueDelaySeconds: null,
      stallState: "stalled",
      stallReason: "No progress detected recently.",
      errorMessage: "Rate limited",
    },
    lastSuccessfulDataFreshThrough: "2026-03-07",
    lastVisibleDataUpdatedAt: "2026-03-12T09:58:00.000Z",
    healthSummary: "error",
  },
]

const summary = buildSyncDashboardSummary(statuses)
assert.equal(summary.activeCount, 2)
assert.equal(summary.queuedCount, 1)
assert.equal(summary.attentionCount, 1)
assert.equal(summary.freshestDate, "2026-03-08")

const activeDescription = describeSyncCardState(statuses[0])
assert.equal(activeDescription.tone, "active")
assert.equal(activeDescription.primaryKey, "syncing")
assert.equal(activeDescription.secondaryKey, "eta")

const queuedDescription = describeSyncCardState(statuses[1])
assert.equal(queuedDescription.primaryKey, "queued")
assert.equal(queuedDescription.secondaryKey, "queue")

const failedDescription = describeSyncCardState(statuses[2])
assert.equal(failedDescription.tone, "error")
assert.equal(failedDescription.primaryKey, "error")
assert.equal(failedDescription.secondaryKey, "freshness")

console.log("sync-dashboard spec passed")

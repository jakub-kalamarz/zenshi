import assert from "node:assert/strict"
import {
  buildSyncRanges,
  buildStagedSyncMessages,
  buildSyncRangesNewestFirst,
  canBeginQueuedSyncRun,
  interleaveQueuedMessages,
  runBoundedTasks,
  shouldAutoContinueInitialSync,
  splitSyncRange,
  summarizeRangeDayOutcomes,
  syncMessageKey,
  type RangeDayOutcome,
} from "./gsc-sync"

const ranges = buildSyncRanges([
  "2026-03-01",
  "2026-03-02",
  "2026-03-03",
  "2026-03-04",
  "2026-03-05",
  "2026-03-06",
  "2026-03-07",
  "2026-03-08",
  "2026-03-09",
  "2026-03-10",
  "2026-03-11",
  "2026-03-12",
])

assert.deepEqual(ranges, [
  { startDate: "2026-03-01", endDate: "2026-03-10" },
  { startDate: "2026-03-11", endDate: "2026-03-12" },
])

assert.deepEqual(
  buildSyncRangesNewestFirst([
    "2026-03-01",
    "2026-03-02",
    "2026-03-11",
    "2026-03-12",
  ]),
  [
    { startDate: "2026-03-11", endDate: "2026-03-12" },
    { startDate: "2026-03-01", endDate: "2026-03-02" },
  ],
)

const summary = summarizeRangeDayOutcomes([
  { date: "2026-03-01", status: "ok", advanceFreshness: true },
  { date: "2026-03-02", status: "empty", advanceFreshness: false },
  { date: "2026-03-03", status: "ok", advanceFreshness: true },
  { date: "2026-03-04", status: "error", advanceFreshness: false },
] satisfies RangeDayOutcome[])

assert.deepEqual(summary.replaceDates, ["2026-03-01", "2026-03-03"])
assert.equal(summary.processedUnits, 4)
assert.equal(summary.warningCount, 1)
assert.equal(summary.errorCount, 1)
assert.equal(summary.freshestDate, "2026-03-03")
assert.equal(summary.finalState, "error")

assert.equal(
  shouldAutoContinueInitialSync({
    site_id: "site-1",
    backfill_cursor_date: "2025-10-01",
    active_run_state: "success",
    active_run_finished_at: "2026-03-12T10:05:00.000Z",
  }),
  true,
)

assert.equal(
  shouldAutoContinueInitialSync({
    site_id: "site-2",
    backfill_cursor_date: "2025-10-01",
    active_run_state: "error",
    active_run_finished_at: "2026-03-12T10:05:00.000Z",
  }),
  false,
)

assert.equal(
  canBeginQueuedSyncRun({
    active_run_id: null,
    active_run_finished_at: null,
  }),
  true,
)

assert.equal(
  canBeginQueuedSyncRun({
    active_run_id: "run-1",
    active_run_finished_at: "2026-03-12T10:05:00.000Z",
  }),
  true,
)

assert.equal(
  canBeginQueuedSyncRun({
    active_run_id: "run-1",
    active_run_finished_at: null,
  }),
  false,
)

assert.equal(
  shouldAutoContinueInitialSync({
    site_id: "site-3",
    backfill_cursor_date: null,
    active_run_state: "success",
    active_run_finished_at: "2026-03-12T10:05:00.000Z",
  }),
  false,
)

const interleaved = interleaveQueuedMessages([
  [
    { body: { siteId: "site-a", startDate: "2026-03-01", endDate: "2026-03-10" } },
    { body: { siteId: "site-a", startDate: "2026-03-11", endDate: "2026-03-20" } },
  ],
  [
    { body: { siteId: "site-b", startDate: "2026-03-01", endDate: "2026-03-10" } },
    { body: { siteId: "site-b", startDate: "2026-03-11", endDate: "2026-03-20" } },
  ],
  [
    { body: { siteId: "site-c", startDate: "2026-03-01", endDate: "2026-03-10" } },
  ],
])

assert.deepEqual(interleaved.map((message) => message.body.siteId), [
  "site-a",
  "site-b",
  "site-c",
  "site-a",
  "site-b",
])

async function main() {
  const starts: number[] = []
  const finishes: number[] = []
  let active = 0
  let maxActive = 0

  const taskDurations = [60, 60, 10]
  const taskOrder = await runBoundedTasks(taskDurations, 2, async (duration, index) => {
    starts.push(index)
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, duration))
    active -= 1
    finishes.push(index)
    return `task-${index}`
  })

  assert.equal(maxActive, 2)
  assert.deepEqual(taskOrder, ["task-0", "task-1", "task-2"])
  assert.deepEqual(starts.slice(0, 2), [0, 1])
  assert.equal(finishes.includes(2), true)

  console.log("gsc-sync spec passed")
}

void main()

// Staged first sync: recent pages, then recent queries, then older history, each newest first.
function datesBetween(start: string, end: string) {
  const out: string[] = []
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const staged = buildStagedSyncMessages(
  "site-1",
  datesBetween("2026-01-01", "2026-03-31"),
  "2026-03-31",
  30,
)
const stagedKinds = staged.map((message) => message.kind)
assert.deepEqual(stagedKinds.slice(0, 3), ["pages", "pages", "pages"])
assert.deepEqual(stagedKinds.slice(3, 6), ["queries", "queries", "queries"])
assert.ok(stagedKinds.slice(6).every((kind) => kind === "full"))
assert.deepEqual(
  [staged[0].startDate, staged[0].endDate],
  ["2026-03-22", "2026-03-31"],
)
assert.equal(staged[3].endDate, "2026-03-31")
assert.equal(staged[6].endDate, "2026-03-01")
assert.equal(staged.at(-1)?.startDate, "2026-01-01")

// A daily top-up is not staged.
assert.deepEqual(
  buildStagedSyncMessages("site-1", ["2026-03-30", "2026-03-31"], "2026-03-31", 90).map((m) => m.kind),
  ["full"],
)

assert.deepEqual(splitSyncRange("2026-03-01", "2026-03-10"), [
  { startDate: "2026-03-01", endDate: "2026-03-05" },
  { startDate: "2026-03-06", endDate: "2026-03-10" },
])
assert.deepEqual(splitSyncRange("2026-03-01", "2026-03-03"), [
  { startDate: "2026-03-01", endDate: "2026-03-02" },
  { startDate: "2026-03-03", endDate: "2026-03-03" },
])
assert.equal(splitSyncRange("2026-03-01", "2026-03-01"), null)

assert.notEqual(
  syncMessageKey({ siteId: "s", startDate: "2026-03-01", endDate: "2026-03-10", kind: "pages" }),
  syncMessageKey({ siteId: "s", startDate: "2026-03-01", endDate: "2026-03-10", kind: "queries" }),
)
assert.equal(
  syncMessageKey({ siteId: "s", startDate: "2026-03-01", endDate: "2026-03-10" }),
  syncMessageKey({ siteId: "s", startDate: "2026-03-01", endDate: "2026-03-10", kind: "full" }),
)

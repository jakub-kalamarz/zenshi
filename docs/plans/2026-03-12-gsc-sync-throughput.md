# GSC Sync Throughput Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce GSC sync wall-clock time by increasing bounded parallelism, shrinking range size, and adding timing instrumentation without removing backfill.

**Architecture:** The queue consumer remains the entry point, but batch processing moves from fully sequential to bounded parallel execution. Range work remains per-site and per-range, with smaller 10-day chunks and lightweight timing logs around the expensive phases.

**Tech Stack:** TypeScript, Cloudflare Workers Queues, D1, Wrangler, node `assert` specs with `tsx`

---

### Task 1: Lock Down Chunking and Batch Execution Behavior

**Files:**
- Create: `web/lib/gsc-sync.spec.ts`
- Modify: `web/lib/gsc-sync.ts`

**Step 1: Write the failing test**

Add specs that prove:
- `datesToRanges()` splits contiguous dates into 10-day ranges
- `processSyncBatch()` can process multiple messages concurrently while preserving per-message success/failure reporting

**Step 2: Run test to verify it fails**

Run: `node --import tsx web/lib/gsc-sync.spec.ts`
Expected: FAIL because the needed test seams and new behavior do not exist yet.

**Step 3: Write minimal implementation**

Expose or add the smallest testable helpers needed to verify chunking and bounded parallel execution.

**Step 4: Run test to verify it passes**

Run: `node --import tsx web/lib/gsc-sync.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add web/lib/gsc-sync.ts web/lib/gsc-sync.spec.ts
git commit -m "Improve GSC sync batch throughput"
```

### Task 2: Implement Throughput Changes

**Files:**
- Modify: `web/lib/gsc-sync.ts`
- Modify: `web/wrangler.toml`

**Step 1: Write the failing test**

Extend `web/lib/gsc-sync.spec.ts` with any missing assertion for the chosen in-worker concurrency limit if required.

**Step 2: Run test to verify it fails**

Run: `node --import tsx web/lib/gsc-sync.spec.ts`
Expected: FAIL until the production behavior matches the spec.

**Step 3: Write minimal implementation**

Implement:
- `RANGE_CHUNK_DAYS = 10`
- bounded parallel processing inside `processSyncBatch()`
- queue consumer `max_concurrency = 2`

**Step 4: Run test to verify it passes**

Run: `node --import tsx web/lib/gsc-sync.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add web/lib/gsc-sync.ts web/wrangler.toml web/lib/gsc-sync.spec.ts
git commit -m "Tune GSC sync queue concurrency"
```

### Task 3: Add Timing Instrumentation

**Files:**
- Modify: `web/lib/gsc-sync.ts`

**Step 1: Write the failing test**

Only if instrumentation requires a helper with observable output. Otherwise skip new tests and keep instrumentation minimal and local.

**Step 2: Write minimal implementation**

Add concise `console.info` timing logs for:
- page/device fetch duration
- query fetch duration
- total range duration
- processed row counts and range bounds

**Step 3: Run focused verification**

Run:
- `node --import tsx web/lib/gsc-sync.spec.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add web/lib/gsc-sync.ts web/lib/gsc-sync.spec.ts
git commit -m "Add GSC sync timing instrumentation"
```

### Task 4: Verify Before Reset And Rerun

**Files:**
- Check: `web/lib/gsc-sync.ts`
- Check: `web/wrangler.toml`
- Check: `web/lib/gsc-sync.spec.ts`

**Step 1: Run verification**

Run:
- `node --import tsx web/lib/gsc-sync.spec.ts`

**Step 2: Record next operational step**

After deploy, reset sync data and rerun backfill to compare:
- wall-clock duration
- active run progression
- error and empty ratios


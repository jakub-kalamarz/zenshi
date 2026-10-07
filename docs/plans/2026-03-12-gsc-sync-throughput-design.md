# GSC Sync Throughput Design

**Goal:** Reduce end-to-end GSC sync wall-clock time without removing mandatory backfill.

## Context

Live inspection on March 12, 2026 showed that the slow path is not a permanently blocked queue. The dominant cost comes from heavy per-range work combined with nearly single-threaded execution:

- queue consumer concurrency is `1`
- queue batches are processed sequentially
- each range performs two GSC API traversals
- a 30-day range is expensive for larger properties

Observed live run shape:

- one site processed 486 units from `2026-03-12 16:46:38` to `2026-03-12 17:40:01`
- this is roughly 53 minutes for a large backfill run
- recent `empty` statuses cluster around fresh dates and do not explain the main throughput issue

## Chosen Approach

Apply a narrow throughput-focused change set:

1. Increase queue consumer concurrency from `1` to `2`
2. Process queue batch messages in parallel with a small in-worker limit
3. Reduce `RANGE_CHUNK_DAYS` from `30` to `10`
4. Add timing logs around each range sync and each GSC fetch phase

## Why This Approach

- It preserves backfill as required.
- It attacks both system throughput and single-range latency.
- It keeps risk bounded by staying at low concurrency.
- It gives measurement data after the reset-and-resync run.

## Rejected Alternatives

### Only increase queue concurrency

Rejected because the current worker still processes each message sequentially inside a batch, so some available parallelism would remain unused.

### Only shrink range size

Rejected because smaller chunks help, but the queue would still serialize work too aggressively.

### Large concurrency jump

Rejected because there is not enough evidence yet about Google quota headroom. Going directly above `2` or `3` would be guesswork.

## Risks

- More parallel requests can increase `429` or quota-related retries.
- Smaller chunks produce more queue messages.
- Timing logs add noise if they are too verbose.

## Success Criteria

- Manual backfill resync completes materially faster than the current baseline.
- No increase in systematic failure modes during the observed rerun.
- Logs clearly show time spent in:
  - page/device fetch
  - query fetch
  - D1 write phase
  - full range processing

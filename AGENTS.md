# GSC Sync Worker (Cloudflare)

## Goal
Single Cloudflare Worker deployment serves Next.js UI/API and runs Google Search Console (GSC) data sync. Sync can run in **queue mode** (preferred) or **direct mode** (fallback).

## Modes

### 1) Queue mode (preferred)
- **Cron**: `0 2 * * *` (UTC) triggers daily sync.
- **Producer**: `enqueueDailySync(env)` loads active sites and enqueues `{ siteId, date }` into `gsc-sync`.
- **Consumer**: `queue()` processes batches and calls `processSyncMessage()`.
- **Processing**:
  - fetch GSC data for `page + device` per day
  - paginate `rowLimit=25k`, max 2 pages
  - upsert into `gsc_pages_daily`
  - update `gsc_sync_state`, insert into `gsc_sync_log`

### 2) Direct mode (fallback)
- **Cron**: `0 2 * * *` (UTC).
- **Cron handler** calls `runDailySyncDirect(env)` which iterates active sites and runs `processSyncMessage()` without queues.
- Use when Queues are not active in API or block deploy.

## Switching modes

### Enable Queue mode
1. Create queue:
   ```bash
   npx wrangler queues create gsc-sync --message-retention-period-secs=86400
   ```
2. Enable queues in `wrangler.toml`:
   ```toml
   [queues]
   producers = [{ queue = "gsc-sync", binding = "GSC_SYNC_QUEUE" }]
   consumers = [{ queue = "gsc-sync", max_batch_size = 5, max_batch_timeout = 5, max_retries = 3 }]
   ```
3. In `custom-worker.ts`:
   ```ts
   ctx.waitUntil(enqueueDailySync(env))
   ```
4. Deploy:
   ```bash
   pnpm opennextjs-cloudflare deploy
   ```

### Enable Direct mode
1. Remove `queues` section from `wrangler.toml`.
2. In `custom-worker.ts`:
   ```ts
   ctx.waitUntil(runDailySyncDirect(env))
   ```
3. Deploy:
   ```bash
   pnpm opennextjs-cloudflare deploy
   ```

## Key files
- `custom-worker.ts` – Worker entry (`fetch`, `scheduled`, `queue`).
- `lib/gsc.ts` – OAuth refresh + GSC API calls.
- `lib/gsc-sync.ts` – sync logic + D1 upserts.
- `migrations/0001_gsc.sql` – D1 schema.
- `wrangler.toml` – bindings (D1, assets, queues, cron).


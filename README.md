# zenshi

Zenshi is a Next.js + Cloudflare Worker app for syncing Google Search Console (GSC) data and exploring it in a dashboard.

## Tech stack

- Next.js 16 + React 19
- Cloudflare Workers (OpenNext)
- Cloudflare D1 (storage)
- Cloudflare Queues (preferred sync mode)

## Features

- OAuth login with Google
- GSC data synchronization (`page + device` daily rows)
- Queue mode and direct mode sync execution
- Shared dashboard links
- Multi-locale routing (EN/PL/DE)

## Screenshots

### Dashboard view

![Dashboard view](./docs/dashboard-view.png)

### Site card view

![Site card view](./docs/site-card-view.png)

## Prerequisites

- Node.js 20+
- `pnpm`
- Cloudflare account with Workers/D1/R2/Queues enabled
- Google Cloud OAuth credentials
- Google Search Console access

## Quick start (local)

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment:

```bash
cp .env.example .env
cp wrangler.toml.example wrangler.toml
```

3. Fill required values in `.env`:

- `AUTH_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `GOOGLE_API_KEY`
- `NEXT_PUBLIC_SITE_URL`

4. Fill required values in `wrangler.toml`:

- `routes.pattern`
- `d1_databases.database_name`
- `d1_databases.database_id`
- `r2_buckets.bucket_name`

5. Run development server:

```bash
pnpm dev
```

## Database setup

Create D1 database and apply migrations:

```bash
npx wrangler d1 create <your-db-name>
npx wrangler d1 migrations apply <your-db-name> --remote
```

Then copy generated `database_id` to `wrangler.toml`.

## Sync modes

### Queue mode (preferred)

- Cron: `0 2 * * *` UTC
- `scheduled` handler enqueues one message per active site
- `queue` handler processes batches and writes to D1

Queue setup:

```bash
npx wrangler queues create gsc-sync --message-retention-period-secs=86400
```

Ensure `wrangler.toml` has producers/consumers configured under `[queues]`.

### Direct mode (fallback)

Use direct mode when queue bindings are unavailable.

- Remove `[queues]` from `wrangler.toml`
- In `custom-worker.ts`, use `runDailySyncDirect(env)` in the scheduled handler

## Build and deploy

```bash
pnpm build
pnpm deploy
```

## Scripts

- `pnpm dev` - Run Next.js locally
- `pnpm lint` - Lint codebase
- `pnpm build` - Build Next.js app
- `pnpm preview` - Build + preview via OpenNext Cloudflare
- `pnpm deploy` - Build + deploy via OpenNext Cloudflare

## Security and disclosure

Please review [SECURITY.md](./SECURITY.md) before reporting vulnerabilities.

## Contributing

Please review [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

MIT - see [LICENSE](./LICENSE).

## Troubleshooting

- OAuth callback mismatch: verify `AUTH_URL` and Google OAuth redirect URI.
- Missing worker bindings: verify D1/R2/Queues sections in `wrangler.toml`.
- No sync data: check cron trigger, queue consumer logs, and GSC property permissions.

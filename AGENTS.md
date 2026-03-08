# Repository Guidelines

## Project Structure & Module Organization
Zenshi is a Next.js 16 app deployed to Cloudflare Workers via OpenNext.
- `app/`: App Router routes, API handlers (`app/api/*`), auth, sync pages, and locale-aware routes under `app/[locale]`.
- `components/`: Shared UI and feature components (`ui`, `gsc`, `share`, `kibo-ui`).
- `lib/`: Core business logic and helpers (auth, GSC processing, credentials), plus lightweight spec files.
- `i18n/` and `messages/`: Internationalization config and translation JSON files.
- `migrations/`: Cloudflare D1 SQL migrations.
- `docs/`: Project documentation and screenshots.

## Build, Test, and Development Commands
Use `pnpm` with Node.js 20+.
- `pnpm install`: Install dependencies.
- `pnpm dev`: Run local Next.js development server.
- `pnpm lint`: Run ESLint (Next core-web-vitals + TypeScript rules).
- `pnpm build`: Build production Next.js app.
- `pnpm preview`: Build and preview Cloudflare/OpenNext output.
- `pnpm deploy`: Build and deploy to Cloudflare.
- `pnpm cf-typegen`: Regenerate `cloudflare-env.d.ts` from Wrangler bindings.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`) with React 19 function components.
- Imports: Prefer alias paths like `@/lib/...` where appropriate.
- Naming: Components in `PascalCase`, variables/functions in `camelCase`, route folders in lowercase.
- Files: Use descriptive names by domain (example: `lib/gsc-master-chart.ts`).
- Formatting/linting: Follow `eslint.config.mjs`; fix all lint warnings before opening a PR.

## Testing Guidelines
Current CI enforces `pnpm lint` and `pnpm build` on push/PR. Keep both green locally before submitting.
- Place logic tests as `*.spec.ts` near related code (current pattern in `lib/`).
- Prefer deterministic tests with no external network calls.
- If adding a new test runner/script, document it in `README.md` and `package.json`.

## Commit & Pull Request Guidelines
- Branch naming: `feature/*`, `fix/*`, `chore/*`, `docs/*`.
- Commits: small, focused, imperative subject (example: `Fix Scalar API docs config`).
- PRs target `main` and should include: purpose, testing notes (`pnpm lint`, `pnpm build`), linked issue(s), and screenshots for UI changes.

## Security & Configuration Tips
Never commit secrets. Start from `.env.example` and `wrangler.toml.example`, and review `SECURITY.md` before reporting vulnerabilities.

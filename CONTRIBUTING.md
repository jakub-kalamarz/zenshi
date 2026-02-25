# Contributing to zenshi

Thanks for your interest in contributing.

## Development setup

1. Install dependencies:

```bash
pnpm install
```

2. Create local env file:

```bash
cp .env.example .env
```

3. Configure `wrangler.toml` from `wrangler.toml.example` and set your local values.

4. Run the app:

```bash
pnpm dev
```

## Branches and commits

- Branch naming: `feature/*`, `fix/*`, `chore/*`, `docs/*`.
- Keep commits focused and descriptive.
- Reference related issues in commit messages or PR description.

## Pull requests

- Open PRs against `main`.
- Include context, screenshots (if UI changed), and testing notes.
- Keep PRs small enough to review quickly.

## Required checks

PRs should pass:

- `pnpm lint`
- `pnpm build`
- GitHub Actions CI workflow

## Reporting bugs

Use the Bug Report issue template and include reproducible steps.

## Security issues

Do not open public issues for vulnerabilities.

Please follow [SECURITY.md](./SECURITY.md).

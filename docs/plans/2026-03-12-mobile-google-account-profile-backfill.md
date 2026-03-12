# Mobile Google Account Profile Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist and return Google linked-account profile fields so the mobile app receives real `googleAccount.email`, `googleAccount.name`, and `googleAccount.image`.

**Architecture:** Add profile columns to `auth_accounts`, populate them during Google link/relink flows, and read them from the mobile session builder. Keep `auth_users` as the Zenshi user profile and `auth_accounts` as the linked provider profile source. Update web and mobile tests to lock the new contract.

**Tech Stack:** Next.js, Cloudflare Workers, D1 (SQLite), TypeScript, Bun tests, Swift mobile client tests

---

### Task 1: Lock failing backend behavior

**Files:**
- Modify: `web/lib/mobile-auth.spec.ts`
- Modify: `web/lib/mobile-auth.ts`

**Step 1: Write the failing test**

Add a test fixture where `auth_accounts` includes Google `email`, `name`, and `image`, then assert `verifyApiToken(...)` returns those values in `googleAccount`.

**Step 2: Run test to verify it fails**

Run: `bun test web/lib/mobile-auth.spec.ts`
Expected: FAIL because `findLinkedGoogleAccount(...)` currently returns null fields.

**Step 3: Write minimal implementation**

Update `findLinkedGoogleAccount(...)` to read the new profile columns once schema/data support exists.

**Step 4: Run test to verify it passes**

Run: `bun test web/lib/mobile-auth.spec.ts`
Expected: PASS

### Task 2: Persist Google profile fields

**Files:**
- Modify: `web/lib/auth-schema.ts`
- Create: `web/migrations/0016_auth_account_profile.sql`
- Modify: `web/lib/auth.ts`
- Modify: `web/lib/_test-fake-db.ts`

**Step 1: Write the failing test**

Extend existing auth tests to assert Google upsert/relink stores provider profile fields on `auth_accounts`.

**Step 2: Run test to verify it fails**

Run: `bun test web/lib/auth.spec.ts`
Expected: FAIL because `auth_accounts` does not yet store profile data.

**Step 3: Write minimal implementation**

Add D1 columns `email`, `name`, `image`; update create/update/relink SQL to persist normalized profile data; update fake DB support.

**Step 4: Run test to verify it passes**

Run: `bun test web/lib/auth.spec.ts`
Expected: PASS

### Task 3: Update contract tests and mobile expectations

**Files:**
- Modify: `web/lib/mobile-auth.spec.ts`
- Modify: `mobile/zenshiTests/MobileAPIClientTests.swift`

**Step 1: Write/update failing tests**

Assert session payloads include real Google profile fields when present.

**Step 2: Run tests to verify expected failures**

Run: `bun test web/lib/mobile-auth.spec.ts`
Run: `swift test` or the narrow mobile test command used in repo
Expected: mobile/web contract assertions fail before implementation is complete.

**Step 3: Write minimal implementation**

Adjust fixtures and payload expectations only as needed to match the new API contract.

**Step 4: Run tests to verify they pass**

Run the same commands again and confirm green.

### Task 4: Verify and deploy

**Files:**
- Modify: `web/public/openapi-mobile.yaml`
- Modify: `web/docs/openapi-mobile.yaml`

**Step 1: Update docs if schema examples mention null-only Google account payloads**

Keep API docs aligned with actual response shape.

**Step 2: Run verification**

Run:
- `bun test web/lib/auth.spec.ts web/lib/mobile-auth.spec.ts web/lib/mobile-auth-callback-route.spec.ts`
- repo-specific mobile test command for updated client expectations

**Step 3: Deploy and migrate**

Run:
- `npx wrangler whoami`
- `npx wrangler d1 migrations apply <db> --remote`
- deploy command from `web/package.json`

**Step 4: Smoke check**

Fetch the deployed mobile session endpoint or verify logs/config as available.

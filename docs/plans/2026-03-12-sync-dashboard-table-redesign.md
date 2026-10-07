# Sync Dashboard Table Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix sync dashboard counts so active and queued work are reflected reliably, then replace the card grid with a compact operational table that matches the rest of the web app.

**Architecture:** Keep the existing client component and API contract, but move summary and row-state logic into more defensive pure helpers that can be tested first. Rebuild the presentation layer around a table-style layout using existing shadcn primitives and semantic tokens, with a stacked mobile variant inside the same component.

**Tech Stack:** Next.js App Router, React client components, next-intl, Tailwind v4, shadcn/ui, Node assert-based specs.

---

### Task 1: Lock down defensive summary logic

**Files:**
- Modify: `web/components/gsc/sync-dashboard.spec.ts`
- Modify: `web/components/gsc/sync-dashboard.tsx`

**Step 1: Write the failing test**

Add assertions proving summary counts still classify records correctly when `isSyncing` is true but `activeRun` is null, and when `healthSummary` indicates attention without a run object.

**Step 2: Run test to verify it fails**

Run: `node --import tsx web/components/gsc/sync-dashboard.spec.ts`
Expected: FAIL because current summary logic only counts `activeRun`.

**Step 3: Write minimal implementation**

Extract or extend helper logic so summary derives active, queued, and attention from `activeRun`, `isSyncing`, `status`, and `healthSummary`.

**Step 4: Run test to verify it passes**

Run: `node --import tsx web/components/gsc/sync-dashboard.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add web/components/gsc/sync-dashboard.spec.ts web/components/gsc/sync-dashboard.tsx
git commit -m "Fix sync dashboard summary state classification"
```

### Task 2: Add row ordering helpers

**Files:**
- Modify: `web/components/gsc/sync-dashboard.spec.ts`
- Modify: `web/components/gsc/sync-dashboard.tsx`

**Step 1: Write the failing test**

Add assertions for a helper that sorts statuses in this order: attention, active, queued, healthy, then by freshest update.

**Step 2: Run test to verify it fails**

Run: `node --import tsx web/components/gsc/sync-dashboard.spec.ts`
Expected: FAIL because sorting helper does not exist yet.

**Step 3: Write minimal implementation**

Implement a pure sort helper and reuse existing descriptive state helpers rather than duplicating condition logic in JSX.

**Step 4: Run test to verify it passes**

Run: `node --import tsx web/components/gsc/sync-dashboard.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add web/components/gsc/sync-dashboard.spec.ts web/components/gsc/sync-dashboard.tsx
git commit -m "Add sync dashboard row prioritization"
```

### Task 3: Replace cards with compact table layout

**Files:**
- Modify: `web/components/gsc/sync-dashboard.tsx`
- Check: `web/components/ui/badge.tsx`
- Check: `web/components/ui/card.tsx`
- Check: `web/components/ui/separator.tsx`

**Step 1: Write the failing test**

Extend the existing spec coverage around state helpers so the table view can rely on stable text output for badge labels, progress values, and freshness lines.

**Step 2: Run test to verify it fails**

Run: `node --import tsx web/components/gsc/sync-dashboard.spec.ts`
Expected: FAIL on the new textual expectations.

**Step 3: Write minimal implementation**

Rebuild the render path into:
- summary strip at the top
- table header on desktop
- dense row layout with `site`, `status`, `progress`, `freshness`, `updated`, `action`
- stacked mobile rows using the same helper outputs

Use existing semantic tokens and shadcn components where available; avoid raw hard-coded color classes where badge variants or semantic text classes suffice.

**Step 4: Run test to verify it passes**

Run: `node --import tsx web/components/gsc/sync-dashboard.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add web/components/gsc/sync-dashboard.tsx web/components/gsc/sync-dashboard.spec.ts
git commit -m "Redesign sync dashboard as operational table"
```

### Task 4: Verify app-level behavior

**Files:**
- Check: `web/app/[locale]/sync/page.tsx`
- Check: `web/app/globals.css`

**Step 1: Run focused verification**

Run:
- `node --import tsx web/components/gsc/sync-dashboard.spec.ts`
- `node --import tsx web/lib/gsc-sync-status.spec.ts`

Expected: both PASS

**Step 2: Run broader project verification**

Run: `pnpm build`
Expected: successful production build with no type or lint regressions caused by the dashboard rewrite.

**Step 3: Commit**

```bash
git add web/docs/plans/2026-03-12-sync-dashboard-table-redesign-design.md web/docs/plans/2026-03-12-sync-dashboard-table-redesign.md
git commit -m "Document sync dashboard redesign"
```

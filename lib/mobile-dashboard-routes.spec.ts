import assert from "node:assert/strict"
import { mock } from "bun:test"

const listSites = mock(async () => ({ ok: true, data: { sites: [{ id: "site-1" }] } }))
const createSite = mock(async (_env, _userId, siteUrl) => ({ ok: true, data: { id: "site-1", siteUrl } }))
const updateSiteFolder = mock(async () => ({ ok: true, data: { ok: true } }))
const listFolders = mock(async () => ({ ok: true, data: { folders: [{ id: "folder-1", name: "Residential", icon: "building.2", color: "#F97316" }] } }))
const createFolder = mock(async () => ({ ok: true, data: { id: "folder-1", name: "Residential", icon: "building.2", color: "#F97316" } }))
const updateFolder = mock(async () => ({ ok: true, data: { ok: true } }))
const deleteFolder = mock(async () => ({ ok: true, data: { ok: true } }))
const getSiteCardsData = mock(async () => ({ ok: true, data: { results: { "site-1": { total: { clicks: 10 } } } } }))
const parseSiteCardsRequest = mock((_raw: unknown) => ({
  siteIds: ["site-1"],
  start: "2026-02-10",
  end: "2026-03-09",
  compareStart: null,
  compareEnd: null,
  debug: false,
  granularity: "day",
}))
const listShares = mock(async () => ({ ok: true, data: { shares: [{ id: "share-1", scope_type: "site", scope_id: "site-1", status: "active" }] } }))
const createShare = mock(async () => ({ ok: true, data: { id: "share-1", scopeType: "site", scopeId: "site-1", expiresAt: "2026-04-01T00:00:00.000Z", shareUrl: "https://zenshi.dev/share/token" } }))
const updateShare = mock(async () => ({ ok: true, data: { ok: true } }))
const deleteShare = mock(async () => ({ ok: true, data: { ok: true } }))
const enqueueSync = mock(async () => ({ ok: true, data: { ok: true, siteId: "site-1", daysQueued: 42 } }))
const getSyncStatus = mock(async () => ({
  ok: true,
  data: {
    statuses: [{
      siteId: "site-1",
      syncProgressPct: 100,
      lastSuccessfulDataFreshThrough: "2026-03-08",
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
    }],
  },
}))

mock.module("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: { DB: {} },
  }),
}))

mock.module("@/lib/mobile-auth", () => ({
  requireMobileSession: async () => ({
    user: { id: "user-1", email: "user@example.com", name: "User", image: null },
    tokenId: "token-1",
    expiresAt: null,
  }),
}))

mock.module("@/lib/gsc-service", () => ({
  listSites,
  createSite,
  updateSiteFolder,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getSiteCardsData,
  parseSiteCardsRequest,
  listShares,
  createShare,
  updateShare,
  deleteShare,
  enqueueSync,
  getSyncStatus,
}))

const sitesRoute = await import("../app/api/mobile/v1/sites/route")
const foldersRoute = await import("../app/api/mobile/v1/folders/route")
const siteCardsRoute = await import("../app/api/mobile/v1/site-cards/route")
const sharesRoute = await import("../app/api/mobile/v1/shares/route")
const syncRoute = await import("../app/api/mobile/v1/sync/route")
const syncStatusRoute = await import("../app/api/mobile/v1/sync/status/route")

function makeAuthedJsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      authorization: "Bearer token-123",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

{
  const response = await sitesRoute.POST(
    makeAuthedJsonRequest("/api/mobile/v1/sites", "POST", { siteUrl: "https://example.com" }),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.data.siteUrl, "https://example.com")
}

{
  const response = await foldersRoute.GET(
    makeAuthedJsonRequest("/api/mobile/v1/folders", "GET"),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.data.folders[0].id, "folder-1")
}

{
  const response = await siteCardsRoute.POST(
    makeAuthedJsonRequest("/api/mobile/v1/site-cards", "POST", {
      siteIds: ["site-1"],
      start: "2026-02-10",
      end: "2026-03-09",
    }),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.data, {
    "site-1": { total: { clicks: 10 } },
  })
}

{
  const response = await sharesRoute.GET(
    makeAuthedJsonRequest("/api/mobile/v1/shares", "GET"),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.data.shares[0].id, "share-1")
}

{
  const response = await syncRoute.POST(
    makeAuthedJsonRequest("/api/mobile/v1/sync", "POST", { siteId: "site-1" }),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.data.daysQueued, 42)
}

{
  const response = await syncStatusRoute.GET(
    makeAuthedJsonRequest("/api/mobile/v1/sync/status", "GET"),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.data.statuses[0].syncProgressPct, 100)
  assert.equal(payload.data.statuses[0].lastSuccessfulDataFreshThrough, "2026-03-08")
  assert.equal(payload.data.statuses[0].activeRun.runId, "run-1")
  assert.equal(payload.data.statuses[0].activeRun.etaSeconds, 354)
}

console.log("mobile-dashboard-routes spec passed")

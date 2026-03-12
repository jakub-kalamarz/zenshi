import assert from "node:assert/strict"
import { mock } from "bun:test"

const getSiteCardData = mock(async (_env, _userId, params) => ({ ok: true, data: params }))
const getPagesData = mock(async (_env, _userId, params) => ({ ok: true, data: { pages: [params] } }))
const getQueriesData = mock(async (_env, _userId, params) => ({ ok: true, data: { queries: [params] } }))
const getDevicesData = mock(async (_env, _userId, params) => ({ ok: true, data: { devices: [params] } }))

mock.module("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: { DB: {} },
  }),
}))

mock.module("@/lib/mobile-auth", () => ({
  requireMobileSession: async () => ({
    user: { id: "user-1" },
  }),
}))

mock.module("@/lib/gsc-service", () => ({
  getSiteCardData,
  getPagesData,
  getQueriesData,
  getDevicesData,
}))

const siteCardRoute = await import("../app/api/mobile/v1/site-card/route")
const pagesRoute = await import("../app/api/mobile/v1/pages/route")
const queriesRoute = await import("../app/api/mobile/v1/queries/route")
const devicesRoute = await import("../app/api/mobile/v1/devices/route")

function makeAuthedRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      authorization: "Bearer token-123",
    },
  })
}

{
  const response = await siteCardRoute.GET(
    makeAuthedRequest("/api/mobile/v1/site-card?siteId=site-1&start=2026-02-10&end=2026-03-09&compareStart=2026-01-13&compareEnd=2026-02-09&granularity=week"),
  )
  assert.equal(response.status, 200)
  assert.equal(getSiteCardData.mock.calls.length, 1)
  assert.deepEqual(getSiteCardData.mock.calls[0]?.[2], {
    siteId: "site-1",
    start: "2026-02-10",
    end: "2026-03-09",
    compareStart: "2026-01-13",
    compareEnd: "2026-02-09",
    granularity: "week",
  })
}

{
  const response = await pagesRoute.GET(
    makeAuthedRequest("/api/mobile/v1/pages?siteId=site-1&start=2026-02-10&end=2026-03-09&compareStart=2026-01-13&compareEnd=2026-02-09&granularity=day&limit=100"),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(getPagesData.mock.calls[0]?.[2], {
    siteId: "site-1",
    start: "2026-02-10",
    end: "2026-03-09",
    compareStart: "2026-01-13",
    compareEnd: "2026-02-09",
    granularity: "day",
    limit: 100,
  })
}

{
  const response = await queriesRoute.GET(
    makeAuthedRequest("/api/mobile/v1/queries?siteId=site-1&start=2026-02-10&end=2026-03-09&compareStart=2026-01-13&compareEnd=2026-02-09&granularity=month&limit=50"),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(getQueriesData.mock.calls[0]?.[2], {
    siteId: "site-1",
    start: "2026-02-10",
    end: "2026-03-09",
    compareStart: "2026-01-13",
    compareEnd: "2026-02-09",
    granularity: "month",
    limit: 50,
  })
}

{
  const response = await devicesRoute.GET(
    makeAuthedRequest("/api/mobile/v1/devices?siteId=site-1&start=2026-02-10&end=2026-03-09&compareStart=2026-01-13&compareEnd=2026-02-09&granularity=day"),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(getDevicesData.mock.calls[0]?.[2], {
    siteId: "site-1",
    start: "2026-02-10",
    end: "2026-03-09",
    compareStart: "2026-01-13",
    compareEnd: "2026-02-09",
    granularity: "day",
    limit: 200,
  })
}

console.log("mobile-site-detail-routes spec passed")

import type { MobileAuthUser, MobileConnectedGoogleAccount } from "@/lib/mobile-auth"

export const MOBILE_REVIEW_DEMO_EMAIL = "review@zenshi.dev"

const DEMO_GOOGLE_ACCOUNTS: MobileConnectedGoogleAccount[] = [
  {
    accountId: "demo-google-account-primary",
    email: "review@zenshi.dev",
    name: "App Review",
    image: null,
  },
  {
    accountId: "demo-google-account-team",
    email: "review-team@zenshi.dev",
    name: "Review Team",
    image: null,
  },
]

const DEMO_FOLDERS = [
  { id: "folder-1", name: "Social", icon: "building.2", color: "#F97316" },
  { id: "folder-2", name: "Knowledge", icon: "briefcase", color: "#0EA5E9" },
]

const DEMO_SITES = [
  {
    id: "site-1",
    gsc_site_url: "https://facebook.com",
    enabled: 1,
    folder_id: "folder-1",
    folder_name: "Social",
  },
  {
    id: "site-2",
    gsc_site_url: "https://youtube.com",
    enabled: 1,
    folder_id: "folder-1",
    folder_name: "Social",
  },
  {
    id: "site-3",
    gsc_site_url: "https://wikipedia.org",
    enabled: 1,
    folder_id: "folder-2",
    folder_name: "Knowledge",
  },
]

const WIKIPEDIA_PAGE_SLUGS = [
  "Artificial_intelligence",
  "World_War_II",
  "Poland",
  "Europe",
  "United_States",
  "Mathematics",
  "Physics",
  "Computer_science",
  "Internet",
  "History",
  "Biology",
  "Chemistry",
  "Earth",
  "Solar_System",
  "Machine_learning",
  "Philosophy",
  "Economics",
  "Geography",
  "Music",
  "Film",
]

const WIKIPEDIA_QUERY_LABELS = [
  "artificial intelligence wikipedia",
  "world war 2 wikipedia",
  "poland wikipedia",
  "europe wikipedia",
  "united states wikipedia",
  "mathematics wikipedia",
  "physics wikipedia",
  "computer science wikipedia",
  "internet wikipedia",
  "history wikipedia",
  "biology wikipedia",
  "chemistry wikipedia",
  "earth wikipedia",
  "solar system wikipedia",
  "machine learning wikipedia",
  "philosophy wikipedia",
  "economics wikipedia",
  "geography wikipedia",
  "music wikipedia",
  "film wikipedia",
]

const WIKIPEDIA_PAGES = WIKIPEDIA_PAGE_SLUGS.map((slug, index) => ({
  page: `/wiki/${slug}`,
  clicks: 212 - index * 6,
  impressions: 4520 - index * 115,
  ctr: Number((0.047 + index * 0.0004).toFixed(3)),
  position: Number((4.2 + index * 0.18).toFixed(1)),
  compareClicks: 180 - index * 5,
  compareImpressions: 4210 - index * 108,
  compareCtr: Number((0.043 + index * 0.00035).toFixed(3)),
  comparePosition: Number((4.8 + index * 0.17).toFixed(1)),
}))

const WIKIPEDIA_QUERIES = WIKIPEDIA_QUERY_LABELS.map((query, index) => ({
  query,
  clicks: 133 - index * 3,
  impressions: 2520 - index * 62,
  ctr: Number((0.053 - index * 0.0002).toFixed(3)),
  position: Number((3.8 + index * 0.14).toFixed(1)),
  compareClicks: 120 - index * 3,
  compareImpressions: 2340 - index * 58,
  compareCtr: Number((0.051 - index * 0.00018).toFixed(3)),
  comparePosition: Number((4.1 + index * 0.13).toFixed(1)),
}))

const DEMO_PAGES_BY_SITE: Record<string, Array<Record<string, number | string>>> = {
  "site-1": [
    {
      page: "/marketplace",
      clicks: 148,
      impressions: 2200,
      ctr: 0.067,
      position: 7.3,
      compareClicks: 121,
      compareImpressions: 2010,
      compareCtr: 0.06,
      comparePosition: 8.1,
    },
    {
      page: "/groups/feed",
      clicks: 89,
      impressions: 740,
      ctr: 0.12,
      position: 5.1,
      compareClicks: 72,
      compareImpressions: 680,
      compareCtr: 0.106,
      comparePosition: 5.8,
    },
  ],
  "site-2": [
    {
      page: "/watch",
      clicks: 165,
      impressions: 2680,
      ctr: 0.062,
      position: 6.8,
      compareClicks: 149,
      compareImpressions: 2510,
      compareCtr: 0.059,
      comparePosition: 7.2,
    },
    {
      page: "/results",
      clicks: 94,
      impressions: 1310,
      ctr: 0.071,
      position: 4.9,
      compareClicks: 81,
      compareImpressions: 1190,
      compareCtr: 0.068,
      comparePosition: 5.4,
    },
  ],
  "site-3": WIKIPEDIA_PAGES,
}

const DEMO_QUERIES_BY_SITE: Record<string, Array<Record<string, number | string>>> = {
  "site-1": [
    {
      query: "facebook marketplace",
      clicks: 96,
      impressions: 1200,
      ctr: 0.08,
      position: 6.1,
      compareClicks: 80,
      compareImpressions: 1100,
      compareCtr: 0.073,
      comparePosition: 6.9,
    },
    {
      query: "facebook groups",
      clicks: 54,
      impressions: 860,
      ctr: 0.063,
      position: 8.4,
      compareClicks: 43,
      compareImpressions: 790,
      compareCtr: 0.054,
      comparePosition: 9.2,
    },
  ],
  "site-2": [
    {
      query: "youtube music",
      clicks: 118,
      impressions: 1820,
      ctr: 0.065,
      position: 5.8,
      compareClicks: 102,
      compareImpressions: 1690,
      compareCtr: 0.06,
      comparePosition: 6.4,
    },
    {
      query: "youtube shorts",
      clicks: 87,
      impressions: 1490,
      ctr: 0.058,
      position: 6.7,
      compareClicks: 74,
      compareImpressions: 1320,
      compareCtr: 0.056,
      comparePosition: 7.1,
    },
  ],
  "site-3": WIKIPEDIA_QUERIES,
}

const DEMO_DEVICES = [
  {
    device: "mobile",
    clicks: 180,
    impressions: 1400,
    ctr: 0.128,
    position: 6.2,
    compareClicks: 140,
    compareImpressions: 1120,
    compareCtr: 0.125,
    comparePosition: 7.4,
  },
  {
    device: "desktop",
    clicks: 96,
    impressions: 720,
    ctr: 0.133,
    position: 5.1,
    compareClicks: 88,
    compareImpressions: 680,
    compareCtr: 0.129,
    comparePosition: 5.6,
  },
  {
    device: "tablet",
    clicks: 22,
    impressions: 140,
    ctr: 0.157,
    position: 4.9,
    compareClicks: 18,
    compareImpressions: 120,
    compareCtr: 0.15,
    comparePosition: 5.3,
  },
]

const DEMO_SYNC_STATUSES = [
  {
    siteId: "site-1",
    siteUrl: "https://facebook.com",
    lastSyncedDate: "2026-03-08",
    status: "ok",
    errorMessage: null,
    updatedAt: "2026-03-12T10:10:00.000Z",
    backfillCursorDate: null,
    totalRows: 1200,
    datesSynced: 175,
    truncatedDates: 0,
    minDate: "2025-09-01",
    maxDate: "2026-03-08",
    isSyncing: false,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    expectedDays: 175,
    syncedDays: 175,
    remainingDays: 0,
    syncProgressPct: 100,
    activeRun: null,
    lastCompletedRun: {
      runId: "run-1",
      state: "completed",
      progressPercent: 100,
      processedUnits: 175,
      totalUnits: 175,
      unitLabel: "days",
      currentUnit: null,
      dataFreshThrough: "2026-03-08",
      etaSeconds: null,
      startedAt: "2026-03-12T10:00:00.000Z",
      lastProgressAt: "2026-03-12T10:10:00.000Z",
      finishedAt: "2026-03-12T10:10:00.000Z",
      queuePosition: null,
      queueDelaySeconds: null,
      stallState: "normal",
      stallReason: null,
      errorMessage: null,
    },
    lastSuccessfulDataFreshThrough: "2026-03-08",
    lastVisibleDataUpdatedAt: "2026-03-12T10:10:00.000Z",
    healthSummary: "healthy",
    phase: "ready",
    hasData: true,
    needsReseed: false,
    bootstrapProgress: 100,
  },
  {
    siteId: "site-2",
    siteUrl: "https://youtube.com",
    lastSyncedDate: "2026-03-08",
    status: "ok",
    errorMessage: null,
    updatedAt: "2026-03-12T09:20:00.000Z",
    backfillCursorDate: null,
    totalRows: 980,
    datesSynced: 175,
    truncatedDates: 0,
    minDate: "2025-09-01",
    maxDate: "2026-03-08",
    isSyncing: false,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    expectedDays: 175,
    syncedDays: 175,
    remainingDays: 0,
    syncProgressPct: 100,
    activeRun: null,
    lastCompletedRun: {
      runId: "run-2",
      state: "completed",
      progressPercent: 100,
      processedUnits: 175,
      totalUnits: 175,
      unitLabel: "days",
      currentUnit: null,
      dataFreshThrough: "2026-03-08",
      etaSeconds: null,
      startedAt: "2026-03-12T08:15:00.000Z",
      lastProgressAt: "2026-03-12T09:20:00.000Z",
      finishedAt: "2026-03-12T09:20:00.000Z",
      queuePosition: null,
      queueDelaySeconds: null,
      stallState: "normal",
      stallReason: null,
      errorMessage: null,
    },
    lastSuccessfulDataFreshThrough: "2026-03-08",
    lastVisibleDataUpdatedAt: "2026-03-12T09:20:00.000Z",
    healthSummary: "healthy",
    phase: "ready",
    hasData: true,
    needsReseed: false,
    bootstrapProgress: 100,
  },
  {
    siteId: "site-3",
    siteUrl: "https://wikipedia.org",
    lastSyncedDate: "2026-03-08",
    status: "ok",
    errorMessage: null,
    updatedAt: "2026-03-12T08:55:00.000Z",
    backfillCursorDate: null,
    totalRows: 240,
    datesSynced: 175,
    truncatedDates: 0,
    minDate: "2025-09-01",
    maxDate: "2026-03-08",
    isSyncing: false,
    retentionStart: "2025-09-01",
    retentionEnd: "2026-03-08",
    expectedDays: 175,
    syncedDays: 175,
    remainingDays: 0,
    syncProgressPct: 100,
    activeRun: null,
    lastCompletedRun: {
      runId: "run-3",
      state: "completed",
      progressPercent: 100,
      processedUnits: 175,
      totalUnits: 175,
      unitLabel: "days",
      currentUnit: null,
      dataFreshThrough: "2026-03-08",
      etaSeconds: null,
      startedAt: "2026-03-12T08:00:00.000Z",
      lastProgressAt: "2026-03-12T08:55:00.000Z",
      finishedAt: "2026-03-12T08:55:00.000Z",
      queuePosition: null,
      queueDelaySeconds: null,
      stallState: "normal",
      stallReason: null,
      errorMessage: null,
    },
    lastSuccessfulDataFreshThrough: "2026-03-08",
    lastVisibleDataUpdatedAt: "2026-03-12T08:55:00.000Z",
    healthSummary: "healthy",
    phase: "ready",
    hasData: true,
    needsReseed: false,
    bootstrapProgress: 100,
  },
]

const DEMO_SYNC_SUMMARY = {
  phase: "ready",
  hasAnySites: true,
  needsReseed: false,
  totalSites: 3,
  activeSites: 0,
  queuedSites: 0,
  readySites: 3,
  needsReseedSites: 0,
  attentionSites: 0,
  bootstrapProgress: 100,
}

function sampleSiteCard(siteId: string) {
  const totalsBySite: Record<string, { clicks: number; impressions: number; ctr: number; position: number }> = {
    "site-1": { clicks: 446, impressions: 14381, ctr: 0.031, position: 18 },
    "site-2": { clicks: 211, impressions: 3355, ctr: 0.062, position: 8 },
    "site-3": { clicks: 37, impressions: 69, ctr: 0.54, position: 3 },
  }

  const total = totalsBySite[siteId] ?? totalsBySite["site-3"]

  return {
    total,
    series: [
      { date: "2026-03-01", clicks: total.clicks * 0.18, impressions: total.impressions * 0.16, ctr: total.ctr, position: total.position },
      { date: "2026-03-02", clicks: total.clicks * 0.22, impressions: total.impressions * 0.18, ctr: total.ctr, position: total.position },
      { date: "2026-03-03", clicks: total.clicks * 0.19, impressions: total.impressions * 0.21, ctr: total.ctr, position: total.position },
      { date: "2026-03-04", clicks: total.clicks * 0.24, impressions: total.impressions * 0.23, ctr: total.ctr, position: total.position },
    ],
    compareTotal: {
      clicks: total.clicks * 0.82,
      impressions: total.impressions * 0.78,
      ctr: total.ctr * 0.96,
      position: total.position * 1.12,
    },
    compareSeries: [
      { date: "2026-02-01", clicks: total.clicks * 0.14, impressions: total.impressions * 0.13, ctr: total.ctr * 0.94, position: total.position * 1.18 },
      { date: "2026-02-02", clicks: total.clicks * 0.17, impressions: total.impressions * 0.16, ctr: total.ctr * 0.95, position: total.position * 1.08 },
      { date: "2026-02-03", clicks: total.clicks * 0.15, impressions: total.impressions * 0.17, ctr: total.ctr * 0.93, position: total.position * 1.14 },
      { date: "2026-02-04", clicks: total.clicks * 0.19, impressions: total.impressions * 0.18, ctr: total.ctr * 0.98, position: total.position * 1.05 },
    ],
    lastAvailable: "2026-03-04",
    granularity: "day",
    allowedGranularities: ["day"],
    retention: {
      start: "2025-01-01",
      end: "2026-03-04",
      partiallyOutside: false,
    },
  }
}

export function isMobileDemoUser(user: Pick<MobileAuthUser, "email"> | null | undefined) {
  return user?.email?.toLowerCase() === MOBILE_REVIEW_DEMO_EMAIL
}

export function getMobileDemoGoogleAccounts(
  user: Pick<MobileAuthUser, "email"> | null | undefined,
) {
  return isMobileDemoUser(user) ? DEMO_GOOGLE_ACCOUNTS : []
}

export function getMobileDemoSitesResponse() {
  return { sites: DEMO_SITES }
}

export function getMobileDemoFoldersResponse() {
  return { folders: DEMO_FOLDERS }
}

export function getMobileDemoSiteCardsResponse(siteIds: string[]) {
  return Object.fromEntries(siteIds.map((siteId) => [siteId, sampleSiteCard(siteId)]))
}

export function getMobileDemoSiteCardResponse(siteId: string | null) {
  return sampleSiteCard(siteId ?? DEMO_SITES[0].id)
}

export function getMobileDemoPagesResponse() {
  return { pages: DEMO_PAGES_BY_SITE["site-1"] }
}

export function getMobileDemoQueriesResponse() {
  return { queries: DEMO_QUERIES_BY_SITE["site-1"] }
}

export function getMobileDemoDevicesResponse() {
  return { devices: DEMO_DEVICES }
}

export function getMobileDemoPagesResponseForSite(siteId: string | null) {
  return { pages: DEMO_PAGES_BY_SITE[siteId ?? "site-1"] ?? DEMO_PAGES_BY_SITE["site-1"] }
}

export function getMobileDemoQueriesResponseForSite(siteId: string | null) {
  return { queries: DEMO_QUERIES_BY_SITE[siteId ?? "site-1"] ?? DEMO_QUERIES_BY_SITE["site-1"] }
}

export function getMobileDemoSyncStatusResponse() {
  return {
    summary: DEMO_SYNC_SUMMARY,
    statuses: DEMO_SYNC_STATUSES,
  }
}

export function getMobileDemoSyncEnqueueResponse(siteId: string | null) {
  return {
    ok: true,
    siteId: siteId ?? DEMO_SITES[0].id,
    daysQueued: 42,
  }
}

export function getMobileDemoSyncResetResponse() {
  return { ok: true }
}

export function getMobileDemoSyncReseedResponse() {
  return {
    ok: true,
    discoveredSites: 3,
    eligibleSites: 3,
    queuedSites: 3,
    queuedSiteIds: DEMO_SITES.map((site) => site.id),
    queuedDays: 126,
    skippedRunningSites: 0,
    skippedReadySites: 0,
  }
}

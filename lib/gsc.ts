const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GSC_SITES_URL = "https://www.googleapis.com/webmasters/v3/sites"
const GSC_SEARCH_ANALYTICS_URL =
  "https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query"

type GoogleAccount = {
  id: string
  access_token: string | null
  refresh_token: string | null
  expires_at: number | null
}

export async function getUserGoogleAccount(
  env: CloudflareEnv,
  userId: string,
): Promise<GoogleAccount | null> {
  const account = await env.DB.prepare(
    `SELECT id, access_token, refresh_token, expires_at
     FROM auth_accounts
     WHERE user_id = ? AND provider = 'google'
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(userId)
    .first<GoogleAccount>()

  return account ?? null
}

let tokenCache: { userId: string; token: string; expiresAt: number } | null = null

export async function getAccessToken(
  env: CloudflareEnv,
  userId: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<string> {
  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.userId === userId &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.token
  }

  const account = await getUserGoogleAccount(env, userId)
  if (!account) {
    throw new Error("Missing Google account")
  }

  const expiresAtMs = account.expires_at ? Number(account.expires_at) * 1000 : null
  const isFresh =
    !forceRefresh &&
    Boolean(account.access_token) &&
    expiresAtMs !== null &&
    expiresAtMs > Date.now() + 60_000

  if (isFresh && account.access_token) {
    tokenCache = { userId, token: account.access_token, expiresAt: expiresAtMs! }
    return account.access_token
  }

  if (!account.refresh_token) {
    if (account.access_token) return account.access_token
    throw new Error("Missing refresh token for Google account")
  }

  const body = new URLSearchParams({
    client_id: env.AUTH_GOOGLE_ID,
    client_secret: env.AUTH_GOOGLE_SECRET,
    refresh_token: account.refresh_token,
    grant_type: "refresh_token",
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google token refresh failed: ${response.status} ${text}`)
  }

  const data = (await response.json()) as {
    access_token: string
    expires_in: number
  }

  const newExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in
  await env.DB.prepare(
    `UPDATE auth_accounts
     SET access_token = ?, expires_at = ?
     WHERE id = ?`,
  )
    .bind(data.access_token, newExpiresAt, account.id)
    .run()

  tokenCache = { userId, token: data.access_token, expiresAt: newExpiresAt * 1000 }
  return data.access_token
}

export async function listUserGscSites(env: CloudflareEnv, userId: string) {
  const accessToken = await getAccessToken(env, userId)
  const response = await fetch(GSC_SITES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (response.status === 401) {
    const refreshedToken = await getAccessToken(env, userId, { forceRefresh: true })
    const retry = await fetch(GSC_SITES_URL, {
      headers: { Authorization: `Bearer ${refreshedToken}` },
    })

    if (!retry.ok) {
      const text = await retry.text()
      throw new Error(`GSC sites list failed: ${retry.status} ${text}`)
    }

    const data = (await retry.json()) as {
      siteEntry?: { siteUrl: string; permissionLevel: string }[]
    }

    return data.siteEntry ?? []
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GSC sites list failed: ${response.status} ${text}`)
  }

  const data = (await response.json()) as {
    siteEntry?: { siteUrl: string; permissionLevel: string }[]
  }

  return data.siteEntry ?? []
}

export function normalizeGscSiteUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("sc-domain:")) {
    return trimmed.replace("sc-domain:", "").toLowerCase()
  }
  try {
    const url = new URL(trimmed)
    return url.toString()
  } catch {
    return trimmed.toLowerCase()
  }
}

export function toGscSiteUrl(stored: string) {
  const trimmed = stored.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed
  }
  return `sc-domain:${trimmed}`
}

type GscAnalyticsResponse = {
  rows?: {
    keys: string[]
    clicks: number
    impressions: number
    ctr: number
    position: number
  }[]
}

const RETRY_BASE_DELAY_MS = 1500
const MAX_RETRIES = 4
const ROW_LIMIT = 25_000
const DEFAULT_MAX_PAGES = 4

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitteredBackoffMs(attempt: number) {
  const exponential = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1)
  const jitter = Math.floor(Math.random() * 600)
  return exponential + jitter
}

function isRetryableStatus(status: number, body: string) {
  if (status === 429) return true
  if (status >= 500) return true
  if (status === 403) {
    return body.includes("quotaExceeded") || body.includes("rateLimitExceeded")
  }
  return false
}

export async function fetchSearchAnalytics(
  env: CloudflareEnv,
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  options: {
    dimensions?: Array<"page" | "query" | "device" | "date">
    maxPages?: number
  } = {},
) {
  const url = GSC_SEARCH_ANALYTICS_URL.replace("{siteUrl}", encodeURIComponent(siteUrl))
  const dimensions = options.dimensions ?? ["date", "page", "device"]
  const configuredMaxPages = readIntEnv(env, "GSC_API_MAX_PAGES", DEFAULT_MAX_PAGES)
  const maxPages = Math.max(1, options.maxPages ?? configuredMaxPages)
  const collectedRows: NonNullable<GscAnalyticsResponse["rows"]> = []

  for (let page = 0; page < maxPages; page++) {
    const startRow = page * ROW_LIMIT
    const payload = JSON.stringify({
      startDate,
      endDate,
      dimensions,
      rowLimit: ROW_LIMIT,
      startRow,
      type: "web",
    })

    let pageData: GscAnalyticsResponse | null = null
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(jitteredBackoffMs(attempt))
      }

      try {
        const accessToken = await getAccessToken(env, userId, {
          forceRefresh: attempt > 0,
        })

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: payload,
        })

        if (response.status === 401) {
          const refreshedToken = await getAccessToken(env, userId, { forceRefresh: true })
          const retry = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${refreshedToken}`,
              "content-type": "application/json",
            },
            body: payload,
          })

          const retryBody = await retry.text()
          if (!retry.ok) {
            if (isRetryableStatus(retry.status, retryBody) && attempt < MAX_RETRIES) {
              lastError = new Error(`GSC query failed: ${retry.status} ${retryBody}`)
              continue
            }
            throw new Error(`GSC query failed: ${retry.status} ${retryBody}`)
          }

          pageData = JSON.parse(retryBody) as GscAnalyticsResponse
          break
        }

        if (!response.ok) {
          const body = await response.text()
          if (isRetryableStatus(response.status, body) && attempt < MAX_RETRIES) {
            console.warn(
              `GSC query retryable failure (status ${response.status}, attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
            )
            lastError = new Error(`GSC query failed: ${response.status} ${body}`)
            continue
          }
          throw new Error(`GSC query failed: ${response.status} ${body}`)
        }

        pageData = (await response.json()) as GscAnalyticsResponse
        break
      } catch (error) {
        if (attempt >= MAX_RETRIES) {
          throw error
        }
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(
          `GSC query network failure (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying...`,
          lastError,
        )
      }
    }

    if (!pageData) {
      throw lastError ?? new Error("GSC query failed after retries")
    }

    const rows = pageData.rows ?? []
    collectedRows.push(...rows)
    if (rows.length < ROW_LIMIT) {
      break
    }
  }

  return {
    rows: collectedRows,
    meta: {
      rowLimit: ROW_LIMIT,
      maxPages,
      fetchedPages: Math.ceil(collectedRows.length / ROW_LIMIT),
      truncated: collectedRows.length === ROW_LIMIT * maxPages,
    },
  }
}

function readIntEnv(
  env: CloudflareEnv,
  key: keyof CloudflareEnv | string,
  fallback: number,
) {
  const source = env as unknown as Record<string, string | undefined>
  const value = typeof key === "string" ? source[key] : source[key as string]
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

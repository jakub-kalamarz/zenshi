export type BillingPlan = "free" | "pro"

export type BillingStatus = {
  plan: BillingPlan
  entitlement: "zenshi_pro"
  active: boolean
}

const PRO_ENTITLEMENT_ID = "zenshi_pro"
const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1"
const REVENUECAT_API_V2_BASE = "https://api.revenuecat.com/v2"
const REVENUECAT_PRO_ENTITLEMENT_IDS = new Set([PRO_ENTITLEMENT_ID, "Zenshi Pro"])

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS billing_entitlements (
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    entitlement_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    product_id TEXT,
    expires_at TEXT,
    last_checked_at DATETIME,
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, provider, entitlement_id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_billing_entitlements_active
    ON billing_entitlements(user_id, active);`,
]

let didEnsureBillingSchema = false

export async function ensureBillingSchema(env: CloudflareEnv) {
  if (didEnsureBillingSchema) return
  for (const statement of schemaStatements) {
    await env.DB.prepare(statement).run()
  }
  didEnsureBillingSchema = true
}

export async function getBillingStatus(env: CloudflareEnv, userId: string): Promise<BillingStatus> {
  await ensureBillingSchema(env)
  const row = await env.DB.prepare(
    `SELECT active
     FROM billing_entitlements
     WHERE user_id = ? AND provider = 'revenuecat' AND entitlement_id = ?`,
  )
    .bind(userId, PRO_ENTITLEMENT_ID)
    .first<{ active: number | null }>()

  return statusFromActive(row?.active === 1)
}

export async function isBillingPro(env: CloudflareEnv, userId: string) {
  return (await getBillingStatus(env, userId)).active
}

export async function refreshRevenueCatBillingStatus(
  env: CloudflareEnv,
  userId: string,
): Promise<BillingStatus> {
  await ensureBillingSchema(env)
  const secret = revenueCatSecret(env)
  if (!secret) {
    return getBillingStatus(env, userId)
  }

  if (secret.startsWith("sk_")) {
    return refreshRevenueCatBillingStatusV2(env, userId, secret)
  }

  const response = await fetch(`${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(userId)}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    return getBillingStatus(env, userId)
  }

  const payload = await response.json().catch(() => null) as RevenueCatSubscriberResponse | null
  const entitlement = revenueCatV1ProEntitlement(payload)
  const active = isRevenueCatEntitlementActive(entitlement)
  const productId = entitlement?.product_identifier ?? null
  const expiresAt = entitlement?.expires_date ?? null

  await saveBillingStatus(env, userId, active, productId, expiresAt)
  return statusFromActive(active)
}

async function refreshRevenueCatBillingStatusV2(
  env: CloudflareEnv,
  userId: string,
  secret: string,
): Promise<BillingStatus> {
  const projectId = await revenueCatProjectID(env, secret)
  if (!projectId) {
    return getBillingStatus(env, userId)
  }

  const response = await revenueCatFetchV2(
    `/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(userId)}/active_entitlements`,
    secret,
  )
  if (!response.ok) {
    return getBillingStatus(env, userId)
  }

  const payload = await response.json().catch(() => null) as RevenueCatActiveEntitlementsResponse | null
  const activeEntitlements = payload?.items ?? []
  const entitlementIds = new Set(activeEntitlements.map((item) => item.entitlement_id))
  const proEntitlement = await revenueCatV2ProEntitlement(projectId, secret, entitlementIds)
  const proActiveEntitlement = activeEntitlements.find((item) => item.entitlement_id === proEntitlement?.id)
  const active = Boolean(proEntitlement)
  const expiresAt = proActiveEntitlement?.expires_at ? new Date(proActiveEntitlement.expires_at).toISOString() : null

  await saveBillingStatus(env, userId, active, null, expiresAt)
  return statusFromActive(active)
}

export async function handleRevenueCatWebhook(env: CloudflareEnv, request: Request) {
  const expectedSecret = revenueCatWebhookSecret(env)
  if (expectedSecret) {
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (provided !== expectedSecret) {
      return Response.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 })
    }
  }

  const payload = await request.json().catch(() => null) as RevenueCatWebhookPayload | null
  const appUserID = payload?.event?.app_user_id
  if (!appUserID) {
    return Response.json({ ok: false, error: { code: "INVALID_REQUEST", message: "Missing app_user_id" } }, { status: 400 })
  }

  await refreshRevenueCatBillingStatus(env, appUserID)
  return Response.json({ ok: true, data: { ok: true } })
}

async function saveBillingStatus(
  env: CloudflareEnv,
  userId: string,
  active: boolean,
  productId: string | null,
  expiresAt: string | null,
) {
  await env.DB.prepare(
    `INSERT INTO billing_entitlements (
       user_id, provider, entitlement_id, active, product_id, expires_at, last_checked_at, updated_at
     )
     VALUES (?, 'revenuecat', ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(user_id, provider, entitlement_id)
     DO UPDATE SET
       active = excluded.active,
       product_id = excluded.product_id,
       expires_at = excluded.expires_at,
       last_checked_at = excluded.last_checked_at,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, PRO_ENTITLEMENT_ID, active ? 1 : 0, productId, expiresAt)
    .run()
}

function statusFromActive(active: boolean): BillingStatus {
  return {
    plan: active ? "pro" : "free",
    entitlement: PRO_ENTITLEMENT_ID,
    active,
  }
}

function revenueCatV1ProEntitlement(payload: RevenueCatSubscriberResponse | null) {
  const entitlements = payload?.subscriber?.entitlements ?? {}
  for (const entitlementID of REVENUECAT_PRO_ENTITLEMENT_IDS) {
    const entitlement = entitlements[entitlementID]
    if (entitlement) return entitlement
  }
  return undefined
}

function isRevenueCatEntitlementActive(entitlement: RevenueCatEntitlement | undefined) {
  if (!entitlement) return false
  if (!entitlement.expires_date) return true
  const expiresAt = Date.parse(entitlement.expires_date)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

async function revenueCatProjectID(env: CloudflareEnv, secret: string) {
  const configured = (env as CloudflareEnv & { REVENUECAT_PROJECT_ID?: string }).REVENUECAT_PROJECT_ID
  if (configured) return configured

  const response = await revenueCatFetchV2("/projects", secret)
  if (!response.ok) return null

  const payload = await response.json().catch(() => null) as RevenueCatProjectsResponse | null
  return payload?.items?.[0]?.id ?? null
}

async function revenueCatV2ProEntitlement(
  projectId: string,
  secret: string,
  activeEntitlementIds: Set<string>,
) {
  if (activeEntitlementIds.size === 0) return null

  const response = await revenueCatFetchV2(
    `/projects/${encodeURIComponent(projectId)}/entitlements`,
    secret,
  )
  if (!response.ok) return null

  const payload = await response.json().catch(() => null) as RevenueCatEntitlementsResponse | null
  return (payload?.items ?? []).find((entitlement) => {
    if (!activeEntitlementIds.has(entitlement.id)) return false
    return REVENUECAT_PRO_ENTITLEMENT_IDS.has(entitlement.lookup_key)
      || REVENUECAT_PRO_ENTITLEMENT_IDS.has(entitlement.display_name)
  }) ?? null
}

function revenueCatFetchV2(path: string, secret: string) {
  return fetch(`${REVENUECAT_API_V2_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
  })
}

function revenueCatSecret(env: CloudflareEnv) {
  return (env as CloudflareEnv & { REVENUECAT_SECRET?: string }).REVENUECAT_SECRET
    ?? (env as CloudflareEnv & { REVENUECAT_API_KEY?: string }).REVENUECAT_API_KEY
}

function revenueCatWebhookSecret(env: CloudflareEnv) {
  return (env as CloudflareEnv & { REVENUECAT_WEBHOOK_SECRET?: string }).REVENUECAT_WEBHOOK_SECRET
}

type RevenueCatSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>
  }
}

type RevenueCatEntitlement = {
  expires_date?: string | null
  product_identifier?: string | null
}

type RevenueCatWebhookPayload = {
  event?: {
    app_user_id?: string
  }
}

type RevenueCatProjectsResponse = {
  items?: Array<{
    id: string
  }>
}

type RevenueCatActiveEntitlementsResponse = {
  items?: Array<{
    entitlement_id: string
    expires_at?: number | null
  }>
}

type RevenueCatEntitlementsResponse = {
  items?: RevenueCatV2Entitlement[]
}

type RevenueCatV2Entitlement = {
  id: string
  lookup_key: string
  display_name: string
}

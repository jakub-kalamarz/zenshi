import assert from "node:assert/strict"
import {
  getBillingStatus,
  handleRevenueCatWebhook,
  refreshRevenueCatBillingStatus,
} from "./billing"

type BillingRow = {
  user_id: string
  provider: string
  entitlement_id: string
  active: number
  product_id: string | null
  expires_at: string | null
}

function makeEnv(seed: BillingRow[] = [], revenueCatSecret = "secret") {
  const rows = [...seed]
  return {
    REVENUECAT_SECRET: revenueCatSecret,
    REVENUECAT_WEBHOOK_SECRET: "webhook-secret",
    DB: {
      prepare(sql: string) {
        const normalized = sql.toLowerCase().replace(/\s+/g, " ").trim()
        return {
          bind(...values: unknown[]) {
            return {
              async first<T>() {
                if (normalized.includes("select active") && normalized.includes("from billing_entitlements")) {
                  const row = rows.find((item) => item.user_id === values[0] && item.entitlement_id === values[1])
                  return (row ? { active: row.active } : null) as T | null
                }
                return null
              },
              async run() {
                if (normalized.startsWith("insert into billing_entitlements")) {
                  const [userId, entitlementId, active, productId, expiresAt] = values as [string, string, number, string | null, string | null]
                  const existing = rows.find((item) => item.user_id === userId && item.entitlement_id === entitlementId)
                  if (existing) {
                    existing.active = active
                    existing.product_id = productId
                    existing.expires_at = expiresAt
                  } else {
                    rows.push({
                      user_id: userId,
                      provider: "revenuecat",
                      entitlement_id: entitlementId,
                      active,
                      product_id: productId,
                      expires_at: expiresAt,
                    })
                  }
                }
                return { success: true, meta: { changes: 1 } }
              },
            }
          },
          async run() {
            return { success: true, meta: { changes: 0 } }
          },
        }
      },
    },
    rows,
  }
}

async function main() {
  {
    const env = makeEnv()
    const status = await getBillingStatus(env as unknown as CloudflareEnv, "user-1")
    assert.deepEqual(status, { plan: "free", entitlement: "zenshi_pro", active: false })
  }

  {
    const env = makeEnv()
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => Response.json({
      subscriber: {
        entitlements: {
          zenshi_pro: {
            expires_date: "2999-01-01T00:00:00Z",
            product_identifier: "zenshi_pro_yearly",
          },
        },
      },
    })

    const status = await refreshRevenueCatBillingStatus(env as unknown as CloudflareEnv, "user-1")
    assert.deepEqual(status, { plan: "pro", entitlement: "zenshi_pro", active: true })
    assert.equal(env.rows[0]?.active, 1)
    assert.equal(env.rows[0]?.product_id, "zenshi_pro_yearly")
    globalThis.fetch = originalFetch
  }

  {
    const env = makeEnv([], "sk_test")
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input) => {
      const url = input.toString()
      if (url.endsWith("/projects")) {
        return Response.json({ items: [{ id: "proj_test" }] })
      }
      if (url.endsWith("/customers/user-1/active_entitlements")) {
        return Response.json({ items: [{ entitlement_id: "entl_test", expires_at: 32503680000000 }] })
      }
      if (url.endsWith("/entitlements")) {
        return Response.json({
          items: [{
            id: "entl_test",
            lookup_key: "Zenshi Pro",
            display_name: "Zenshi Pro",
          }],
        })
      }
      return Response.json({}, { status: 404 })
    }

    const status = await refreshRevenueCatBillingStatus(env as unknown as CloudflareEnv, "user-1")
    assert.deepEqual(status, { plan: "pro", entitlement: "zenshi_pro", active: true })
    assert.equal(env.rows[0]?.active, 1)
    assert.equal(env.rows[0]?.expires_at, "3000-01-01T00:00:00.000Z")
    globalThis.fetch = originalFetch
  }

  {
    const env = makeEnv()
    const response = await handleRevenueCatWebhook(
      env as unknown as CloudflareEnv,
      new Request("https://zenshi.dev/api/revenuecat/webhook", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
        body: JSON.stringify({ event: { app_user_id: "user-1" } }),
      }),
    )
    assert.equal(response.status, 401)
  }

  console.log("billing spec passed")
}

main()

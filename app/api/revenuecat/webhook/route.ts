import { getCloudflareContext } from "@opennextjs/cloudflare"
import { handleRevenueCatWebhook } from "@/lib/billing"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  return handleRevenueCatWebhook(env, request)
}

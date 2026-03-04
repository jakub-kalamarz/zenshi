import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getSiteCardData } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const { searchParams } = new URL(request.url)
  const result = await getSiteCardData(env, session.user.id, {
    siteId: searchParams.get("siteId"),
    start: searchParams.get("start"),
    end: searchParams.get("end"),
    granularity: searchParams.get("granularity"),
  })
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getSiteCardsData, parseSiteCardsRequest } from "@/lib/gsc-service"

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const parsedBody = parseSiteCardsRequest(await request.json())
  if (!parsedBody) {
    return new Response("Missing siteIds/start/end", { status: 400 })
  }
  const result = await getSiteCardsData(env, session.user.id, parsedBody)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

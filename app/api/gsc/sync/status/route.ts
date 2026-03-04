import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getSyncStatus } from "@/lib/gsc-service"

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const result = await getSyncStatus(env, session.user.id)
  if (!result.ok) {
    return new Response(result.message, { status: result.status })
  }
  return Response.json(result.data)
}

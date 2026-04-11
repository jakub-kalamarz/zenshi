import { getCloudflareContext } from "@opennextjs/cloudflare"
import { auth, clearSessionCookie, deleteAccountForUser } from "@/lib/auth"

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await deleteAccountForUser(env, session.user.id)

  const response = Response.json({ deleted: true })
  response.headers.append("Set-Cookie", clearSessionCookie())
  return response
}

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
import { resolveShareByToken } from "@/lib/gsc-share"
import {
  buildPublicSharePreviewResolvePayload,
  isPublicSharePreviewToken,
} from "@/lib/public-share-preview"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (isPublicSharePreviewToken(searchParams.get("token"))) {
    return Response.json(buildPublicSharePreviewResolvePayload())
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const resolved = await resolveShareByToken(env, request, searchParams.get("token"))
  if (!resolved.ok) {
    return resolved.response
  }

  const { share } = resolved
  return Response.json({
    share: {
      id: share.id,
      scopeType: share.scopeType,
      scopeId: share.scopeId,
      status: share.status,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
      revokedAt: share.revokedAt,
      lastAccessedAt: share.lastAccessedAt,
      defaults: share.defaults,
      branding: share.branding,
      sites: share.sites,
    },
  })
}

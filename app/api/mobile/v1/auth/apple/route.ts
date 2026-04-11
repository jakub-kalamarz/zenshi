import { getCloudflareContext } from "@opennextjs/cloudflare"
import { signInWithApple } from "@/lib/auth"
import { verifyAppleIdentityToken } from "@/lib/apple-auth"
import { ensureAuthSchema } from "@/lib/auth-schema"
import { buildMobileSession, issueApiToken } from "@/lib/mobile-auth"
import { handleMobileOptions, mobileError, mobileJson } from "@/lib/mobile-http"

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const preflight = handleMobileOptions(request, env)
  if (preflight) return preflight

  await ensureAuthSchema(env)

  const body = (await request.json().catch(() => null)) as {
    identityToken?: string
    name?: string
    label?: string
  } | null

  const identityToken = body?.identityToken?.trim() ?? null
  if (!identityToken) {
    return mobileError("VALIDATION_ERROR", "Missing identityToken", request, env, 400)
  }

  let identity
  try {
    identity = await verifyAppleIdentityToken(env, identityToken)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apple sign-in failed"
    return mobileError("OAUTH_ERROR", message, request, env, 400)
  }

  const signedIn = await signInWithApple(env, identity, {
    name: body?.name ?? null,
  })
  const token = await issueApiToken(env, signedIn.user.id, body?.label ?? null)
  const session = await buildMobileSession(env, {
    user: {
      id: signedIn.user.id,
      email: signedIn.user.email,
      name: signedIn.user.name,
      image: signedIn.user.image,
    },
    tokenId: token.tokenId,
    expiresAt: token.expiresAt,
  })

  return mobileJson(
    {
      token: token.token,
      ...session,
    },
    request,
    env,
  )
}


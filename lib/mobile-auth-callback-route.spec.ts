import assert from "node:assert/strict"
import { mock } from "bun:test"

const ensureAuthSchema = mock(async () => {})
const signInWithGoogle = mock(async () => ({ id: "user-1" }))
const consumeOauthState = mock(async () => ({
  verifier: "verifier-123",
  purpose: "signin" as const,
  userId: null,
}))
const createLoginCode = mock(async () => "login-code-123")
const ensureMobileGoogleEnv = mock(() => {})
const exchangeGoogleCode = mock(async () => ({ access_token: "google-access-token" }))
const fetchGoogleUser = mock(async () => ({
  email: "user@example.com",
  name: "User",
  picture: "https://example.com/avatar.png",
}))
const resolveMobileBaseOrigin = mock(() => "https://zenshi.dev")

mock.module("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: {},
      MOBILE_APP_SCHEME: "zenshi",
    },
  }),
}))

mock.module("@/lib/auth-schema", () => ({
  ensureAuthSchema,
}))

mock.module("@/lib/auth", () => ({
  GoogleAccountConflictError: class GoogleAccountConflictError extends Error {
    status = 409
  },
  createGoogleRelinkIntent: mock(async () => {
    throw new Error("Unexpected relink intent")
  }),
  signInWithGoogle,
  upsertGoogleAccountForUser: mock(async () => {
    throw new Error("Unexpected link flow")
  }),
}))

mock.module("@/lib/mobile-auth", () => ({
  consumeOauthState,
  createLoginCode,
}))

mock.module("@/lib/mobile-google-auth", () => ({
  ensureMobileGoogleEnv,
  exchangeGoogleCode,
  fetchGoogleUser,
  resolveMobileBaseOrigin,
}))

mock.module("@/lib/mobile-http", () => ({
  handleMobileOptions: () => null,
  mobileError: (code: string, message: string, _request: Request, _env: unknown, status = 400) =>
    Response.json({ ok: false, error: { code, message } }, { status }),
  mobileJson: (data: unknown, _request: Request, _env: unknown, init: ResponseInit = {}) =>
    Response.json({ ok: true, data }, init),
  withMobileCors: (response: Response) => response,
}))

mock.module("@/lib/locale", () => ({
  getLocalePath: (locale: string, path: string) => (locale === "en" ? path : `/${locale}${path}`),
  normalizeLocale: () => "en",
}))

const routeModule = await import("../app/api/mobile/v1/auth/callback/route")

{
  const request = new Request(
    "http://localhost/api/mobile/v1/auth/callback?code=google-code&state=oauth-state",
    {
      method: "GET",
    },
  )

  const response = await routeModule.GET(request)

  assert.equal(response.status, 302)
  assert.equal(response.headers.get("location"), "zenshi://auth?code=login-code-123")
}

assert.equal(ensureAuthSchema.mock.calls.length, 1)
assert.equal(consumeOauthState.mock.calls.length, 1)
assert.equal(exchangeGoogleCode.mock.calls.length, 1)
assert.equal(createLoginCode.mock.calls.length, 1)

console.log("mobile-auth-callback-route spec passed")

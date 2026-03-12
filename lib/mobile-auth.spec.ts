import assert from "node:assert/strict"
import { consumeOauthState, createOauthState, issueApiToken, verifyApiToken } from "./mobile-auth"
import { createFakeDb } from "./_test-fake-db"

const env = {
  DB: createFakeDb({
    auth_users: [{
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    }],
    auth_accounts: [{
      id: "google-account-1",
      user_id: "user-1",
      provider: "google",
      provider_account_id: "google-sub-1",
      email: "owner@gmail.com",
      name: "Owner Google",
      image: "https://example.com/google-avatar.png",
      access_token: "token-1",
      refresh_token: "refresh-1",
      expires_at: 3600,
    }],
  }),
} as { DB: ReturnType<typeof createFakeDb> }

const state = await createOauthState(
  env,
  "verifier-123",
  15,
  { purpose: "link", userId: "user-1" },
)
assert.ok(typeof state === "string" && state.length > 0)

const consumed = await consumeOauthState(env, state)
assert.ok(consumed !== null)
assert.equal(consumed?.purpose, "link")
assert.equal(consumed?.userId, "user-1")
assert.equal(consumed?.verifier, "verifier-123")

const consumedAgain = await consumeOauthState(env, state)
assert.equal(consumedAgain, null)

const signinState = await createOauthState(
  env,
  "signin-verifier",
  15,
)
const consumedSignin = await consumeOauthState(env, signinState)
assert.equal(consumedSignin?.purpose, "signin")
assert.equal(consumedSignin?.userId, null)

const expiredState = await createOauthState(env, "expired-verifier", -1, {
  purpose: "link",
  userId: "user-2",
})
const expired = await consumeOauthState(env, expiredState)
assert.equal(expired, null)

assert.equal(await consumeOauthState(env, "unknown-state"), null)

const issuedToken = await issueApiToken(env, "user-1", "iPhone")
const verifiedSession = await verifyApiToken(env, issuedToken.token)
assert.equal(verifiedSession?.tokenId, issuedToken.tokenId)
assert.equal(verifiedSession?.user.id, "user-1")
assert.deepEqual(verifiedSession?.googleAccount, {
  email: "owner@gmail.com",
  name: "Owner Google",
  image: "https://example.com/google-avatar.png",
})

env.DB.prepare(`DELETE FROM auth_accounts WHERE user_id = ? AND provider = 'google'`)
  .bind("user-1")
  .run()

const verifiedSessionWithoutGoogle = await verifyApiToken(env, issuedToken.token)
assert.equal(verifiedSessionWithoutGoogle?.googleAccount, null)

console.log("mobile-auth spec passed")

import assert from "node:assert/strict"
import { createOauthState, consumeOauthState } from "./mobile-auth"
import { createFakeDb } from "./_test-fake-db"

const env = {
  DB: createFakeDb(),
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

console.log("mobile-auth spec passed")


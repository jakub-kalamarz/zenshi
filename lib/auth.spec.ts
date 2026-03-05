import assert from "node:assert/strict"
import { GoogleAccountConflictError, createSessionForUser, upsertGoogleAccountForUser } from "./auth"
import { createFakeDb } from "./_test-fake-db"

const env = {
  DB: createFakeDb(),
} as { DB: ReturnType<typeof createFakeDb> }

const userA = "user-a"
const userB = "user-b"
const googleInfo = {
  sub: "google-sub-1",
  email: "owner@example.com",
  name: "Owner",
}

const first = await upsertGoogleAccountForUser(
  env,
  userA,
  googleInfo,
  {
    access_token: "token-1",
    refresh_token: "refresh-1",
    expires_in: 3_600,
    token_type: "Bearer",
    scope: "scope-a",
  },
)
assert.ok(typeof first === "string" && first.length > 0)
const account = env.DB.table("auth_accounts")[0]
assert.equal(account.user_id, userA)
assert.equal(account.access_token, "token-1")
assert.equal(account.provider_account_id, googleInfo.sub)

await upsertGoogleAccountForUser(
  env,
  userA,
  googleInfo,
  {
    access_token: "token-2",
    refresh_token: null,
    expires_in: 7_200,
    token_type: "Bearer",
    scope: "scope-b",
  },
)
assert.equal(env.DB.table("auth_accounts")[0].access_token, "token-2")

await assert.rejects(async () => {
  await upsertGoogleAccountForUser(
    env,
    userB,
    googleInfo,
    {
      access_token: "token-other",
      refresh_token: "refresh-other",
      expires_in: 3_600,
      token_type: "Bearer",
    },
  )
}, GoogleAccountConflictError)

const session = await createSessionForUser(env, userA)
assert.ok(typeof session.sessionToken === "string")
assert.equal(session.sessionToken, env.DB.table("auth_sessions")[0].session_token)
assert.equal(env.DB.table("auth_sessions")[0].user_id, userA)
assert.ok(typeof session.expiresAt === "string")

console.log("auth spec passed")


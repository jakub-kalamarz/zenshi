import assert from "node:assert/strict"
import {
  GoogleAccountConflictError,
  createGoogleRelinkIntent,
  createSessionForUser,
  disconnectGoogleAccountFromUser,
  relinkGoogleAccountToUser,
  upsertGoogleAccountForUser,
} from "./auth"
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
  picture: "https://example.com/owner-google.png",
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
assert.equal(account.email, googleInfo.email)
assert.equal(account.name, googleInfo.name)
assert.equal(account.image, googleInfo.picture)

await upsertGoogleAccountForUser(
  env,
  userA,
  {
    ...googleInfo,
    email: "updated@example.com",
    name: "Updated Owner",
    picture: "https://example.com/updated-google.png",
  },
  {
    access_token: "token-2",
    refresh_token: null,
    expires_in: 7_200,
    token_type: "Bearer",
    scope: "scope-b",
  },
)
assert.equal(env.DB.table("auth_accounts")[0].access_token, "token-2")
assert.equal(env.DB.table("auth_accounts")[0].email, "updated@example.com")
assert.equal(env.DB.table("auth_accounts")[0].name, "Updated Owner")
assert.equal(env.DB.table("auth_accounts")[0].image, "https://example.com/updated-google.png")

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

const relinkEnv = {
  DB: createFakeDb({
    auth_accounts: [{
      id: "account-1",
      user_id: userA,
      provider: "google",
      provider_account_id: googleInfo.sub,
      access_token: "token-1",
      refresh_token: "refresh-1",
      token_type: "Bearer",
      scope: "scope-a",
      expires_at: 3_600,
    }],
  }),
} as { DB: ReturnType<typeof createFakeDb> }

const relinkIntent = await createGoogleRelinkIntent(
  relinkEnv,
  userB,
  googleInfo,
  {
    access_token: "token-3",
    refresh_token: "refresh-3",
    expires_in: 3_600,
    token_type: "Bearer",
    scope: "scope-c",
  },
)
assert.equal(relinkIntent.canRelink, true)
assert.equal(relinkIntent.provider, "google")
assert.ok(typeof relinkIntent.relinkToken === "string" && relinkIntent.relinkToken.length > 0)

const relinked = await relinkGoogleAccountToUser(relinkEnv, userB, relinkIntent.relinkToken)
assert.equal(relinked.userId, userB)
assert.equal(relinkEnv.DB.table("auth_accounts")[0].user_id, userB)
assert.equal(relinkEnv.DB.table("auth_accounts")[0].access_token, "token-3")
assert.equal(relinkEnv.DB.table("auth_accounts")[0].refresh_token, "refresh-3")
assert.equal(relinkEnv.DB.table("auth_accounts")[0].email, googleInfo.email)
assert.equal(relinkEnv.DB.table("auth_accounts")[0].name, googleInfo.name)
assert.equal(relinkEnv.DB.table("auth_accounts")[0].image, googleInfo.picture)

await assert.rejects(async () => {
  await relinkGoogleAccountToUser(relinkEnv, userB, relinkIntent.relinkToken)
}, /Invalid or expired relink token/)

const disconnectEnv = {
  DB: createFakeDb({
    auth_users: [{
      id: userA,
      email: "owner@example.com",
      name: "Owner",
      image: null,
      password_hash: "hash",
      password_salt: "salt",
    }],
    auth_accounts: [{
      id: "account-1",
      user_id: userA,
      provider: "google",
      provider_account_id: googleInfo.sub,
      access_token: "token-1",
      refresh_token: "refresh-1",
      token_type: "Bearer",
      scope: "scope-a",
      expires_at: 3_600,
    }, {
      id: "account-2",
      user_id: userA,
      provider: "google",
      provider_account_id: "google-sub-2",
      access_token: "token-2",
      refresh_token: "refresh-2",
      token_type: "Bearer",
      scope: "scope-b",
      expires_at: 7_200,
    }],
  }),
} as { DB: ReturnType<typeof createFakeDb> }

await disconnectGoogleAccountFromUser(disconnectEnv, userA, "account-1")
assert.equal(disconnectEnv.DB.table("auth_accounts").length, 1)
assert.equal(disconnectEnv.DB.table("auth_accounts")[0].id, "account-2")

const googleOnlyEnv = {
  DB: createFakeDb({
    auth_users: [{
      id: userA,
      email: "owner@example.com",
      name: "Owner",
      image: null,
      password_hash: null,
      password_salt: null,
    }],
    auth_accounts: [{
      id: "account-1",
      user_id: userA,
      provider: "google",
      provider_account_id: googleInfo.sub,
      access_token: "token-1",
      refresh_token: "refresh-1",
      token_type: "Bearer",
      scope: "scope-a",
      expires_at: 3_600,
    }],
  }),
} as { DB: ReturnType<typeof createFakeDb> }

await assert.rejects(async () => {
  await disconnectGoogleAccountFromUser(googleOnlyEnv, userA, "account-1")
}, /password/i)

console.log("auth spec passed")

import assert from "node:assert/strict"
import { mock } from "bun:test"
import { hashPassword } from "./credentials"
import { createFakeDb } from "./_test-fake-db"

let currentEnv: { DB: ReturnType<typeof createFakeDb> }

mock.module("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: currentEnv,
  }),
}))

const webRegisterModule = await import("../app/api/auth/register/route")
const webLoginModule = await import("../app/api/auth/login/route")
const mobileRegisterModule = await import("../app/api/mobile/v1/auth/register/route")
const mobileLoginModule = await import("../app/api/mobile/v1/auth/login/route")

const webRegister = webRegisterModule.POST
const webLogin = webLoginModule.POST
const mobileRegister = mobileRegisterModule.POST
const mobileLogin = mobileLoginModule.POST

function makeJsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

{
  currentEnv = {
    DB: createFakeDb(),
  }
  const response = await webRegister(
    makeJsonRequest("/api/auth/register", {
      email: "  USER@Example.com  ",
      password: "secret1234",
      name: "User",
    }),
  )
  assert.equal(response.status, 201)
  const body = (await response.json()) as { user: { email: string } }
  assert.equal(body.user.email, "user@example.com")
  assert.ok(response.headers.get("set-cookie")?.startsWith("session_token="))
}

{
  currentEnv = {
    DB: createFakeDb({
      auth_users: [
        {
          id: "user-1",
          email: "user@example.com",
          name: "User",
          image: null,
          password_hash: "hash",
          password_salt: "salt",
          password_updated_at: null,
        },
      ],
    }),
  }

  const duplicate = await webRegister(
    makeJsonRequest("/api/auth/register", {
      email: "user@example.com",
      password: "secret1234",
      name: "User",
    }),
  )
  assert.equal(duplicate.status, 409)
  const duplicateBody = (await duplicate.json()) as { error: string }
  assert.equal(duplicateBody.error, "Email is already used")
}

{
  const credentials = await hashPassword("secret1234")
  currentEnv = {
    DB: createFakeDb({
      auth_users: [
        {
          id: "user-1",
          email: "user@example.com",
          name: "User",
          image: null,
          password_hash: credentials.password_hash,
          password_salt: credentials.password_salt,
          password_updated_at: null,
        },
      ],
    }),
  }

  const response = await webLogin(
    makeJsonRequest("/api/auth/login", {
      email: "user@example.com",
      password: "secret1234",
    }),
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as { user: { email: string | null } }
  assert.equal(body.user.email, "user@example.com")
  assert.ok(response.headers.get("set-cookie")?.startsWith("session_token="))

  const denied = await webLogin(
    makeJsonRequest("/api/auth/login", {
      email: "user@example.com",
      password: "bad-password",
    }),
  )
  assert.equal(denied.status, 401)
}

{
  currentEnv = {
    DB: createFakeDb(),
  }

  const response = await mobileRegister(
    makeJsonRequest("/api/mobile/v1/auth/register", {
      email: "mobile@example.com",
      password: "mobilepass123",
      name: "Mobile",
      label: "phone",
    }),
  )
  assert.equal(response.status, 200)
  const payload = (await response.json()) as { ok: boolean; data: { token: string } }
  assert.equal(payload.ok, true)
  assert.equal(typeof payload.data.token, "string")
}

{
  const credentials = await hashPassword("secret1234")
  currentEnv = {
    DB: createFakeDb({
      auth_users: [
        {
          id: "user-1",
          email: "user@example.com",
          name: "User",
          image: null,
          password_hash: credentials.password_hash,
          password_salt: credentials.password_salt,
          password_updated_at: null,
        },
      ],
    }),
  }

  const denied = await mobileLogin(
    makeJsonRequest("/api/mobile/v1/auth/login", {
      email: "user@example.com",
      password: "wrong-password",
      label: "phone",
    }),
  )
  assert.equal(denied.status, 401)
  const payload = (await denied.json()) as {
    ok: boolean
    error: { code: string }
  }
  assert.equal(payload.ok, false)
  assert.equal(payload.error.code, "UNAUTHORIZED")
}

console.log("auth-routes spec passed")

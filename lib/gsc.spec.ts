import assert from "node:assert/strict"
import { MissingGoogleAccountError, getAccessToken } from "./gsc"
import { createFakeDb } from "./_test-fake-db"

const env = {
  DB: createFakeDb(),
  AUTH_GOOGLE_ID: "id",
  AUTH_GOOGLE_SECRET: "secret",
} as unknown as CloudflareEnv

await assert.rejects(async () => {
  await getAccessToken(env, "user-no-google")
}, MissingGoogleAccountError)

console.log("gsc spec passed")


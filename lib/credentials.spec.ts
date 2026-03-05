import assert from "node:assert/strict"
import {
  hashPassword,
  validateCredentials,
  verifyPassword,
} from "./credentials"

const valid = validateCredentials({
  email: "  TEST@Example.com  ",
  password: "supersecret",
  name: "  Jan  ",
}, {
  requireName: false,
})

assert.ok(valid.ok)
assert.equal(valid.data.email, "test@example.com")
assert.equal(valid.data.name, "Jan")

const tooShort = validateCredentials({
  email: "user@example.com",
  password: "123",
  name: "",
}, {
  requireName: false,
})
assert.ok(!tooShort.ok)
assert.ok(tooShort.errors.includes("Password must be at least 8 characters long"))

const missingName = validateCredentials({
  email: "user@example.com",
  password: "password123",
  name: "",
}, {
  requireName: true,
})
assert.ok(!missingName.ok)
assert.ok(missingName.errors.includes("Name is required"))

const hash = await hashPassword("secret-pass")
const correct = await verifyPassword("secret-pass", hash.password_hash, hash.password_salt)
const wrong = await verifyPassword("wrong-pass", hash.password_hash, hash.password_salt)
assert.equal(correct, true)
assert.equal(wrong, false)

assert.equal(await verifyPassword("secret-pass", "invalid", hash.password_salt), false)

console.log("credentials spec passed")


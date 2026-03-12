import assert from "node:assert/strict"
import {
  buildMobileGoogleConflictPagePath,
  buildMobileGoogleRelinkDeepLink,
  buildMobileGoogleSuccessPagePath,
} from "./mobile-oauth-ui"

const conflictPath = buildMobileGoogleConflictPagePath({
  locale: "pl",
  relinkToken: "token-123",
  scheme: "zenshi",
})

assert.equal(
  conflictPath,
  "/pl/auth/mobile-google-link?status=conflict&relinkToken=token-123&deepLink=zenshi%3A%2F%2Fauth%3FgoogleRelink%3D1%26relinkToken%3Dtoken-123",
)

assert.equal(
  buildMobileGoogleRelinkDeepLink("token-123", "zenshi"),
  "zenshi://auth?googleRelink=1&relinkToken=token-123",
)

assert.equal(
  buildMobileGoogleSuccessPagePath({ locale: "en", scheme: "zenshi" }),
  "/auth/mobile-google-link?status=success&deepLink=zenshi%3A%2F%2Fauth%3Flinked%3D1",
)

console.log("mobile oauth ui spec passed")

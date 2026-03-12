import { getLocalePath } from "@/lib/locale"

type MobileGooglePageOptions = {
  locale: "en" | "pl" | "de"
  scheme: string
}

export function buildMobileGoogleRelinkDeepLink(relinkToken: string, scheme: string) {
  return `${scheme}://auth?googleRelink=1&relinkToken=${encodeURIComponent(relinkToken)}`
}

export function buildMobileGoogleLinkedDeepLink(scheme: string) {
  return `${scheme}://auth?linked=1`
}

export function buildMobileGoogleConflictPagePath(
  options: MobileGooglePageOptions & { relinkToken: string },
) {
  const deepLink = buildMobileGoogleRelinkDeepLink(options.relinkToken, options.scheme)
  const url = new URL(getLocalePath(options.locale, "/auth/mobile-google-link"), "https://zenshi.local")
  url.searchParams.set("status", "conflict")
  url.searchParams.set("relinkToken", options.relinkToken)
  url.searchParams.set("deepLink", deepLink)
  return `${url.pathname}${url.search}`
}

export function buildMobileGoogleSuccessPagePath(options: MobileGooglePageOptions) {
  const deepLink = buildMobileGoogleLinkedDeepLink(options.scheme)
  const url = new URL(getLocalePath(options.locale, "/auth/mobile-google-link"), "https://zenshi.local")
  url.searchParams.set("status", "success")
  url.searchParams.set("deepLink", deepLink)
  return `${url.pathname}${url.search}`
}

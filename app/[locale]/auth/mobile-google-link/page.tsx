import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"
import { FieldDescription, FieldGroup } from "@/components/ui/field"
import { getLocalePath } from "@/lib/locale"

export const dynamic = "force-dynamic"

function sanitizeDeepLink(value: string | undefined, fallback: string) {
  if (!value) return fallback
  if (!value.includes("://")) return fallback
  return value
}

export default async function MobileGoogleLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "en" | "pl" | "de" }>
  searchParams: Promise<{
    status?: string
    deepLink?: string
  }>
}) {
  const { locale } = await params
  const query = await searchParams
  const t = await getTranslations({ locale, namespace: "auth" })

  const isConflict = query.status === "conflict"
  const fallbackHome = getLocalePath(locale, "/")
  const deepLink = sanitizeDeepLink(query.deepLink, "zenshi://auth")

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border bg-background p-6 shadow-sm">
        <FieldGroup>
          <h1 className="text-2xl font-semibold">
            {isConflict ? t("mobileGoogleConflictTitle") : t("mobileGoogleSuccessTitle")}
          </h1>
          <FieldDescription>
            {isConflict ? t("mobileGoogleConflictDescription") : t("mobileGoogleSuccessDescription")}
          </FieldDescription>
          <Button asChild className="w-full">
            <a href={deepLink}>{isConflict ? t("mobileGoogleConflictOpenApp") : t("mobileGoogleSuccessOpenApp")}</a>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={fallbackHome}>{t("mobileGoogleBackToSite")}</Link>
          </Button>
          <FieldDescription>{t("mobileGoogleOpenAppHint")}</FieldDescription>
        </FieldGroup>
      </div>
    </main>
  )
}

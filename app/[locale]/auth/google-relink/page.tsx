import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getLocalePath } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup } from "@/components/ui/field";

export const dynamic = "force-dynamic";

function sanitizeReturnTo(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("://")) return fallback;
  return value;
}

export default async function GoogleRelinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "en" | "pl" | "de" }>;
  searchParams: Promise<{
    relinkToken?: string;
    returnTo?: string;
    error?: string;
  }>;
}) {
  const { locale } = await params;
  const [query, session, t] = await Promise.all([
    searchParams,
    auth(),
    getTranslations({ locale, namespace: "auth" }),
  ]);

  const relinkToken = query.relinkToken ?? "";
  const returnTo = sanitizeReturnTo(query.returnTo, getLocalePath(locale, "/"));
  const isMissingToken = !relinkToken || query.error === "missing-token";
  const isInvalidToken = query.error === "invalid-token";

  if (!session) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-6 py-12">
        <div className="w-full rounded-2xl border bg-background p-6 shadow-sm">
          <FieldGroup>
            <h1 className="text-2xl font-semibold">{t("googleRelinkTitle")}</h1>
            <FieldDescription>{t("googleRelinkUnauthorized")}</FieldDescription>
            <Button asChild className="w-full">
              <Link href={getLocalePath(locale, "/")}>{t("signinMode")}</Link>
            </Button>
          </FieldGroup>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border bg-background p-6 shadow-sm">
        <FieldGroup>
          <h1 className="text-2xl font-semibold">{t("googleRelinkTitle")}</h1>
          <FieldDescription>
            {isMissingToken || isInvalidToken
              ? t("googleRelinkExpired")
              : t("googleRelinkDescription")}
          </FieldDescription>
          {isMissingToken || isInvalidToken ? null : (
            <form action="/api/auth/google/relink" method="post" className="flex flex-col gap-3">
              <input type="hidden" name="relinkToken" value={relinkToken} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button type="submit" className="w-full">
                {t("googleRelinkConfirm")}
              </Button>
            </form>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link href={returnTo}>{t("googleRelinkCancel")}</Link>
          </Button>
        </FieldGroup>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getLocalePath } from "@/lib/locale";

type AccountSettingsPanelProps = {
  user: {
    name: string | null
    email: string | null
  }
}

export function AccountSettingsPanel({ user }: AccountSettingsPanelProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("accountPage");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const deleteAccount = async () => {
    if (typeof window === "undefined") return;
    const confirmed = window.confirm(t("deleteConfirm"));
    if (!confirmed) return;

    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || t("deleteError"));
      }

      router.replace(getLocalePath(locale as "en" | "pl" | "de", "/"));
      router.refresh();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("deleteError"));
      setIsDeleting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-3xl border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="rounded-2xl border bg-background/70 p-4">
        <p className="text-sm font-medium">{user.name || t("fallbackName")}</p>
        <p className="text-sm text-muted-foreground">{user.email || t("missingEmail")}</p>
      </div>

      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="space-y-2">
          <h2 className="text-base font-semibold">{t("deleteTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("deleteDescription")}</p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="mt-4">
          <Button variant="destructive" onClick={deleteAccount} disabled={isDeleting}>
            {isDeleting ? t("deleting") : t("deleteAction")}
          </Button>
        </div>
      </div>
    </section>
  );
}


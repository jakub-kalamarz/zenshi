"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { GhostIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const t = useTranslations("auth");

  const handleLogin = () => {
    if (typeof window === "undefined") return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const startUrl = new URL("/api/auth/google/start", window.location.origin);
    startUrl.searchParams.set("returnTo", currentPath);
    window.location.href = startUrl.toString();
  };

  return (
    <form className={cn("flex flex-col gap-6", className)} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <GhostIcon className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{t("welcomeBack")}</h1>
            <p className="text-muted-foreground text-sm text-balance">
              {t("useGoogle")}
            </p>
          </div>
        </div>
        <Field>
          <Button type="button" className="w-full" onClick={handleLogin}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="size-5"
            >
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.5 16.2 18.9 14 24 14c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.3 35.5 26.8 36 24 36c-5.2 0-9.6-3.4-11.2-8.1l-6.5 5C9.6 39.7 16.3 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-1.5 4-5.3 6.9-9.3 6.9-5.2 0-9.6-3.4-11.2-8.1l-6.5 5C9.6 39.7 16.3 44 24 44c10.3 0 19.2-7.5 19.2-20 0-1.3-.1-2.7-.4-3.5z"
              />
            </svg>
            {t("continueWithGoogle")}
          </Button>
        </Field>
      </FieldGroup>
      <FieldDescription className="text-center text-xs text-muted-foreground">
        {t("signinLegal")}
        {/*
        Links are hidden until dedicated pages are available:
        <a className="underline-offset-4 hover:underline" href="/terms">Terms of Service</a>
        <a className="underline-offset-4 hover:underline" href="/privacy">Privacy Policy</a>
        */}
      </FieldDescription>
    </form>
  );
}

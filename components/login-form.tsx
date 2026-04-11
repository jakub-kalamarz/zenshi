"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldGroup,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { GhostIcon } from "@phosphor-icons/react";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const t = useTranslations("auth");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignIn = mode === "signin";

  const handleGoogle = () => {
    if (typeof window === "undefined") return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const startUrl = new URL("/api/auth/google/start", window.location.origin);
    startUrl.searchParams.set("returnTo", currentPath);
    window.location.href = startUrl.toString();
  };

  const handleApple = () => {
    if (typeof window === "undefined") return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const startUrl = new URL("/api/auth/apple/start", window.location.origin);
    startUrl.searchParams.set("returnTo", currentPath);
    window.location.href = startUrl.toString();
  };

  const switchMode = (nextMode: "signin" | "signup") => {
    setMode(nextMode);
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window === "undefined") return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(isSignIn ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          password,
          ...(isSignIn ? {} : { name }),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string };
        throw new Error(payload?.error || t("authError"));
      }

      window.location.reload();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : t("authError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={submit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <GhostIcon className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">
              {isSignIn ? t("signinTitle") : t("signupTitle")}
            </h1>
            <p className="text-muted-foreground text-sm text-balance">
              {isSignIn ? t("signinSubtitle") : t("signupSubtitle")}
            </p>
          </div>
        </div>

        <Field>
          <FieldContent>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={isSignIn ? "default" : "outline"}
                onClick={() => switchMode("signin")}
              >
                {t("signinMode")}
              </Button>
              <Button
                type="button"
                variant={!isSignIn ? "default" : "outline"}
                onClick={() => switchMode("signup")}
              >
                {t("signupMode")}
              </Button>
            </div>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>{t("emailLabel")}</FieldLabel>
          <FieldContent>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("emailPlaceholder")}
              required
            />
          </FieldContent>
        </Field>

        {!isSignIn ? (
          <Field>
            <FieldLabel>{t("nameLabel")}</FieldLabel>
            <FieldContent>
              <Input
                type="text"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </FieldContent>
          </Field>
        ) : null}

        <Field>
          <FieldLabel>{t("passwordLabel")}</FieldLabel>
          <FieldContent>
            <Input
              type="password"
              name="password"
              autoComplete={isSignIn ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              placeholder={t("passwordPlaceholder")}
            />
          </FieldContent>
        </Field>

        {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? t("processing")
            : isSignIn
              ? t("continueWithEmail")
              : t("createAccount")}
        </Button>

        <FieldSeparator>{t("or")}</FieldSeparator>

        <Button type="button" className="w-full" onClick={handleGoogle} disabled={loading}>
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

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleApple}
          disabled={loading}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
            <path d="M15.18 1.88c0 1.42-.52 2.73-1.36 3.67-.87.98-2.29 1.73-3.56 1.63-.16-1.31.47-2.72 1.31-3.69.92-1.07 2.47-1.84 3.61-1.91zm4.11 16.54c-.75 1.09-1.08 1.57-2.04 2.53-1.34 1.34-3.23 3.02-5.58 3.04-2.09.02-2.63-1.34-5.47-1.33-2.84.01-3.44 1.35-5.53 1.33-2.35-.02-4.14-1.53-5.48-2.87C-5.76 18.6-7.5 13.95-5.78 9.96c1.22-2.84 3.94-4.63 6.49-4.63 2.59 0 4.22 1.42 6.36 1.42 2.08 0 3.35-1.42 6.34-1.42 2.27 0 4.67 1.24 5.89 3.39-5 2.74-4.19 9.94 0 12.7z" transform="translate(6 0)" />
          </svg>
          {t("continueWithApple")}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          {isSignIn ? t("noAccount") : t("alreadyHaveAccount")}
        </p>
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

"use client";

import * as React from "react";
import { GhostIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

type BrandButtonProps = {
  className?: string;
  iconClassName?: string;
};

export function BrandButton({ className, iconClassName }: BrandButtonProps) {
  const t = useTranslations("common");

  return (
    <Button asChild variant="ghost" className={cn("gap-2", className)}>
      <Link href="/" aria-label={t("dashboard")}>
        <GhostIcon className={cn("size-5", iconClassName)} />
        <span className="text-[1rem] font-semibold leading-none tracking-[-0.02em] text-foreground">
          zenshi
        </span>
      </Link>
    </Button>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowsClockwise,
  CaretUpDown,
  ShareNetwork,
  SignOut,
} from "@phosphor-icons/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ShareManager } from "@/components/share/share-manager";
import { getLocalePath } from "@/lib/locale";

type NavUserProps = {
  user: {
    name: string;
    email: string;
    avatar?: string | null;
  };
  onSignOut?: () => void;
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]?.slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

export function NavUser({ user, onSignOut }: NavUserProps) {
  const locale = useLocale();
  const t = useTranslations("navUser");
  const [shareOpen, setShareOpen] = React.useState(false);
  const fallback = initials(user.name || user.email);
  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut();
      return;
    }
    void (async () => {
      try {
        window.location.href = "/api/auth/logout";
      } catch {
        window.location.href = getLocalePath(locale as "en" | "pl" | "de", "/");
      }
    })();
  };

  return (
    <Sheet open={shareOpen} onOpenChange={setShareOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-11 items-center gap-3 rounded-lg px-2 text-left"
          >
            <Avatar className="h-8 w-8 rounded-lg">
              {user.avatar ? (
                <AvatarImage src={user.avatar} alt={user.name} />
              ) : null}
              <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 flex-1 sm:grid">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
            <CaretUpDown className="ml-auto hidden size-4 sm:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-56 rounded-lg"
          align="end"
          sideOffset={6}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
              <Avatar className="h-8 w-8 rounded-lg">
                {user.avatar ? (
                  <AvatarImage src={user.avatar} alt={user.name} />
                ) : null}
                <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          {/*
          Placeholder actions without handlers are intentionally hidden for now:
          - Upgrade to Pro
          - Account
          - Billing
          - Notifications
          */}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setShareOpen(true);
              }}
            >
              <ShareNetwork className="size-4" />
              {t("shareLinks")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={getLocalePath(locale as "en" | "pl" | "de", "/sync")}>
                <ArrowsClockwise className="size-4" />
                {t("syncStatus")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <SignOut className="size-4" />
            {t("logOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SheetContent
        side="right"
        className="w-full overflow-hidden border-l bg-background/95 p-0 backdrop-blur-sm sm:max-w-xl"
      >
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle>{t("shareLinksTitle")}</SheetTitle>
          <SheetDescription>
            {t("shareLinksDescription")}
          </SheetDescription>
        </SheetHeader>
        <div className="h-[calc(100%-5rem)] overflow-y-auto p-4">
          <ShareManager />
        </div>
      </SheetContent>
    </Sheet>
  );
}

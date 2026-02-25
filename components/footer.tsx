"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type FooterProps = {
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function Footer({ leftSlot, rightSlot, className }: FooterProps) {
  return (
    <footer
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-3 px-6 md:px-2 py-4 text-sm text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">{leftSlot}</div>
      <div className="flex items-center gap-3">{rightSlot}</div>
    </footer>
  );
}

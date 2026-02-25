import * as React from "react";

import { cn } from "@/lib/utils";

export type HeaderProps = {
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function Header({ leftSlot, rightSlot, className }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex w-full items-center justify-between px-6 md:px-2 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">{leftSlot}</div>
      <div className="flex items-center gap-3">{rightSlot}</div>
    </header>
  );
}

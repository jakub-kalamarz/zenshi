"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ThemeKey = "light" | "dark" | "system";

function isThemeKey(value: string | undefined): value is ThemeKey {
  return value === "light" || value === "dark" || value === "system";
}

const THEME_OPTIONS: Array<{
  key: ThemeKey;
  label: string;
  icon: typeof Sun;
}> = [
  { key: "system", label: "System theme", icon: Monitor },
  { key: "light", label: "Light theme", icon: Sun },
  { key: "dark", label: "Dark theme", icon: Moon },
];

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const activeTheme = isThemeKey(theme) ? theme : "system";

  return (
    <div
      className="inline-flex h-8 items-center border border-border bg-background"
      role="group"
      aria-label="Theme switcher"
    >
      {THEME_OPTIONS.map(({ key, label, icon: Icon }) => {
        const isActive = activeTheme === key;
        return (
          <Button
            key={key}
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => setTheme(key)}
            className={cn(
              "h-full w-8 border-0 rounded-none",
              key !== "system" && "border-l border-border",
              isActive
                ? "bg-muted text-foreground hover:bg-muted"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
          </Button>
        );
      })}
    </div>
  );
}

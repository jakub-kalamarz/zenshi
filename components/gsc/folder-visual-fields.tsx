import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { FOLDER_ICON_OPTIONS, FOLDER_COLOR_OPTIONS } from "./types";
import { FolderGlyph } from "./folder-glyph";
import { useTranslations } from "next-intl";

export type FolderVisualFieldsProps = {
  icon: string;
  color: string;
  onIconChange: (value: string) => void;
  onColorChange: (value: string) => void;
};

export function FolderVisualFields({
  icon,
  color,
  onIconChange,
  onColorChange,
}: FolderVisualFieldsProps) {
  const t = useTranslations("folderVisual");
  return (
    <div className="grid gap-3">
      <div
        className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2"
        style={{ borderColor: `${color}66` }}
      >
        <span
          className="inline-flex size-8 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}22` }}
        >
          <FolderGlyph iconId={icon} className="size-4" color={color} />
        </span>
        <div className="text-xs text-muted-foreground">{t("preview")}</div>
      </div>
      <div className="grid gap-2">
        <Label>{t("icon")}</Label>
        <div className="overflow-x-auto rounded-lg border bg-muted/20 p-2">
          <div
            className="mx-auto grid min-w-[16.5rem] grid-cols-6 gap-1.5"
            style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
          >
            {FOLDER_ICON_OPTIONS.map((option) => {
              const selected = icon === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-label={t("selectIcon", { icon: option.label })}
                  title={option.label}
                  onClick={() => onIconChange(option.id)}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-md transition-colors",
                    selected
                      ? "bg-primary/10 ring-2 ring-primary/55"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  <FolderGlyph
                    iconId={option.id}
                    className="size-4"
                    color={selected ? color : undefined}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("selected")}:{" "}
          {FOLDER_ICON_OPTIONS.find((option) => option.id === icon)?.label ??
            t("defaultIcon")}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>{t("color")}</Label>
        <div className="overflow-x-auto rounded-lg border bg-muted/20 p-1.5">
          <div className="mx-auto flex min-w-max items-center gap-1">
            {FOLDER_COLOR_OPTIONS.map((option) => {
              const selected = color === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-label={t("selectColor", { color: option.label })}
                  title={option.label}
                  onClick={() => onColorChange(option.value)}
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                    selected
                      ? "bg-primary/10 ring-2 ring-primary/55"
                      : "bg-muted/60 hover:bg-muted",
                  )}
                >
                  <span
                    className="inline-flex size-5 rounded-full border border-black/15"
                    style={{ backgroundColor: option.value }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("selected")}:{" "}
          {FOLDER_COLOR_OPTIONS.find((option) => option.value === color)
            ?.label ?? t("defaultColor")}
        </div>
      </div>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarBlank,
  DotsThree,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import type { DateRange as CalendarRange } from "react-day-picker";
import type {
  DateRange,
  CompareMode,
  Granularity,
  RangePresetId,
} from "./types";
import { RANGE_PRESETS } from "./types";
import {
  rangeFromDays,
  rangeLastWeek,
  rangeThisMonth,
  rangeLastMonth,
  rangeThisQuarter,
  rangeLastQuarter,
  rangeYearToDate,
  rangeFromMonths,
  ymdToUtcDate,
} from "./date-utils";

export type SiteDetailToolbarProps = {
  granularity: Granularity;
  allowedGranularities: Granularity[];
  granularityLabel: string;
  onGranularityChange: (value: Granularity) => void;
  preset: RangePresetId;
  range: DateRange;
  onApplyRange: (range: DateRange) => void;
  calendarRange: CalendarRange | undefined;
  onCalendarSelect: (range: CalendarRange | undefined) => void;
  compareMode: CompareMode;
  compareLabelText: string;
  onCompareModeChange: (mode: CompareMode) => void;
  compareCalendarRange: CalendarRange | undefined;
  onCompareCalendarSelect: (range: CalendarRange | undefined) => void;
  compareSettings: {
    showPreviousTrend: boolean;
    matchWeekdays: boolean;
    showChangePercent: boolean;
  };
  onCompareSettingsChange: (
    updater: (prev: {
      showPreviousTrend: boolean;
      matchWeekdays: boolean;
      showChangePercent: boolean;
    }) => {
      showPreviousTrend: boolean;
      matchWeekdays: boolean;
      showChangePercent: boolean;
    },
  ) => void;
};

export function SiteDetailToolbar({
  granularity,
  allowedGranularities,
  granularityLabel,
  onGranularityChange,
  preset,
  range,
  onApplyRange,
  calendarRange,
  onCalendarSelect,
  compareMode,
  compareLabelText,
  onCompareModeChange,
  compareCalendarRange,
  onCompareCalendarSelect,
  compareSettings,
  onCompareSettingsChange,
}: SiteDetailToolbarProps) {
  const t = useTranslations("toolbar");
  const allowDay = allowedGranularities.includes("day");
  const allowWeek = allowedGranularities.includes("week");
  const allowMonth = allowedGranularities.includes("month");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <CalendarBlank className="size-4" />
            <span>{granularityLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel>{t("granularity")}</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={granularity === "day"}
            disabled={!allowDay}
            onCheckedChange={(value) => {
              if (value && allowDay) onGranularityChange("day");
            }}
          >
            {t("daily")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={granularity === "week"}
            disabled={!allowWeek}
            onCheckedChange={(value) => {
              if (value && allowWeek) onGranularityChange("week");
            }}
          >
            {t("weekly")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={granularity === "month"}
            disabled={!allowMonth}
            onCheckedChange={(value) => {
              if (value && allowMonth) onGranularityChange("month");
            }}
          >
            {t("monthly")}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ButtonGroup aria-label={t("quickRanges")}>
        {RANGE_PRESETS.map((option) => (
          <Button
            key={option.id}
            variant={preset === option.id ? "default" : "outline"}
            size="sm"
            className={preset === option.id ? "border-border" : undefined}
            data-state={preset === option.id ? "on" : "off"}
            aria-pressed={preset === option.id}
            onClick={() => onApplyRange(rangeFromDays(option.days))}
          >
            {option.label}
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label={t("moreRanges")}>
              <DotsThree className="size-4" weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>{t("relative")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onApplyRange(rangeLastWeek())}>
              {t("lastWeek")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onApplyRange(rangeThisMonth())}>
              {t("thisMonth")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onApplyRange(rangeLastMonth())}>
              {t("lastMonth")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onApplyRange(rangeThisQuarter())}
            >
              {t("thisQuarter")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onApplyRange(rangeLastQuarter())}
            >
              {t("lastQuarter")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onApplyRange(rangeYearToDate())}>
              {t("yearToDate")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("months")}</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onApplyRange(rangeFromMonths(3))}
            >
              {t("threeMonths")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onApplyRange(rangeFromMonths(6))}
            >
              {t("sixMonths")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onApplyRange(rangeFromMonths(12))}
            >
              {t("twelveMonths")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onApplyRange(rangeFromMonths(24))}
            >
              {t("twoYears")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onApplyRange(rangeFromMonths(36))}
            >
              {t("threeYears")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("custom")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-auto p-0">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={calendarRange}
                  onSelect={onCalendarSelect}
                  defaultMonth={
                    calendarRange?.from ?? ymdToUtcDate(range.start)
                  }
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowsClockwise className="size-4" />
            <span>{compareLabelText}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>{t("comparisonPeriod")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onCompareModeChange("disabled")}>
            {t("disabled")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCompareModeChange("previous")}>
            {t("previousPeriod")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCompareModeChange("yoy")}>
            {t("yearOverYear")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("custom")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-auto p-0">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={compareCalendarRange}
                onSelect={onCompareCalendarSelect}
                defaultMonth={
                  compareCalendarRange?.from ?? ymdToUtcDate(range.start)
                }
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("comparisonSettings")}</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={compareSettings.showPreviousTrend}
            onCheckedChange={(value) =>
              onCompareSettingsChange((prev) => ({
                ...prev,
                showPreviousTrend: Boolean(value),
              }))
            }
          >
            {t("previousTrend")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={compareSettings.matchWeekdays}
            onCheckedChange={(value) =>
              onCompareSettingsChange((prev) => ({
                ...prev,
                matchWeekdays: Boolean(value),
              }))
            }
          >
            {t("matchWeekdays")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={compareSettings.showChangePercent}
            onCheckedChange={(value) =>
              onCompareSettingsChange((prev) => ({
                ...prev,
                showChangePercent: Boolean(value),
              }))
            }
          >
            {t("showChangePercent")}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

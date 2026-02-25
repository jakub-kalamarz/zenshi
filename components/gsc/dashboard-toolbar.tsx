import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
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
  MagnifyingGlass,
  FolderPlus,
  FolderOpen,
  PencilSimple,
  Trash,
  ArrowsLeftRight,
} from "@phosphor-icons/react";
import type { DateRange as CalendarRange } from "react-day-picker";
import type {
  DateRange,
  CompareMode,
  Granularity,
  RangePresetId,
  SortId,
  SortOption,
} from "./types";
import { RANGE_PRESETS, SORT_OPTIONS } from "./types";
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

export type DashboardToolbarProps = {
  domainQuery: string;
  onDomainQueryChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  sortId: SortId;
  onSortChange: (value: SortId) => void;
  currentSort: SortOption;
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
  onOpenCreateFolder: () => void;
  onOpenMoveFromMenu: () => void;
  onOpenRenameFromMenu: () => void;
  onOpenDeleteFromMenu: () => void;
};

export function DashboardToolbar({
  domainQuery,
  onDomainQueryChange,
  searchInputRef,
  sortId,
  onSortChange,
  currentSort,
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
  onOpenCreateFolder,
  onOpenMoveFromMenu,
  onOpenRenameFromMenu,
  onOpenDeleteFromMenu,
}: DashboardToolbarProps) {
  const t = useTranslations("toolbar");
  const CurrentSortIcon = currentSort.icon;
  const sortLabel = (id: SortId) => {
    if (id === "total-clicks") return t("sort.totalClicks");
    if (id === "growth-clicks") return t("sort.growthClicks");
    if (id === "growth-clicks-pct") return t("sort.growthPctClicks");
    return t("sort.az");
  };

  const allowDay = allowedGranularities.includes("day");
  const allowWeek = allowedGranularities.includes("week");
  const allowMonth = allowedGranularities.includes("month");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <InputGroup className="w-full max-w-sm">
        <InputGroupInput
          ref={searchInputRef}
          placeholder={t("searchDomains")}
          aria-label={t("searchDomains")}
          value={domainQuery}
          onChange={(event) => onDomainQueryChange(event.target.value)}
        />
        <InputGroupAddon>
          <MagnifyingGlass className="size-3 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <Kbd>⌘K</Kbd>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              aria-label={t("folders")}
            >
              <FolderOpen className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={onOpenCreateFolder}>
              <FolderPlus className="size-4 text-muted-foreground" />
              {t("newFolder")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenMoveFromMenu}>
              <ArrowsLeftRight className="size-4 text-muted-foreground" />
              {t("moveSite")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenRenameFromMenu}>
              <PencilSimple className="size-4 text-muted-foreground" />
              {t("renameFolder")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenDeleteFromMenu}>
              <Trash className="size-4 text-muted-foreground" />
              {t("deleteFolder")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              aria-label={t("sortBy", { label: sortLabel(currentSort.id) })}
            >
              <CurrentSortIcon className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t("sortByLabel")}</DropdownMenuLabel>
            {SORT_OPTIONS.map((option) => {
              const OptionIcon = option.icon;
              return (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  className="gap-2"
                  checked={sortId === option.id}
                  onCheckedChange={(value) => {
                    if (value) onSortChange(option.id);
                  }}
                >
                  <OptionIcon className="size-4 text-muted-foreground" />
                  {sortLabel(option.id)}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
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
    </div>
  );
}

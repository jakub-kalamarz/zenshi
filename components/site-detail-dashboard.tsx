"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { SiteCardData } from "@/components/site-card";
import { MetricGrid } from "@/components/metric-grid";
import { SiteCardChart } from "@/components/site-card-chart";
import { PagesTable, type PageRow } from "@/components/pages-table";
import { QueriesTable, type QueryRow } from "@/components/queries-table";
import { DevicesTable, type DeviceRow } from "@/components/devices-table";
import { SiteDetailToolbar } from "@/components/gsc/site-detail-toolbar";
import type { DateRange as CalendarRange } from "react-day-picker";
import type {
  DateRange,
  CompareMode,
  Granularity,
} from "@/components/gsc/types";
import {
  toYmd,
  rangeYearOverYear,
  previousRange,
  ymdToUtcDate,
  defaultDateRange,
  matchPreset,
} from "@/components/gsc/date-utils";
import {
  clampGranularityToAllowed,
  getAllowedGranularities,
} from "@/lib/gsc-granularity";

type SiteDetailDashboardProps = {
  siteId: string;
};

type SiteDetailApiResponse = {
  card: SiteCardData;
  pages: PageRow[];
  queries: QueryRow[];
  devices?: DeviceRow[];
};

export function SiteDetailDashboard({ siteId }: SiteDetailDashboardProps) {
  const t = useTranslations("siteDetail");
  const [card, setCard] = useState<SiteCardData | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [range, setRange] = useState<DateRange>(() => defaultDateRange());
  const [compareMode, setCompareMode] = useState<CompareMode>("previous");
  const [compareSettings, setCompareSettings] = useState({
    showPreviousTrend: true,
    matchWeekdays: true,
    showChangePercent: true,
  });
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [compareCalendarRange, setCompareCalendarRange] = useState<
    CalendarRange | undefined
  >({
    from: ymdToUtcDate(defaultDateRange().start),
    to: ymdToUtcDate(defaultDateRange().end),
  });
  const [, startTransition] = useTransition();
  const preset = useMemo(() => matchPreset(range), [range]);
  const allowedGranularities = useMemo(
    () => getAllowedGranularities(range.start, range.end),
    [range.end, range.start],
  );
  const calendarRange = useMemo(
    () => ({
      from: ymdToUtcDate(range.start),
      to: ymdToUtcDate(range.end),
    }),
    [range.end, range.start],
  );
  const effectiveGranularity = useMemo(
    () => clampGranularityToAllowed(granularity, allowedGranularities),
    [allowedGranularities, granularity],
  );

  const compareLabelText = useMemo(
    () => t(`compare.${compareMode}`),
    [compareMode, t],
  );
  const compareRange = useMemo(() => {
    if (compareMode === "disabled") return null;
    if (compareMode === "previous") return previousRange(range.start, range.end);
    if (compareMode === "yoy") return rangeYearOverYear(range);
    if (
      compareMode === "custom" &&
      compareCalendarRange?.from &&
      compareCalendarRange?.to
    ) {
      return {
        start: toYmd(compareCalendarRange.from),
        end: toYmd(compareCalendarRange.to),
      };
    }
    return null;
  }, [compareCalendarRange, compareMode, range]);
  const granularityLabel = useMemo(() => {
    if (effectiveGranularity === "week") return t("weekly");
    if (effectiveGranularity === "month") return t("monthly");
    return t("daily");
  }, [effectiveGranularity, t]);

  const loadData = useCallback(
    async (dateRange: DateRange, cmpRange: DateRange | null) => {
      const queryParams = new URLSearchParams({
        siteId,
        start: dateRange.start,
        end: dateRange.end,
        limit: "1000",
        granularity: effectiveGranularity,
      });

      if (cmpRange) {
        queryParams.set("compareStart", cmpRange.start);
        queryParams.set("compareEnd", cmpRange.end);
      }

      const res = await fetch(`/api/gsc/site-detail?${queryParams.toString()}`);

      if (!res.ok) {
        throw new Error(t("loadSiteFailed"));
      }

      const { card: data, pages: pagesData, queries: queriesData, devices: devicesData } =
        (await res.json()) as SiteDetailApiResponse;

      startTransition(() => {
        setCard(data);
        setPages(pagesData);
        setQueries(queriesData);
        setDevices(devicesData ?? []);
      });
      const servedRange = data.servedRange ?? data.effectiveRange;
      if (
        preset !== "custom" &&
        servedRange &&
        (servedRange.start !== dateRange.start ||
          servedRange.end !== dateRange.end)
      ) {
        setRange(servedRange);
      }
    },
    [siteId, preset, effectiveGranularity, startTransition, t],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData(range, compareRange).catch((err) => {
      const message = err instanceof Error ? err.message : t("loadFailed");
      toast.error(message);
    });
  }, [range, compareRange, loadData, t]);

  const applyRange = useCallback((nextRange: DateRange) => {
    setRange(nextRange);
  }, []);

  const handleCalendarSelect = useCallback(
    (nextRange: CalendarRange | undefined) => {
      if (nextRange?.from && nextRange.to) {
        applyRange({
          start: toYmd(nextRange.from),
          end: toYmd(nextRange.to),
        });
      }
    },
    [applyRange],
  );

  const handleCompareCalendarSelect = useCallback(
    (nextRange: CalendarRange | undefined) => {
      if (!nextRange) {
        setCompareCalendarRange(undefined);
        return;
      }
      setCompareCalendarRange(nextRange);
      if (nextRange.from && nextRange.to) {
        setCompareMode("custom");
      }
    },
    [],
  );

  const total = card?.total;
  const compareEnabled = compareMode !== "disabled";

  return (
    <div className="flex w-full flex-col gap-6">
      <SiteDetailToolbar
        granularity={granularity}
        allowedGranularities={allowedGranularities}
        granularityLabel={granularityLabel}
        onGranularityChange={setGranularity}
        preset={preset}
        range={range}
        onApplyRange={applyRange}
        calendarRange={calendarRange}
        onCalendarSelect={handleCalendarSelect}
        compareMode={compareMode}
        compareLabelText={compareLabelText}
        onCompareModeChange={setCompareMode}
        compareCalendarRange={compareCalendarRange}
        onCompareCalendarSelect={handleCompareCalendarSelect}
        compareSettings={compareSettings}
        onCompareSettingsChange={setCompareSettings}
      />
      {card?.retention?.partiallyOutside ? (
        <p className="text-xs text-muted-foreground">
          {t("retentionWarning", {
            start: card.retention.start,
            end: card.retention.end,
          })}
        </p>
      ) : null}
      <MetricGrid
        variant="default"
        clicks={total?.clicks}
        impressions={total?.impressions}
        ctr={total?.ctr}
        position={total?.position}
        compareClicks={card?.compareTotal?.clicks}
        compareImpressions={card?.compareTotal?.impressions}
        compareCtr={card?.compareTotal?.ctr}
        comparePosition={card?.compareTotal?.position}
      />
      <SiteCardChart
        chartId={siteId}
        series={card?.series ?? []}
        compareSeries={card?.compareSeries}
        granularity={effectiveGranularity}
        compareSettings={compareSettings}
        compareEnabled={compareEnabled}
        height="24rem"
      />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <QueriesTable queries={queries} compareEnabled={compareEnabled} />
        <PagesTable pages={pages} compareEnabled={compareEnabled} />
        <div className="xl:col-span-2">
          <DevicesTable devices={devices} compareEnabled={compareEnabled} />
        </div>
      </div>
    </div>
  );
}

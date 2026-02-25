"use client";

import { memo, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AreaChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import {
  CursorClick,
  Eye,
  Percent,
  Medal,
  TrendUp,
  TrendDown,
  Minus,
  Hash,
  ArrowsLeftRight,
} from "@phosphor-icons/react";
import { useChartTooltip } from "@/components/gsc/chart-tooltip-context";

export type SeriesPoint = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type Granularity = "day" | "week" | "month";

type CompareSettings = {
  showPreviousTrend: boolean;
  matchWeekdays: boolean;
  showChangePercent: boolean;
};

type SiteCardChartProps = {
  chartId: string;
  series: SeriesPoint[];
  compareSeries?: SeriesPoint[];
  granularity: Granularity;
  compareSettings: CompareSettings;
  compareEnabled: boolean;
  height?: string;
};

type ChartPoint = SeriesPoint & {
  xLabel: string;
  tooltipWeekday: string;
  tooltipDateLabel: string;
  ctrPct: number | null;
  positionPlot: number | null;
  hasData: boolean;
  compareHasData?: boolean;
  compareClicks?: number | null;
  compareImpressions?: number | null;
  compareCtr?: number | null;
  comparePosition?: number | null;
  compareCtrPct?: number | null;
  comparePositionPlot?: number | null;
  compareDate?: string | null;
  compareTooltipWeekday?: string | null;
  compareTooltipDateLabel?: string | null;
};

type ChartHoverState = {
  isTooltipActive?: boolean;
  activePayload?: Array<{ payload: ChartPoint }>;
  activeTooltipIndex?: unknown;
  chartX?: number;
  chartY?: number;
  activeCoordinate?: { x?: number; y?: number };
};

type PrimaryMetricConfig = {
  key: "clicks" | "impressions" | "ctrPct" | "positionPlot";
  axis: "left" | "right";
  color: string;
};

type CompareMetricConfig = {
  key:
    | "compareClicks"
    | "compareImpressions"
    | "compareCtrPct"
    | "comparePositionPlot";
  axis: "left" | "right";
  color: string;
};

type TooltipState = {
  active: boolean;
  payload?: Array<{ payload: ChartPoint }>;
};

type TooltipContentProps = {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  showChangePercent: boolean;
  compareEnabled: boolean;
  locale: string;
  labels: {
    clicks: string;
    impressions: string;
    ctr: string;
    position: string;
  };
};

const CURSOR_OFFSET = 14;
const VIEWPORT_PADDING = 8;
const TOOLTIP_ANCHOR_THRESHOLD_PX = 2;
const POSITION_EPSILON_PX = 1;

const ymdDayCache = new Map<string, number>();
const xAxisLabelCache = new Map<string, string>();
const tooltipLabelCache = new Map<string, { weekday: string; rest: string }>();

const PRIMARY_METRICS: PrimaryMetricConfig[] = [
  {
    key: "clicks",
    axis: "left",
    color: "var(--metric-clicks)",
  },
  {
    key: "impressions",
    axis: "left",
    color: "var(--metric-impressions)",
  },
  {
    key: "ctrPct",
    axis: "right",
    color: "var(--metric-ctr)",
  },
  {
    key: "positionPlot",
    axis: "right",
    color: "var(--metric-position)",
  },
];

const COMPARE_METRICS: CompareMetricConfig[] = [
  {
    key: "compareClicks",
    axis: "left",
    color: "var(--metric-clicks)",
  },
  {
    key: "compareImpressions",
    axis: "left",
    color: "var(--metric-impressions)",
  },
  {
    key: "compareCtrPct",
    axis: "right",
    color: "var(--metric-ctr)",
  },
  {
    key: "comparePositionPlot",
    axis: "right",
    color: "var(--metric-position)",
  },
];

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function computeTooltipPosition({
  anchorX,
  anchorY,
  tooltipWidth,
  tooltipHeight,
  viewportWidth,
  viewportHeight,
}: {
  anchorX: number;
  anchorY: number;
  tooltipWidth: number;
  tooltipHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const leftSpace = anchorX - VIEWPORT_PADDING;
  const rightSpace = viewportWidth - anchorX - VIEWPORT_PADDING;
  const topSpace = anchorY - VIEWPORT_PADDING;
  const bottomSpace = viewportHeight - anchorY - VIEWPORT_PADDING;

  const prefersLeft =
    rightSpace < tooltipWidth + CURSOR_OFFSET &&
    leftSpace >= tooltipWidth + CURSOR_OFFSET;
  const prefersTop =
    bottomSpace < tooltipHeight + CURSOR_OFFSET &&
    topSpace >= tooltipHeight + CURSOR_OFFSET;

  const rawX = prefersLeft
    ? anchorX - tooltipWidth - CURSOR_OFFSET
    : anchorX + CURSOR_OFFSET;
  const rawY = prefersTop
    ? anchorY - tooltipHeight - CURSOR_OFFSET
    : anchorY + CURSOR_OFFSET;

  return {
    x: clamp(
      rawX,
      VIEWPORT_PADDING,
      Math.max(VIEWPORT_PADDING, viewportWidth - tooltipWidth - VIEWPORT_PADDING),
    ),
    y: clamp(
      rawY,
      VIEWPORT_PADDING,
      Math.max(
        VIEWPORT_PADDING,
        viewportHeight - tooltipHeight - VIEWPORT_PADDING,
      ),
    ),
  };
}

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function getUtcDay(value: string) {
  const cached = ymdDayCache.get(value);
  if (cached != null) return cached;
  const day = toUtcDate(value).getUTCDay();
  ymdDayCache.set(value, day);
  return day;
}

function formatXAxisLabel(value: string, granularity: Granularity, locale: string) {
  const key = `${locale}:${granularity}:${value}`;
  const cached = xAxisLabelCache.get(key);
  if (cached) return cached;
  const date = toUtcDate(value);
  const next = granularity === "month"
    ? new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(date)
    : new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  xAxisLabelCache.set(key, next);
  return next;
}

function formatTooltipDateLabel(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const key = `${locale}:${value}`;
  const cached = tooltipLabelCache.get(key);
  if (cached) return cached;
  const date = toUtcDate(value);
  const next = {
    weekday: new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(date),
    rest: new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date),
  };
  tooltipLabelCache.set(key, next);
  return next;
}

function startOfWeekUtc(date: Date) {
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - diff);
  return start;
}

function buildCompareQueues(compareSeries: SeriesPoint[]) {
  const queues = new Map<number, SeriesPoint[]>();
  for (const point of compareSeries) {
    const day = getUtcDay(point.date);
    const queue = queues.get(day);
    if (queue) {
      queue.push(point);
    } else {
      queues.set(day, [point]);
    }
  }
  return queues;
}

function alignCompareSeries(
  primary: SeriesPoint[],
  compare: SeriesPoint[] | undefined,
  matchWeekdays: boolean,
) {
  if (!compare || compare.length === 0) return primary.map(() => null);
  if (!matchWeekdays) {
    return primary.map((_, index) => compare[index] ?? null);
  }

  const queues = buildCompareQueues(compare);
  const aligned = primary.map((point) => {
    const day = getUtcDay(point.date);
    const queue = queues.get(day);
    if (!queue || queue.length === 0) return null;
    return queue.shift() ?? null;
  });

  const allNull = aligned.every((value) => value == null);
  if (allNull) {
    return primary.map((_, index) => compare[index] ?? null);
  }
  return aligned;
}

function formatNumber(value: number, locale: string, maxDigits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

function formatInteger(value: number, locale: string) {
  return formatNumber(value, locale, 0);
}

function formatPercent(value: number, locale: string, maxDigits = 1) {
  return `${formatNumber(value * 100, locale, maxDigits)}%`;
}

function formatPercentPoints(value: number, locale: string, maxDigits = 1) {
  return `${formatNumber(value, locale, maxDigits)}pp`;
}

function formatDelta(value: number, locale: string, isPercent = false, maxDigits = 1) {
  const sign = value > 0 ? "+" : "";
  if (isPercent) {
    return `${sign}${formatNumber(value, locale, maxDigits)}%`;
  }
  return `${sign}${formatNumber(value, locale, maxDigits)}`;
}

function deltaPercent(current: number, compare: number) {
  if (compare === 0) return current === 0 ? 0 : 100;
  return ((current - compare) / compare) * 100;
}

function buildPlaceholderSeries(granularity: Granularity) {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const makePoint = (date: Date): SeriesPoint => ({
    date: date.toISOString().slice(0, 10),
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
  });

  if (granularity === "month") {
    const points: SeriesPoint[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1),
      );
      points.push(makePoint(date));
    }
    return points;
  }

  if (granularity === "week") {
    const points: SeriesPoint[] = [];
    const start = startOfWeekUtc(end);
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() - i * 7);
      points.push(makePoint(date));
    }
    return points;
  }

  const points: SeriesPoint[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - i);
    points.push(makePoint(date));
  }
  return points;
}

function toChartPoints(
  primary: SeriesPoint[],
  compareSeries: SeriesPoint[] | undefined,
  matchWeekdays: boolean,
  granularity: Granularity,
  locale: string,
) {
  const alignedCompare = alignCompareSeries(
    primary,
    compareSeries,
    matchWeekdays,
  );

  let maxPosition = 0;
  for (let i = 0; i < primary.length; i += 1) {
    const value = primary[i]?.position;
    if (typeof value === "number" && Number.isFinite(value) && value > maxPosition) {
      maxPosition = value;
    }
  }
  if (compareSeries?.length) {
    for (let i = 0; i < compareSeries.length; i += 1) {
      const value = compareSeries[i]?.position;
      if (typeof value === "number" && Number.isFinite(value) && value > maxPosition) {
        maxPosition = value;
      }
    }
  }

  const invertPosition = maxPosition > 0;
  const points: ChartPoint[] = [];

  for (let index = 0; index < primary.length; index += 1) {
    const point = primary[index];
    const compare = alignedCompare[index];
    const safeCtr = Number.isFinite(point.ctr) ? point.ctr : 0;
    const safePosition = Number.isFinite(point.position) ? point.position : 0;
    const compareCtr =
      compare && Number.isFinite(compare.ctr) ? compare.ctr : null;
    const comparePosition =
      compare && Number.isFinite(compare.position) ? compare.position : null;
    const hasImpressions = point.impressions > 0;
    const compareHasImpressions = (compare?.impressions ?? 0) > 0;
    const tooltipDate = formatTooltipDateLabel(point.date, locale);
    const compareTooltipDate = formatTooltipDateLabel(compare?.date ?? null, locale);

    points.push({
      date: point.date,
      clicks: point.clicks,
      impressions: point.impressions,
      ctr: safeCtr,
      position: safePosition,
      xLabel: formatXAxisLabel(point.date, granularity, locale),
      tooltipWeekday: tooltipDate?.weekday ?? "",
      tooltipDateLabel: tooltipDate?.rest ?? "",
      ctrPct: hasImpressions ? safeCtr * 100 : null,
      positionPlot:
        invertPosition && hasImpressions ? maxPosition - safePosition : null,
      hasData: hasImpressions,
      compareHasData: compareHasImpressions,
      compareClicks: compare?.clicks ?? null,
      compareImpressions: compare?.impressions ?? null,
      compareCtr,
      comparePosition,
      compareCtrPct:
        compareHasImpressions && compareCtr != null ? compareCtr * 100 : null,
      comparePositionPlot: compare
        ? invertPosition && compareHasImpressions
          ? maxPosition - (comparePosition ?? 0)
          : null
        : null,
      compareDate: compare?.date ?? null,
      compareTooltipWeekday: compareTooltipDate?.weekday ?? null,
      compareTooltipDateLabel: compareTooltipDate?.rest ?? null,
    });
  }

  return points;
}

const TooltipContent = memo(function TooltipContent({
  active,
  payload,
  showChangePercent,
  compareEnabled,
  locale,
  labels,
}: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  const safeNumber = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  const metrics = [
    {
      label: labels.clicks,
      current: safeNumber(point.clicks),
      compare: point.hasData ? safeNumber(point.compareClicks) : null,
      format: (value: number) => formatInteger(value, locale),
      color: "var(--metric-clicks)",
      icon: CursorClick,
      changeMode: "percent",
    },
    {
      label: labels.impressions,
      current: safeNumber(point.impressions),
      compare: point.hasData ? safeNumber(point.compareImpressions) : null,
      format: (value: number) => formatInteger(value, locale),
      color: "var(--metric-impressions)",
      icon: Eye,
      changeMode: "percent",
    },
    {
      label: labels.ctr,
      current: point.hasData ? safeNumber(point.ctr) : null,
      compare:
        point.hasData && point.compareHasData
          ? safeNumber(point.compareCtr)
          : null,
      format: (value: number) => formatPercent(value, locale, 1),
      changeFormat: (value: number) => formatPercentPoints(value, locale, 1),
      changeValue:
        point.compareCtr != null && Number.isFinite(point.ctr)
          ? (point.ctr - point.compareCtr) * 100
          : null,
      color: "var(--metric-ctr)",
      icon: Percent,
      changeMode: "pp",
    },
    {
      label: labels.position,
      current: point.hasData ? safeNumber(point.position) : null,
      compare:
        point.hasData && point.compareHasData
          ? safeNumber(point.comparePosition)
          : null,
      format: (value: number) => formatNumber(value, locale, 1),
      color: "var(--metric-position)",
      icon: Medal,
      changeMode: "percent",
      invertChangeColor: true,
    },
  ];

  const headerCols = compareEnabled
    ? "grid-cols-[1fr_auto_auto_auto]"
    : "grid-cols-[1fr_auto]";

  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 p-3 text-sm shadow-md backdrop-blur-sm">
      <div className={`grid ${headerCols} gap-x-3 gap-y-1`}>
        <div className="text-muted-foreground/90">
          <Hash className="size-3" weight="bold" />
        </div>
        <div className="text-right leading-tight">
          {point.tooltipDateLabel ? (
            <>
              <span className="block text-[0.8rem] font-semibold text-foreground">
                {point.tooltipWeekday}
              </span>
              <span className="block text-xs text-muted-foreground">
                {point.tooltipDateLabel}
              </span>
            </>
          ) : null}
        </div>
        {compareEnabled ? (
          <>
            <div className="flex items-center justify-end text-muted-foreground/90">
              <ArrowsLeftRight className="size-3" weight="bold" />
            </div>
            <div className="text-right leading-tight">
              {point.compareTooltipDateLabel ? (
                <>
                  <span className="block text-[0.8rem] font-semibold text-foreground">
                    {point.compareTooltipWeekday}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {point.compareTooltipDateLabel}
                  </span>
                </>
              ) : (
                "—"
              )}
            </div>
          </>
        ) : null}

        {metrics.map((metric) => {
          const compareValue = metric.compare;
          const currentValue = metric.current;
          const changeValue =
            metric.changeValue ??
            (compareValue != null && currentValue != null
              ? currentValue - compareValue
              : null);
          const changePercent =
            compareValue != null && currentValue != null
              ? deltaPercent(currentValue, compareValue)
              : null;
          const isPercentChange =
            showChangePercent && metric.changeMode === "percent";
          const change = isPercentChange ? changePercent : changeValue;
          const changeSign =
            metric.invertChangeColor && change != null ? -change : change;
          const changeText =
            compareEnabled && compareValue != null && change != null
                  ? metric.changeFormat
                    ? metric.changeFormat(change)
                    : isPercentChange
                  ? formatDelta(change, locale, true, 1)
                  : formatDelta(change, locale, false, 1)
              : "";
          const changeClass =
            compareEnabled && compareValue != null && changeSign != null
              ? changeSign > 0
                ? "text-emerald-500"
                : changeSign < 0
                  ? "text-rose-500"
                  : "text-muted-foreground"
              : "text-muted-foreground";
          const Icon = metric.icon;
          const TrendIcon =
            changeSign == null
              ? Minus
              : changeSign > 0
                ? TrendUp
                : changeSign < 0
                  ? TrendDown
                  : Minus;

          return (
            <div key={metric.label} className="contents">
              <div className="flex items-center gap-2 text-xs text-muted-foreground leading-tight">
                <Icon
                  className="size-3"
                  weight="bold"
                  style={{ color: metric.color }}
                />
                {metric.label}
              </div>
              <div className="text-right text-[0.82rem] font-semibold text-foreground tabular-nums leading-tight">
                {metric.current != null ? metric.format(metric.current) : "—"}
              </div>
              {compareEnabled ? (
                <>
                  <div
                    className={`flex items-center justify-end gap-1 text-right text-xs leading-tight ${changeClass}`}
                  >
                    <TrendIcon className="size-3" weight="bold" />
                    {changeText}
                  </div>
                  <div className="text-right text-xs text-muted-foreground tabular-nums leading-tight">
                    {compareValue != null ? metric.format(compareValue) : "—"}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}, areTooltipPropsEqual);

function areTooltipPropsEqual(prev: TooltipContentProps, next: TooltipContentProps) {
  if (prev.active !== next.active) return false;
  if (prev.showChangePercent !== next.showChangePercent) return false;
  if (prev.compareEnabled !== next.compareEnabled) return false;
  if (prev.locale !== next.locale) return false;
  if (prev.labels !== next.labels) return false;
  const prevPoint = prev.payload?.[0]?.payload;
  const nextPoint = next.payload?.[0]?.payload;
  return prevPoint === nextPoint;
}

const SiteCardChartInner = function SiteCardChart({
  chartId,
  series,
  compareSeries,
  granularity,
  compareSettings,
  compareEnabled,
  height = "9rem",
}: SiteCardChartProps) {
  const locale = useLocale();
  const t = useTranslations("metrics");
  const metricLabels = useMemo(
    () => ({
      clicks: t("clicks"),
      impressions: t("impressions"),
      ctr: t("ctr"),
      position: t("positionAvg"),
    }),
    [t],
  );
  const { activeId, setActiveId } = useChartTooltip();
  const prefersReducedMotion = useReducedMotion();
  const activeIdRef = useRef<string | null>(activeId);
  const [tooltipState, setTooltipState] = useState<TooltipState>({
    active: false,
  });
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const pendingAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const tooltipPositionRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTooltipIndexRef = useRef<number | null>(null);
  const activePointRef = useRef<ChartPoint | null>(null);
  const isTooltipActiveRef = useRef(false);
  const tooltipSizeRef = useRef({
    width: 360,
    height: 200,
  });

  const updateTooltipPosition = useCallback((anchor: { x: number; y: number }) => {
    if (typeof window === "undefined") return;
    const next = computeTooltipPosition({
      anchorX: anchor.x,
      anchorY: anchor.y,
      tooltipWidth: tooltipSizeRef.current.width,
      tooltipHeight: tooltipSizeRef.current.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    const prev = tooltipPositionRef.current;
    if (
      prev &&
      Math.abs(prev.x - next.x) < POSITION_EPSILON_PX &&
      Math.abs(prev.y - next.y) < POSITION_EPSILON_PX
    ) {
      return;
    }
    tooltipPositionRef.current = next;
    setTooltipPosition(next);
  }, []);

  const flushTooltipPosition = useCallback(() => {
    rafRef.current = null;
    const anchor = pendingAnchorRef.current;
    if (!anchor) return;
    updateTooltipPosition(anchor);
  }, [updateTooltipPosition]);

  const queueTooltipPositionUpdate = useCallback(
    (anchor: { x: number; y: number }) => {
      if (typeof window === "undefined") return;
      pendingAnchorRef.current = anchor;
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(flushTooltipPosition);
    },
    [flushTooltipPosition],
  );

  const aggregated = useMemo(() => {
    return series.length ? series : buildPlaceholderSeries(granularity);
  }, [series, granularity]);

  const chartData = useMemo(
    () =>
      toChartPoints(
        aggregated,
        compareEnabled ? compareSeries : undefined,
        compareSettings.matchWeekdays,
        granularity,
        locale,
      ),
    [
      aggregated,
      compareEnabled,
      compareSeries,
      compareSettings.matchWeekdays,
      granularity,
      locale,
    ],
  );

  const hideTooltip = useCallback(() => {
    if (rafRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    isTooltipActiveRef.current = false;
    lastTooltipIndexRef.current = null;
    activePointRef.current = null;
    tooltipAnchorRef.current = null;
    pendingAnchorRef.current = null;
    tooltipPositionRef.current = null;
    setTooltipState((prev) => (prev.active ? { active: false } : prev));
    setTooltipPosition(null);
    if (activeIdRef.current === chartId) {
      activeIdRef.current = null;
      setActiveId(null);
    }
  }, [chartId, setActiveId]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (activeIdRef.current === chartId) {
        setActiveId(null);
      }
    };
  }, [chartId, setActiveId]);

  useEffect(() => {
    if (!tooltipState.active) return;

    const handleScrollLikeEvent = () => {
      if (!tooltipState.active || !chartWrapRef.current) return;
      const pointer = pointerRef.current;
      if (!pointer) return;
      const rect = chartWrapRef.current.getBoundingClientRect();
      const isInside =
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom;
      if (!isInside) {
        hideTooltip();
      }
    };

    window.addEventListener("scroll", handleScrollLikeEvent, {
      capture: true,
      passive: true,
    });
    window.addEventListener("wheel", handleScrollLikeEvent, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchmove", handleScrollLikeEvent, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScrollLikeEvent, true);
      window.removeEventListener("wheel", handleScrollLikeEvent, true);
      window.removeEventListener("touchmove", handleScrollLikeEvent, true);
    };
  }, [hideTooltip, tooltipState.active]);

  useEffect(() => {
    if (!tooltipState.active || !tooltipRef.current) return;

    const element = tooltipRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);
      const prev = tooltipSizeRef.current;
      if (prev.width === nextWidth && prev.height === nextHeight) return;
      tooltipSizeRef.current = { width: nextWidth, height: nextHeight };
      if (tooltipAnchorRef.current) {
        queueTooltipPositionUpdate(tooltipAnchorRef.current);
      }
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [queueTooltipPositionUpdate, tooltipState.active]);

  return (
    <div
      ref={chartWrapRef}
      className="relative z-30 mt-4 w-full pb-4"
      onPointerMove={(event) => {
        pointerRef.current = { x: event.clientX, y: event.clientY };
      }}
      onMouseLeave={hideTooltip}
    >
      <div className="w-full" style={{ height, minHeight: height }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minHeight={144}
          minWidth={240}
        >
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 4 }}
            onMouseMove={(state: ChartHoverState) => {
              const coordX =
                state?.activeCoordinate?.x ??
                (Number.isFinite(state?.chartX) ? state?.chartX : undefined);
              const coordY =
                state?.activeCoordinate?.y ??
                (Number.isFinite(state?.chartY) ? state?.chartY : undefined);

              if (
                chartWrapRef.current &&
                typeof coordX === "number" &&
                typeof coordY === "number"
              ) {
                const rect = chartWrapRef.current.getBoundingClientRect();
                const anchor = {
                  x: rect.left + coordX,
                  y: rect.top + coordY,
                };
                const prevAnchor = tooltipAnchorRef.current;
                if (
                  !prevAnchor ||
                  Math.abs(prevAnchor.x - anchor.x) >= TOOLTIP_ANCHOR_THRESHOLD_PX ||
                  Math.abs(prevAnchor.y - anchor.y) >= TOOLTIP_ANCHOR_THRESHOLD_PX
                ) {
                  tooltipAnchorRef.current = anchor;
                  queueTooltipPositionUpdate(anchor);
                }
              }

              const index = Number(state?.activeTooltipIndex);
              if (Number.isFinite(index) && chartData[index]) {
                if (activeIdRef.current !== chartId) {
                  activeIdRef.current = chartId;
                  setActiveId(chartId);
                }
                if (!isTooltipActiveRef.current || lastTooltipIndexRef.current !== index) {
                  const point = chartData[index];
                  isTooltipActiveRef.current = true;
                  lastTooltipIndexRef.current = index;
                  activePointRef.current = point;
                  setTooltipState({
                    active: true,
                    payload: [{ payload: point }],
                  });
                }
                return;
              }

              if (
                state?.isTooltipActive &&
                Array.isArray(state?.activePayload) &&
                state.activePayload.length > 0
              ) {
                const nextPoint = state.activePayload[0]?.payload;
                if (nextPoint && activePointRef.current !== nextPoint) {
                  activePointRef.current = nextPoint;
                  isTooltipActiveRef.current = true;
                  lastTooltipIndexRef.current = null;
                  setTooltipState({
                    active: true,
                    payload: state.activePayload as Array<{ payload: ChartPoint }>,
                  });
                }
                if (activeIdRef.current !== chartId) {
                  activeIdRef.current = chartId;
                  setActiveId(chartId);
                }
                return;
              }

              if (isTooltipActiveRef.current) {
                hideTooltip();
              }
            }}
            onMouseLeave={hideTooltip}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeOpacity={0.35}
            />
            <XAxis
              dataKey="xLabel"
              padding={{ left: 8, right: 8 }}
              tickMargin={6}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
              tick={{
                fill: "var(--muted-foreground)",
                fontSize: 10,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
              }}
            />
            <YAxis
              yAxisId="left"
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              width={36}
              tickCount={3}
              tick={{
                fill: "var(--muted-foreground)",
                fontSize: 10,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
              }}
            />
            <YAxis
              yAxisId="right"
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              width={36}
              orientation="right"
              tickCount={3}
              tick={{
                fill: "var(--muted-foreground)",
                fontSize: 10,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
              }}
            />
            <Tooltip
              cursor={false}
              content={() => null}
              wrapperStyle={{ display: "none" }}
            />
            {PRIMARY_METRICS.map((metric) => (
              <Line
                key={metric.key}
                yAxisId={metric.axis}
                type="linear"
                dataKey={metric.key}
                stroke={metric.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {compareEnabled &&
            compareSettings.showPreviousTrend &&
            compareSeries?.length ? (
              <>
                {COMPARE_METRICS.map((metric) => (
                  <Line
                    key={metric.key}
                    yAxisId={metric.axis}
                    type="linear"
                    dataKey={metric.key}
                    stroke={metric.color}
                    strokeOpacity={0.7}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </>
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {tooltipState.active && tooltipPosition && activeId === chartId ? (
                <motion.div
                  key={`${chartId}-tooltip`}
                  ref={tooltipRef}
                  className="pointer-events-none fixed z-[2147483647]"
                  style={{
                    left: tooltipPosition.x,
                    top: tooltipPosition.y,
                  }}
                  initial={{ opacity: 0, scale: 0.96, y: 4 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    transition: {
                      duration: prefersReducedMotion ? 0.08 : 0.14,
                      ease: "easeOut",
                    },
                  }}
                  exit={{
                    opacity: 0,
                    scale: prefersReducedMotion ? 1 : 0.98,
                    y: prefersReducedMotion ? 0 : 2,
                    transition: { duration: prefersReducedMotion ? 0.08 : 0.12 },
                  }}
                >
                  <TooltipContent
                    active={tooltipState.active}
                    payload={tooltipState.payload}
                    showChangePercent={compareSettings.showChangePercent}
                    compareEnabled={compareEnabled}
                    locale={locale}
                    labels={metricLabels}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
};

function areChartPropsEqual(prev: SiteCardChartProps, next: SiteCardChartProps) {
  return (
    prev.chartId === next.chartId &&
    prev.series === next.series &&
    prev.compareSeries === next.compareSeries &&
    prev.granularity === next.granularity &&
    prev.compareEnabled === next.compareEnabled &&
    prev.height === next.height &&
    prev.compareSettings.showPreviousTrend ===
      next.compareSettings.showPreviousTrend &&
    prev.compareSettings.matchWeekdays === next.compareSettings.matchWeekdays &&
    prev.compareSettings.showChangePercent ===
      next.compareSettings.showChangePercent
  );
}

export const SiteCardChart = memo(SiteCardChartInner, areChartPropsEqual);

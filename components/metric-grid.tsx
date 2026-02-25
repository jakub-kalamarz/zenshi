import { metricConfig } from "@/lib/metrics";
import { CaretDown, CaretUp, Infinity, Minus } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";

type MetricValue = number | null | undefined;

type MetricGridProps = {
  clicks?: MetricValue;
  impressions?: MetricValue;
  ctr?: MetricValue;
  position?: MetricValue;
  compareClicks?: MetricValue;
  compareImpressions?: MetricValue;
  compareCtr?: MetricValue;
  comparePosition?: MetricValue;
  variant?: "default" | "card";
};

function formatNumber(value: MetricValue, locale: string) {
  if (value == null || Number.isNaN(value)) return "—";
  return Intl.NumberFormat(locale).format(value);
}

function formatPercent(value: MetricValue, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatPosition(value: MetricValue, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatDelta(
  current: MetricValue,
  prev: MetricValue,
  isPosition = false,
  digits = 0,
) {
  if (
    current == null ||
    prev == null ||
    Number.isNaN(current) ||
    Number.isNaN(prev)
  ) {
    return null;
  }
  const delta = current - prev;
  if (delta === 0)
    return {
      label: digits === 0 ? "0%" : `0.${"0".repeat(digits)}%`,
      trend: "flat" as const,
      isInfinite: false,
    };
  if (prev === 0) {
    return {
      label: "",
      trend: delta > 0 ? ("up" as const) : ("down" as const),
      isInfinite: true,
    };
  }
  const percent = Math.abs((delta / prev) * 100);
  const label = Number.isNaN(percent) ? "—" : `${percent.toFixed(digits)}%`;
  const positive = isPosition ? delta < 0 : delta > 0;
  return {
    label,
    trend: positive ? ("up" as const) : ("down" as const),
    isInfinite: false,
  };
}

export function MetricGrid({
  clicks,
  impressions,
  ctr,
  position,
  compareClicks,
  compareImpressions,
  compareCtr,
  comparePosition,
  variant = "default",
}: MetricGridProps) {
  const locale = useLocale();
  const t = useTranslations("metrics");
  const digits = 0;
  const isEmpty =
    clicks == null &&
    impressions == null &&
    (ctr == null || ctr === 0) &&
    (position == null || position === 0);
  const safeClicks = isEmpty ? null : clicks;
  const safeImpressions = isEmpty ? null : impressions;
  const safeCtr = isEmpty ? null : ctr;
  const safePosition = isEmpty ? null : position;
  const safeCompareClicks = isEmpty ? null : compareClicks;
  const safeCompareImpressions = isEmpty ? null : compareImpressions;
  const safeCompareCtr = isEmpty ? null : compareCtr;
  const safeComparePosition = isEmpty ? null : comparePosition;
  const metrics = [
    {
      key: "clicks",
      value: formatNumber(safeClicks, locale),
      delta: formatDelta(safeClicks, safeCompareClicks, false, digits),
    },
    {
      key: "impressions",
      value: formatNumber(safeImpressions, locale),
      delta: formatDelta(
        safeImpressions,
        safeCompareImpressions,
        false,
        digits,
      ),
    },
    {
      key: "ctr",
      value: formatPercent(safeCtr, digits),
      delta: formatDelta(safeCtr, safeCompareCtr, false, digits),
    },
    {
      key: "position",
      value: formatPosition(safePosition, digits),
      delta: formatDelta(safePosition, safeComparePosition, true, digits),
    },
  ] as const;

  return (
    <div
      className={
        variant === "card"
          ? "grid grid-cols-2 gap-x-2 gap-y-1"
          : "grid grid-cols-2 gap-3 lg:grid-cols-4"
      }
    >
      {metrics.map((metric) => {
        const config = metricConfig[metric.key];
        const Icon = config.Icon;
        const metricLabel = t(metric.key);
        const metricLabelUpper = metricLabel.toLocaleUpperCase(locale);
        const delta = metric.delta;
        const deltaClasses =
          delta?.trend === "up"
            ? "text-emerald-500"
            : delta?.trend === "down"
              ? "text-rose-500"
              : "text-muted-foreground";
        const DeltaIcon =
          delta?.trend === "up"
            ? CaretUp
            : delta?.trend === "down"
              ? CaretDown
              : Minus;
        if (variant === "card") {
          return (
            <div
              key={metric.key}
              className="flex items-center gap-0.5 rounded-md px-1"
            >
              <div className="flex items-center gap-0.5">
                <Icon className={`size-4 ${config.className}`} />
                <div className="text-xs font-medium">{metric.value}</div>
              </div>
              {delta ? (
                <div
                  className={`flex items-center gap-1 text-xs font-medium ${deltaClasses}`}
                >
                  <DeltaIcon className="size-3" weight="bold" />
                  {delta.isInfinite ? (
                    <Infinity className="size-3" weight="bold" />
                  ) : (
                    <span>{delta.label}</span>
                  )}
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <div
            key={metric.key}
            className="flex items-center gap-3 rounded-md px-1"
          >
            <div
              className={`flex size-10 items-center justify-center rounded-lg bg-muted ${config.className}`}
            >
              <Icon className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {metricLabelUpper}
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-semibold">{metric.value}</div>
                {delta ? (
                  <div
                    className={`flex items-center gap-0.5 text-xs font-medium ${deltaClasses}`}
                  >
                    <DeltaIcon className="size-3" weight="bold" />
                    {delta.isInfinite ? (
                      <Infinity className="size-3" weight="bold" />
                    ) : (
                      <span>{delta.label}</span>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

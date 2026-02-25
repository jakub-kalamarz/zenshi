import {
  CursorClick,
  Eye,
  TrendUp,
  Target,
} from "@phosphor-icons/react";

export const metricConfig = {
  clicks: {
    label: "Clicks",
    Icon: CursorClick,
    className: "text-metric-clicks",
  },
  impressions: {
    label: "Impressions",
    Icon: Eye,
    className: "text-metric-impressions",
  },
  ctr: {
    label: "CTR",
    Icon: TrendUp,
    className: "text-metric-ctr",
  },
  position: {
    label: "Position",
    Icon: Target,
    className: "text-metric-position",
  },
} as const;

export type MetricKey = keyof typeof metricConfig;

"use client";

import { memo } from "react";
import { DomainBadge } from "@/components/domain-badge";
import { MetricGrid } from "@/components/metric-grid";
import { SiteCardChart } from "@/components/site-card-chart";
import { cn } from "@/lib/utils";

export type Site = {
  id: string;
  gsc_site_url: string;
  enabled: number;
  created_at: string;
  folder_id?: string | null;
  folder_name?: string | null;
};

export type Summary = {
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
};

export type SeriesPoint = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SiteCardData = {
  total: Summary | null;
  series: SeriesPoint[];
  compareTotal?: Summary | null;
  compareSeries?: SeriesPoint[];
  requestedRange?: { start: string; end: string } | null;
  servedRange?: { start: string; end: string } | null;
  effectiveRange?: { start: string; end: string } | null;
  lastAvailable?: string | null;
  granularity?: "day" | "week" | "month";
  allowedGranularities?: Array<"day" | "week" | "month">;
  retention?: {
    start: string;
    end: string;
    partiallyOutside: boolean;
  };
};

type SiteCardProps = {
  site: Site;
  card: SiteCardData | undefined;
  granularity?: "day" | "week" | "month";
  compareSettings?: {
    showPreviousTrend: boolean;
    matchWeekdays: boolean;
    showChangePercent: boolean;
  };
  compareEnabled?: boolean;
  linkToSite?: boolean;
  onClick?: () => void;
  className?: string;
};

const SiteCardInner = function SiteCard({
  site,
  card,
  granularity = "day",
  compareSettings = {
    showPreviousTrend: false,
    matchWeekdays: false,
    showChangePercent: false,
  },
  compareEnabled = false,
  linkToSite = true,
  onClick,
  className,
}: SiteCardProps) {
  const hasSeries = (card?.series?.length ?? 0) > 0;
  const showZeroTotals = !hasSeries && card?.total == null;
  const total = showZeroTotals
    ? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    : card?.total;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative z-0 flex w-full flex-col hover:z-40 focus-within:z-40",
        onClick && "cursor-pointer transition-opacity hover:opacity-80",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <DomainBadge
          siteUrl={site.gsc_site_url}
          siteId={linkToSite ? site.id : undefined}
          size={18}
        />
        <MetricGrid
          variant="card"
          clicks={total?.clicks}
          impressions={total?.impressions}
          ctr={total?.ctr}
          position={total?.position}
          compareClicks={card?.compareTotal?.clicks}
          compareImpressions={card?.compareTotal?.impressions}
          compareCtr={card?.compareTotal?.ctr}
          comparePosition={card?.compareTotal?.position}
        />
      </div>
      <SiteCardChart
        chartId={site.id}
        series={card?.series ?? []}
        compareSeries={card?.compareSeries}
        granularity={granularity}
        compareSettings={compareSettings}
        compareEnabled={compareEnabled}
      />
    </div>
  );
};

function areSiteCardPropsEqual(prev: SiteCardProps, next: SiteCardProps) {
  return (
    prev.site === next.site &&
    prev.card === next.card &&
    prev.granularity === next.granularity &&
    prev.compareEnabled === next.compareEnabled &&
    prev.linkToSite === next.linkToSite &&
    prev.onClick === next.onClick &&
    prev.className === next.className &&
    prev.compareSettings?.showPreviousTrend ===
      next.compareSettings?.showPreviousTrend &&
    prev.compareSettings?.matchWeekdays ===
      next.compareSettings?.matchWeekdays &&
    prev.compareSettings?.showChangePercent ===
      next.compareSettings?.showChangePercent
  );
}

export const SiteCard = memo(SiteCardInner, areSiteCardPropsEqual);

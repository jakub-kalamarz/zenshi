"use client";

import { FolderOpen } from "@phosphor-icons/react";
import { MetricGrid } from "@/components/metric-grid";
import { SiteCardChart } from "@/components/site-card-chart";
import { FolderGlyph } from "@/components/gsc/folder-glyph";
import type { SiteCardData } from "@/components/site-card";
import type { Granularity } from "@/components/gsc/types";

type FolderMasterCardProps = {
  label: string;
  icon?: { id: string; color: string } | null;
  card: SiteCardData | null;
  granularity: Granularity;
  compareSettings: {
    showPreviousTrend: boolean;
    matchWeekdays: boolean;
    showChangePercent: boolean;
  };
  compareEnabled: boolean;
  chartId: string;
};

export function FolderMasterCard({
  label,
  icon = null,
  card,
  granularity,
  compareSettings,
  compareEnabled,
  chartId,
}: FolderMasterCardProps) {
  const hasSeries = (card?.series?.length ?? 0) > 0;
  const showZeroTotals = !hasSeries && card?.total == null;
  const total = showZeroTotals
    ? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    : card?.total;

  return (
    <div className="group relative z-0 flex w-full flex-col hover:z-40 focus-within:z-40">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="inline-flex min-w-0 items-center gap-2">
          {icon ? (
            <span
              className="inline-flex size-7 items-center justify-center rounded-md"
              style={{ backgroundColor: `${icon.color}22` }}
            >
              <FolderGlyph iconId={icon.id} className="size-4" color={icon.color} />
            </span>
          ) : (
            <span
              className="inline-flex size-7 items-center justify-center rounded-md"
              style={{ backgroundColor: "#6b728022" }}
            >
              <FolderOpen className="size-4 text-muted-foreground" />
            </span>
          )}
          <span className="truncate text-[0.93rem] font-medium leading-tight tracking-[-0.01em] text-foreground">
            {label}
          </span>
        </div>
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
        chartId={chartId}
        series={card?.series ?? []}
        compareSeries={card?.compareSeries}
        granularity={granularity}
        compareSettings={compareSettings}
        compareEnabled={compareEnabled}
      />
    </div>
  );
}

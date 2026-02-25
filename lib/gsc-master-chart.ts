import type { SiteCardData, Summary } from "@/components/site-card";
import type { Granularity } from "@/components/gsc/types";

type DateRange = { start: string; end: string };

type AggregateTotals = {
  clicks: number;
  impressions: number;
  positionWeightedSum: number;
  hasMetrics: boolean;
};

type BucketAggregate = {
  date: string;
  clicks: number;
  impressions: number;
  positionWeightedSum: number;
};

function mergeTotals(target: AggregateTotals, source: Summary | null | undefined) {
  if (!source) return;
  const clicks = Number(source.clicks ?? 0);
  const impressions = Number(source.impressions ?? 0);
  const position = Number(source.position ?? 0);

  target.clicks += clicks;
  target.impressions += impressions;
  target.positionWeightedSum += position * impressions;
  target.hasMetrics = true;
}

function finalizeTotals(totals: AggregateTotals): Summary {
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const position =
    totals.impressions > 0 ? totals.positionWeightedSum / totals.impressions : 0;

  return {
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr,
    position,
  };
}

function aggregateSeries(
  cards: SiteCardData[],
  mode: "primary" | "compare",
): SiteCardData["series"] | undefined {
  const byBucket = new Map<string, BucketAggregate>();
  let hasAnySeries = false;

  for (const card of cards) {
    const source = mode === "primary" ? card.series : card.compareSeries ?? [];
    if (source.length === 0) continue;
    hasAnySeries = true;

    for (const point of source) {
      const current = byBucket.get(point.date) ?? {
        date: point.date,
        clicks: 0,
        impressions: 0,
        positionWeightedSum: 0,
      };
      current.clicks += Number(point.clicks ?? 0);
      current.impressions += Number(point.impressions ?? 0);
      current.positionWeightedSum +=
        Number(point.position ?? 0) * Number(point.impressions ?? 0);
      byBucket.set(point.date, current);
    }
  }

  if (!hasAnySeries) {
    return mode === "primary" ? [] : undefined;
  }

  return Array.from(byBucket.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      position:
        row.impressions > 0 ? row.positionWeightedSum / row.impressions : 0,
    }));
}

function sameRange(a: DateRange, b: DateRange) {
  return a.start === b.start && a.end === b.end;
}

function mergeRequestedRange(cards: SiteCardData[]): DateRange | null {
  const ranges = cards.map((card) => card.requestedRange).filter(Boolean) as DateRange[];
  if (ranges.length !== cards.length || ranges.length === 0) return null;
  return ranges.every((range) => sameRange(range, ranges[0])) ? ranges[0] : null;
}

function mergeServedRange(cards: SiteCardData[]): DateRange | null {
  const ranges = cards
    .map((card) => card.servedRange ?? card.effectiveRange)
    .filter(Boolean) as DateRange[];
  if (ranges.length === 0) return null;

  const start = ranges.reduce((max, range) => (range.start > max ? range.start : max), ranges[0].start);
  const end = ranges.reduce((min, range) => (range.end < min ? range.end : min), ranges[0].end);
  if (start > end) return null;
  return { start, end };
}

function mergeAllowedGranularities(cards: SiteCardData[]): Granularity[] | undefined {
  const source = cards
    .map((card) => card.allowedGranularities)
    .filter((value): value is Granularity[] => Array.isArray(value) && value.length > 0);
  if (source.length === 0) return undefined;

  const intersection = source.reduce<Granularity[]>((current, next) => {
    const set = new Set(next);
    return current.filter((item) => set.has(item));
  }, [...source[0]]);

  return intersection.length > 0 ? intersection : undefined;
}

export function aggregateGroupCard(
  siteIds: string[],
  cards: Record<string, SiteCardData>,
): SiteCardData | null {
  const availableCards = siteIds
    .map((siteId) => cards[siteId])
    .filter((card): card is SiteCardData => Boolean(card));

  if (availableCards.length === 0) return null;

  const primaryTotals: AggregateTotals = {
    clicks: 0,
    impressions: 0,
    positionWeightedSum: 0,
    hasMetrics: false,
  };
  const compareTotals: AggregateTotals = {
    clicks: 0,
    impressions: 0,
    positionWeightedSum: 0,
    hasMetrics: false,
  };

  let hasAnyCompare = false;
  let lastAvailable: string | null = null;
  let partiallyOutside = false;
  let retentionStart: string | null = null;
  let retentionEnd: string | null = null;

  for (const card of availableCards) {
    mergeTotals(primaryTotals, card.total);

    if (card.compareTotal || (card.compareSeries?.length ?? 0) > 0) {
      hasAnyCompare = true;
      mergeTotals(compareTotals, card.compareTotal);
    }

    if (typeof card.lastAvailable === "string") {
      if (!lastAvailable || card.lastAvailable > lastAvailable) {
        lastAvailable = card.lastAvailable;
      }
    }

    if (card.retention) {
      partiallyOutside = partiallyOutside || card.retention.partiallyOutside;
      if (
        retentionStart == null ||
        card.retention.start.localeCompare(retentionStart) < 0
      ) {
        retentionStart = card.retention.start;
      }
      if (
        retentionEnd == null ||
        card.retention.end.localeCompare(retentionEnd) > 0
      ) {
        retentionEnd = card.retention.end;
      }
    }
  }

  const series = aggregateSeries(availableCards, "primary") ?? [];
  const compareSeries = aggregateSeries(availableCards, "compare");

  return {
    total: finalizeTotals(primaryTotals),
    series,
    compareTotal: hasAnyCompare ? finalizeTotals(compareTotals) : null,
    compareSeries: hasAnyCompare ? compareSeries ?? [] : undefined,
    requestedRange: mergeRequestedRange(availableCards),
    servedRange: mergeServedRange(availableCards),
    effectiveRange: null,
    lastAvailable,
    granularity: availableCards[0].granularity,
    allowedGranularities: mergeAllowedGranularities(availableCards),
    retention:
      retentionStart && retentionEnd
        ? {
          start: retentionStart,
          end: retentionEnd,
          partiallyOutside,
        }
        : undefined,
  };
}

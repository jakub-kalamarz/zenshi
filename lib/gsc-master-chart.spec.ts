import assert from "node:assert/strict";
import type { SiteCardData } from "../components/site-card";
import { aggregateGroupCard } from "./gsc-master-chart";

const cardA: SiteCardData = {
  total: { clicks: 10, impressions: 100, ctr: 0.1, position: 2 },
  compareTotal: { clicks: 5, impressions: 50, ctr: 0.1, position: 4 },
  series: [
    { date: "2026-01-01", clicks: 4, impressions: 40, ctr: 0.1, position: 3 },
    { date: "2026-01-02", clicks: 6, impressions: 60, ctr: 0.1, position: 1 },
  ],
  compareSeries: [
    { date: "2025-12-01", clicks: 5, impressions: 50, ctr: 0.1, position: 4 },
  ],
  requestedRange: { start: "2026-01-01", end: "2026-01-02" },
  servedRange: { start: "2026-01-01", end: "2026-01-02" },
  granularity: "day",
  allowedGranularities: ["day", "week"],
  retention: { start: "2024-09-01", end: "2026-01-31", partiallyOutside: false },
};

const cardB: SiteCardData = {
  total: { clicks: 20, impressions: 200, ctr: 0.1, position: 8 },
  compareTotal: { clicks: 7, impressions: 70, ctr: 0.1, position: 10 },
  series: [
    { date: "2026-01-01", clicks: 20, impressions: 200, ctr: 0.1, position: 8 },
  ],
  compareSeries: [
    { date: "2025-12-02", clicks: 7, impressions: 70, ctr: 0.1, position: 10 },
  ],
  requestedRange: { start: "2026-01-01", end: "2026-01-02" },
  servedRange: { start: "2026-01-01", end: "2026-01-01" },
  granularity: "day",
  allowedGranularities: ["day"],
  retention: { start: "2024-09-01", end: "2026-01-31", partiallyOutside: true },
};

const cardNoData: SiteCardData = {
  total: null,
  series: [],
};

const merged = aggregateGroupCard(["a", "b", "missing"], {
  a: cardA,
  b: cardB,
});

assert.ok(merged);
assert.equal(merged.total?.clicks, 30);
assert.equal(merged.total?.impressions, 300);
assert.equal(merged.total?.ctr, 0.1);
assert.ok(merged.total?.position != null);
assert.equal(Number(merged.total.position.toFixed(2)), 6.0);

assert.equal(merged.compareTotal?.clicks, 12);
assert.equal(merged.compareTotal?.impressions, 120);
assert.equal(merged.compareTotal?.ctr, 0.1);
assert.ok(merged.compareTotal?.position != null);
assert.equal(Number(merged.compareTotal.position.toFixed(2)), 7.5);

assert.equal(merged.series.length, 2);
assert.equal(merged.series[0].date, "2026-01-01");
assert.equal(merged.series[0].clicks, 24);
assert.equal(merged.series[0].impressions, 240);
assert.equal(Number(merged.series[0].position.toFixed(2)), 7.17);
assert.equal(merged.series[1].date, "2026-01-02");
assert.equal(merged.series[1].clicks, 6);

assert.equal(merged.compareSeries?.length, 2);
assert.equal(merged.compareSeries?.[0].date, "2025-12-01");
assert.equal(merged.compareSeries?.[1].date, "2025-12-02");

assert.deepEqual(merged.requestedRange, { start: "2026-01-01", end: "2026-01-02" });
assert.deepEqual(merged.servedRange, { start: "2026-01-01", end: "2026-01-01" });
assert.deepEqual(merged.allowedGranularities, ["day"]);
assert.equal(merged.retention?.partiallyOutside, true);

const mergedWithNoData = aggregateGroupCard(["a", "c"], {
  a: cardA,
  c: cardNoData,
});
assert.ok(mergedWithNoData);
assert.equal(mergedWithNoData.total?.clicks, 10);
assert.equal(mergedWithNoData.total?.impressions, 100);

const noCards = aggregateGroupCard(["missing"], {});
assert.equal(noCards, null);

console.log("gsc-master-chart spec passed");

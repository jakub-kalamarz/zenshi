import assert from "node:assert/strict";
import {
  clampGranularity,
  getAllowedGranularities,
} from "./gsc-granularity";

assert.deepEqual(getAllowedGranularities("2026-01-01", "2026-01-13"), ["day"]);
assert.deepEqual(getAllowedGranularities("2026-01-01", "2026-01-14"), [
  "day",
  "week",
]);
assert.deepEqual(getAllowedGranularities("2026-01-01", "2026-02-28"), [
  "day",
  "week",
]);
assert.deepEqual(getAllowedGranularities("2026-01-01", "2026-03-01"), [
  "day",
  "week",
  "month",
]);

assert.equal(
  clampGranularity("month", "2026-01-01", "2026-01-20"),
  "week",
);
assert.equal(clampGranularity("week", "2026-01-01", "2026-01-10"), "day");

console.log("gsc-granularity spec passed");

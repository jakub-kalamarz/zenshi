import type { DateRange, CompareMode, RangePresetId } from "./types";
import { RANGE_PRESETS } from "./types";

export function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function utcToday() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function utcYesterday() {
  const date = utcToday();
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

export function rangeFromDays(days: number): DateRange {
  const end = utcYesterday();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: toYmd(start), end: toYmd(end) };
}

export function startOfWeekUtc(date: Date, weekStart = 1) {
  const day = date.getUTCDay();
  const diff = (day - weekStart + 7) % 7;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - diff);
  return start;
}

export function rangeLastWeek(): DateRange {
  const today = utcToday();
  const thisWeekStart = startOfWeekUtc(today);
  const end = new Date(thisWeekStart);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: toYmd(start), end: toYmd(end) };
}

export function rangeThisMonth(): DateRange {
  const end = utcYesterday();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { start: toYmd(start), end: toYmd(end) };
}

export function rangeLastMonth(): DateRange {
  const today = utcToday();
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
  );
  const end = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0),
  );
  return { start: toYmd(start), end: toYmd(end) };
}

export function rangeThisQuarter(): DateRange {
  const end = utcYesterday();
  const startMonth = Math.floor(end.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(end.getUTCFullYear(), startMonth, 1));
  return { start: toYmd(start), end: toYmd(end) };
}

export function rangeLastQuarter(): DateRange {
  const today = utcToday();
  const thisQuarterStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), thisQuarterStartMonth - 3, 1),
  );
  const end = new Date(
    Date.UTC(today.getUTCFullYear(), thisQuarterStartMonth, 0),
  );
  return { start: toYmd(start), end: toYmd(end) };
}

export function rangeYearToDate(): DateRange {
  const end = utcYesterday();
  const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  return { start: toYmd(start), end: toYmd(end) };
}

export function rangeFromMonths(months: number): DateRange {
  const end = utcYesterday();
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);
  start.setUTCDate(start.getUTCDate() + 1);
  return { start: toYmd(start), end: toYmd(end) };
}

export function rangeYearOverYear(range: DateRange): DateRange {
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  end.setUTCFullYear(end.getUTCFullYear() - 1);
  return { start: toYmd(start), end: toYmd(end) };
}

export function previousRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const lengthDays =
    Math.round((endDate.getTime() - startDate.getTime()) / dayMs) + 1;
  const prevEnd = new Date(startDate.getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - (lengthDays - 1) * dayMs);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(prevStart), end: fmt(prevEnd) };
}

export function ymdToUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function defaultDateRange() {
  return rangeFromDays(28);
}

export function matchPreset(range: DateRange): RangePresetId {
  const startDate = new Date(`${range.start}T00:00:00Z`);
  const endDate = new Date(`${range.end}T00:00:00Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "custom";
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const rangeLengthDays =
    Math.round((endDate.getTime() - startDate.getTime()) / dayMs) + 1;

  for (const preset of RANGE_PRESETS) {
    if (rangeLengthDays === preset.days) {
      return preset.id;
    }
  }
  return "custom";
}

export function compareLabel(mode: CompareMode) {
  switch (mode) {
    case "previous":
      return "Previous period";
    case "yoy":
      return "Year over year";
    case "custom":
      return "Custom";
    default:
      return "Disabled";
  }
}

export function displaySiteName(raw: string) {
  try {
    const url = new URL(raw);
    return url.hostname;
  } catch {
    return raw;
  }
}

import { computeEffectiveRange } from "./effective-range"
import type { Granularity } from "./gsc-granularity"

export type { Granularity } from "./gsc-granularity"

export const GSC_RETENTION_MONTHS = 16

export function parseGranularity(value: string | null | undefined): Granularity {
  if (value === "week" || value === "month") return value
  return "day"
}

export function getYesterdayUtcYmd() {
  const now = new Date()
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  utc.setUTCDate(utc.getUTCDate() - 1)
  return toYmd(utc)
}

export function getRetentionBounds(referenceEnd = getYesterdayUtcYmd()) {
  return {
    retentionStart: subtractMonths(referenceEnd, GSC_RETENTION_MONTHS),
    retentionEnd: referenceEnd,
  }
}

export function computeServedRange(start: string, end: string, lastDateValue: string | null) {
  return computeEffectiveRange(start, end, lastDateValue)
}

export function getBucketStart(value: string, granularity: Granularity) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value

  if (granularity === "day") return toYmd(date)
  if (granularity === "month") {
    return toYmd(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
  }

  const day = date.getUTCDay()
  const diff = (day + 6) % 7
  const monday = new Date(date)
  monday.setUTCDate(monday.getUTCDate() - diff)
  return toYmd(monday)
}

export function buildBucketExpression(column: string, granularity: Granularity) {
  if (granularity === "month") return `date(${column}, 'start of month')`
  if (granularity === "week") {
    return `date(${column}, '-' || ((CAST(strftime('%w', ${column}) AS integer) + 6) % 7) || ' days')`
  }
  return column
}

export function fillSeriesGaps(
  rows: Array<Record<string, unknown>>,
  start: string,
  end: string,
  granularity: Granularity,
) {
  const byBucket = new Map<string, Record<string, number | string>>()
  for (const row of rows) {
    const key = String(row.bucket ?? row.date ?? "")
    if (!key) continue
    byBucket.set(key, {
      date: key,
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0),
    })
  }

  const startBucket = getBucketStart(start, granularity)
  const endBucket = getBucketStart(end, granularity)

  const startDate = new Date(`${startBucket}T00:00:00Z`)
  const endDate = new Date(`${endBucket}T00:00:00Z`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return rows
  }

  const output: Array<Record<string, number | string>> = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    const key = toYmd(cursor)
    output.push(
      byBucket.get(key) ?? {
        date: key,
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
    )

    if (granularity === "month") {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    } else if (granularity === "week") {
      cursor.setUTCDate(cursor.getUTCDate() + 7)
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }

  return output
}

function toYmd(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0")
  const day = `${date.getUTCDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function subtractMonths(date: string, months: number) {
  const value = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(value.getTime())) return date
  value.setUTCMonth(value.getUTCMonth() - months)
  return toYmd(value)
}

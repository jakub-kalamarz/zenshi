export type Granularity = "day" | "week" | "month"

const GRANULARITY_ORDER: Granularity[] = ["day", "week", "month"]
const WEEK_MIN_DAYS = 14
const MONTH_MIN_DAYS = 60

export function daysInclusive(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T00:00:00Z`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 1
  }
  if (endDate < startDate) return 1
  const dayMs = 24 * 60 * 60 * 1000
  return Math.floor((endDate.getTime() - startDate.getTime()) / dayMs) + 1
}

export function getAllowedGranularities(
  start: string,
  end: string,
): Granularity[] {
  const days = daysInclusive(start, end)
  const output: Granularity[] = ["day"]
  if (days >= WEEK_MIN_DAYS) output.push("week")
  if (days >= MONTH_MIN_DAYS) output.push("month")
  return output
}

export function isGranularityAllowed(
  granularity: Granularity,
  start: string,
  end: string,
): boolean {
  return getAllowedGranularities(start, end).includes(granularity)
}

export function clampGranularity(
  requested: Granularity,
  start: string,
  end: string,
): Granularity {
  return clampGranularityToAllowed(
    requested,
    getAllowedGranularities(start, end),
  )
}

export function clampGranularityToAllowed(
  requested: Granularity,
  allowedGranularities: Granularity[],
): Granularity {
  const allowed = new Set(allowedGranularities)
  if (allowed.has(requested)) return requested

  for (let i = GRANULARITY_ORDER.indexOf(requested) - 1; i >= 0; i--) {
    const candidate = GRANULARITY_ORDER[i]
    if (allowed.has(candidate)) return candidate
  }
  return "day"
}

export function intersectGranularities(
  entries: Granularity[][],
): Granularity[] {
  if (entries.length === 0) return ["day"]
  return GRANULARITY_ORDER.filter((granularity) =>
    entries.every((allowed) => allowed.includes(granularity)),
  )
}

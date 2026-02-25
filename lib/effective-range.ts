export function computeEffectiveRange(
  requestedStart: string,
  requestedEnd: string,
  lastDateValue: string | null,
) {
  const requestedStartDate = new Date(`${requestedStart}T00:00:00Z`)
  const requestedEndDate = new Date(`${requestedEnd}T00:00:00Z`)
  const lastDate = lastDateValue ? new Date(`${lastDateValue}T00:00:00Z`) : null
  const dayMs = 24 * 60 * 60 * 1000
  const lengthDays =
    !Number.isNaN(requestedStartDate.getTime()) &&
    !Number.isNaN(requestedEndDate.getTime())
      ? Math.round(
          (requestedEndDate.getTime() - requestedStartDate.getTime()) / dayMs,
        ) + 1
      : null

  let effectiveStart = requestedStart
  let effectiveEnd = requestedEnd

  if (
    lastDate &&
    !Number.isNaN(lastDate.getTime()) &&
    !Number.isNaN(requestedStartDate.getTime()) &&
    !Number.isNaN(requestedEndDate.getTime()) &&
    lastDate < requestedEndDate &&
    lastDate >= requestedStartDate &&
    lengthDays &&
    lengthDays > 0
  ) {
    const adjustedEnd = lastDate
    const adjustedStart = new Date(
      adjustedEnd.getTime() - (lengthDays - 1) * dayMs,
    )
    effectiveStart = adjustedStart.toISOString().slice(0, 10)
    effectiveEnd = adjustedEnd.toISOString().slice(0, 10)
  }

  return {
    effectiveStart,
    effectiveEnd,
  }
}

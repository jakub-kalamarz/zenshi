"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { SiteFavicon } from "@/components/site-favicon"
import { displaySiteName } from "@/components/gsc/date-utils"
import {
  ArrowsClockwise,
  ArrowSquareOut,
  CalendarBlank,
  CheckCircle,
  Clock,
  GlobeHemisphereWest,
  Warning,
  XCircle,
} from "@phosphor-icons/react"

export type SyncRun = {
  runId: string
  state: string
  progressPercent: number
  processedUnits: number
  totalUnits: number
  unitLabel: string
  currentUnit: string | null
  dataFreshThrough: string | null
  etaSeconds: number | null
  startedAt: string | null
  lastProgressAt: string | null
  finishedAt: string | null
  queuePosition: number | null
  queueDelaySeconds: number | null
  stallState: "normal" | "delayed" | "stalled"
  stallReason: string | null
  errorMessage: string | null
}

export type SyncStatus = {
  siteId: string
  siteUrl: string
  lastSyncedDate: string | null
  status: string | null
  errorMessage: string | null
  updatedAt: string | null
  backfillCursorDate: string | null
  totalRows: number
  datesSynced: number
  truncatedDates: number
  minDate: string | null
  maxDate: string | null
  isSyncing: boolean
  retentionStart: string
  retentionEnd: string
  expectedDays: number
  syncedDays: number
  remainingDays: number
  syncProgressPct: number
  activeRun: SyncRun | null
  lastCompletedRun: SyncRun | null
  lastSuccessfulDataFreshThrough: string | null
  lastVisibleDataUpdatedAt: string | null
  healthSummary: "healthy" | "delayed" | "stalled" | "partial" | "error"
}

function relativeTime(
  dateStr: string | null,
  locale: string,
  labels: { never: string; justNow: string; yesterday: string },
): string {
  if (!dateStr) return labels.never
  const date = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return labels.never
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (diffMin < 1) return labels.justNow
  if (diffMin < 60) return rtf.format(-diffMin, "minute")
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return rtf.format(-diffHrs, "hour")
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) return labels.yesterday
  if (diffDays < 30) return rtf.format(-diffDays, "day")
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatShortDate(dateStr: string, locale: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return dateStr
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function buildSyncDashboardSummary(statuses: SyncStatus[]) {
  const activeCount = statuses.filter((status) => status.activeRun !== null || status.isSyncing || status.status === "syncing").length
  const queuedCount = statuses.filter((status) => status.activeRun?.state === "queued" || status.status === "queued").length
  const attentionCount = statuses.filter((status) =>
    ["error", "partial", "delayed", "stalled"].includes(status.healthSummary) ||
    status.status === "error" ||
    status.status === "truncated",
  ).length
  const freshestDate = statuses
    .map((status) => status.activeRun?.dataFreshThrough ?? status.lastSuccessfulDataFreshThrough)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ?? null

  return {
    activeCount,
    queuedCount,
    attentionCount,
    freshestDate,
  }
}

function syncStatusPriority(status: SyncStatus) {
  const hasAttention =
    ["error", "partial", "delayed", "stalled"].includes(status.healthSummary) ||
    status.status === "error" ||
    status.status === "truncated"
  const isQueued = status.activeRun?.state === "queued" || status.status === "queued"
  const isActive = (status.activeRun !== null && status.activeRun.state !== "queued") || status.isSyncing || status.status === "syncing"

  if (hasAttention) return 0
  if (isActive) return 1
  if (isQueued) return 2
  return 3
}

export function sortSyncStatuses(statuses: SyncStatus[]) {
  return [...statuses].sort((left, right) => {
    const priorityDiff = syncStatusPriority(left) - syncStatusPriority(right)
    if (priorityDiff !== 0) return priorityDiff

    const leftUpdated = left.updatedAt ? new Date(left.updatedAt).getTime() : 0
    const rightUpdated = right.updatedAt ? new Date(right.updatedAt).getTime() : 0
    return rightUpdated - leftUpdated
  })
}

export function describeSyncCardState(site: SyncStatus): {
  tone: "active" | "success" | "warning" | "error" | "muted"
  primaryKey: "syncing" | "queued" | "stalled" | "delayed" | "error" | "partial" | "freshness" | "never"
  secondaryKey: "eta" | "queue" | "freshness" | "none"
} {
  if (site.activeRun) {
    if (site.activeRun.state === "queued") {
      return { tone: "muted", primaryKey: "queued", secondaryKey: "queue" }
    }
    if (site.activeRun.stallState === "stalled") {
      return { tone: "warning", primaryKey: "stalled", secondaryKey: "freshness" }
    }
    if (site.activeRun.stallState === "delayed") {
      return { tone: "warning", primaryKey: "delayed", secondaryKey: "eta" }
    }
    return { tone: "active", primaryKey: "syncing", secondaryKey: site.activeRun.etaSeconds ? "eta" : "freshness" }
  }
  if (site.lastCompletedRun?.state === "error" || site.status === "error") {
    return { tone: "error", primaryKey: "error", secondaryKey: "freshness" }
  }
  if (site.lastCompletedRun?.state === "partial" || site.status === "truncated") {
    return { tone: "warning", primaryKey: "partial", secondaryKey: "freshness" }
  }
  if (site.lastSuccessfulDataFreshThrough) {
    return { tone: "success", primaryKey: "freshness", secondaryKey: "none" }
  }
  return { tone: "muted", primaryKey: "never", secondaryKey: "none" }
}

function toneClass(tone: ReturnType<typeof describeSyncCardState>["tone"]) {
  switch (tone) {
    case "active":
      return "text-blue-600"
    case "success":
      return "text-emerald-600"
    case "warning":
      return "text-amber-600"
    case "error":
      return "text-destructive"
    default:
      return "text-muted-foreground"
  }
}

function badgeVariantForTone(tone: ReturnType<typeof describeSyncCardState>["tone"]): "default" | "secondary" | "destructive" | "outline" {
  switch (tone) {
    case "active":
      return "default"
    case "success":
      return "secondary"
    case "error":
      return "destructive"
    default:
      return "outline"
  }
}

function formatEta(etaSeconds: number) {
  if (etaSeconds < 60) return `${etaSeconds}s`
  const minutes = Math.round(etaSeconds / 60)
  return `${minutes}m`
}

function renderPrimaryLine(site: SyncStatus, locale: string, t: ReturnType<typeof useTranslations<"syncPage">>) {
  const description = describeSyncCardState(site)
  switch (description.primaryKey) {
    case "syncing":
      return t("syncInProgress", { percent: site.activeRun?.progressPercent ?? site.syncProgressPct })
    case "queued":
      return t("queued")
    case "stalled":
      return t("stalled")
    case "delayed":
      return t("delayed")
    case "error":
      return site.lastCompletedRun?.errorMessage ?? site.errorMessage ?? t("syncFailed")
    case "partial":
      return t("partial")
    case "freshness":
      return t("dataFreshThrough", {
        date: formatShortDate(site.lastSuccessfulDataFreshThrough ?? site.lastSyncedDate ?? site.maxDate ?? site.retentionStart, locale),
      })
    default:
      return t("never")
  }
}

function renderSecondaryLine(site: SyncStatus, locale: string, t: ReturnType<typeof useTranslations<"syncPage">>) {
  const description = describeSyncCardState(site)
  switch (description.secondaryKey) {
    case "eta":
      return site.activeRun?.etaSeconds
        ? t("eta", { value: formatEta(site.activeRun.etaSeconds) })
        : t("dataFreshThrough", {
            date: formatShortDate(site.activeRun?.dataFreshThrough ?? site.lastSuccessfulDataFreshThrough ?? site.retentionStart, locale),
          })
    case "queue":
      return t("queuePosition", { position: site.activeRun?.queuePosition ?? 1 })
    case "freshness":
      return t("dataFreshThrough", {
        date: formatShortDate(
          site.activeRun?.dataFreshThrough ??
            site.lastCompletedRun?.dataFreshThrough ??
            site.lastSuccessfulDataFreshThrough ??
            site.retentionStart,
          locale,
        ),
      })
    default:
      return null
  }
}

function ProgressBar({
  percent,
  isErrored,
}: {
  percent: number
  isErrored: boolean
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  const trackClass = isErrored ? "bg-destructive/15" : "bg-muted"
  const fillClass = isErrored
    ? "bg-destructive"
    : clamped >= 100
      ? "bg-green-600 dark:bg-green-500"
      : "bg-blue-600 dark:bg-blue-500"

  return (
    <div className={`h-2 w-full overflow-hidden rounded-full ${trackClass}`}>
      <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

function LoadingRows() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3 pt-4">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="grid gap-3 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-10" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function SyncDashboard() {
  const locale = useLocale()
  const t = useTranslations("syncPage")
  const tCommon = useTranslations("common")
  const [statuses, setStatuses] = useState<SyncStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const summary = buildSyncDashboardSummary(statuses)
  const sortedStatuses = sortSyncStatuses(statuses)

  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/gsc/sync/status")
      if (!res.ok) return
      const data = (await res.json()) as { statuses: SyncStatus[] }
      setStatuses(data.statuses ?? [])
    } catch {
      // ignore
    }
  }, [])

  const fetchInitial = useCallback(async () => {
    setLoading(true)
    try {
      await fetchStatuses()
    } finally {
      setLoading(false)
    }
  }, [fetchStatuses])

  useEffect(() => {
    void fetchInitial()
    pollRef.current = setInterval(() => {
      void fetchStatuses()
    }, 5000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [fetchInitial, fetchStatuses])

  const handleSyncSite = useCallback(
    async (siteId: string) => {
      setSyncingIds((prev) => new Set(prev).add(siteId))
      try {
        await fetch("/api/gsc/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId }),
        })
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev)
          next.delete(siteId)
          return next
        })
        await fetchStatuses()
      }
    },
    [fetchStatuses],
  )

  const handleSyncAll = useCallback(async () => {
    setSyncingAll(true)
    try {
      for (const site of statuses) {
        await fetch("/api/gsc/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId: site.siteId }),
        })
      }
    } finally {
      setSyncingAll(false)
      await fetchStatuses()
    }
  }, [statuses, fetchStatuses])

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ArrowsClockwise className="size-4 text-muted-foreground" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchInitial()}
            disabled={loading}
            aria-label={tCommon("refresh")}
          >
            {loading ? <Spinner className="size-4" /> : <ArrowsClockwise className="size-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void handleSyncAll()}
            disabled={syncingAll}
          >
            {syncingAll ? <Spinner className="size-4" /> : <ArrowsClockwise className="size-4" />}
            {t("syncAll")}
          </Button>
        </div>
      </div>

      {loading && statuses.length === 0 && (
        <LoadingRows />
      )}
      {!loading && statuses.length === 0 && (
        <Card size="sm">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <GlobeHemisphereWest className="size-6 opacity-40" />
            {t("empty")}
          </CardContent>
        </Card>
      )}
      {!loading && statuses.length > 0 && (
        <div className="flex flex-col gap-4">
          <Card className="gap-0 py-0">
            <CardContent className="px-0">
              <div className="grid grid-cols-2 border-b border-border/60 bg-muted/30 text-[0.7rem] font-medium tracking-[0.16em] text-muted-foreground uppercase md:grid-cols-4 xl:grid-cols-[repeat(3,minmax(0,1fr))_1.2fr]">
                <div className="px-4 py-3">
                  <div>{t("summaryActive")}</div>
                  <div className="mt-1 text-lg font-semibold tracking-normal text-foreground">{summary.activeCount}</div>
                </div>
                <div className="border-l border-border/60 px-4 py-3">
                  <div>{t("summaryQueued")}</div>
                  <div className="mt-1 text-lg font-semibold tracking-normal text-foreground">{summary.queuedCount}</div>
                </div>
                <div className="border-t border-border/60 px-4 py-3 md:border-t-0 md:border-l">
                  <div>{t("summaryAttention")}</div>
                  <div className="mt-1 text-lg font-semibold tracking-normal text-foreground">{summary.attentionCount}</div>
                </div>
                <div className="border-l border-t border-border/60 px-4 py-3 md:border-t-0">
                  <div>{t("summaryFreshest")}</div>
                  <div className="mt-1 text-sm font-semibold tracking-normal text-foreground">
                    {summary.freshestDate ? formatShortDate(summary.freshestDate, locale) : t("never")}
                  </div>
                </div>
              </div>

              <div className="hidden border-b border-border/60 px-4 py-3 text-[0.7rem] font-medium tracking-[0.16em] text-muted-foreground uppercase md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.95fr)_auto] md:gap-3">
                <div>{t("siteColumn")}</div>
                <div>{t("statusColumn")}</div>
                <div>{t("progressColumn")}</div>
                <div>{t("freshnessColumn")}</div>
                <div>{t("updatedColumn")}</div>
                <div className="text-right">{t("actionsColumn")}</div>
              </div>

              <div className="divide-y divide-border/60">
                {sortedStatuses.map((site) => {
                  const isSyncingLocal = syncingIds.has(site.siteId)
                  const hasError = site.status === "error" || site.lastCompletedRun?.state === "error"
                  const description = describeSyncCardState(site)
                  const progressPercent = site.activeRun?.progressPercent ?? site.syncProgressPct
                  const secondaryLine = renderSecondaryLine(site, locale, t)
                  const progressLabel = t("progressDays", {
                    synced: site.activeRun?.processedUnits ?? site.syncedDays,
                    total: site.activeRun?.totalUnits ?? site.expectedDays,
                  })
                  const remainingLabel = t("remainingDays", {
                    days: Math.max(
                      0,
                      (site.activeRun?.totalUnits ?? site.expectedDays) - (site.activeRun?.processedUnits ?? site.syncedDays),
                    ),
                  })
                  const freshnessDate = site.activeRun?.dataFreshThrough ?? site.lastSuccessfulDataFreshThrough ?? site.lastSyncedDate ?? site.maxDate
                  const updatedLabel = relativeTime(site.updatedAt ?? site.lastVisibleDataUpdatedAt, locale, {
                    never: t("never"),
                    justNow: t("justNow"),
                    yesterday: t("yesterday"),
                  })

                  return (
                    <div
                      key={site.siteId}
                      className="px-4 py-4 transition-colors hover:bg-muted/20"
                    >
                      <div className="hidden items-center gap-3 md:grid md:grid-cols-[minmax(0,1.8fr)_minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.95fr)_auto]">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <SiteFavicon siteUrl={site.siteUrl} size={22} className="shrink-0 rounded-md" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{displaySiteName(site.siteUrl)}</div>
                              <div className="truncate text-xs text-muted-foreground">{site.siteUrl}</div>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <Badge variant={badgeVariantForTone(description.tone)} className="max-w-full">
                            {description.tone === "active" && <ArrowsClockwise data-icon="inline-start" className="animate-spin" />}
                            {description.tone === "success" && <CheckCircle data-icon="inline-start" weight="fill" className={toneClass(description.tone)} />}
                            {description.tone === "warning" && <Warning data-icon="inline-start" weight="fill" className={toneClass(description.tone)} />}
                            {description.tone === "error" && <XCircle data-icon="inline-start" weight="fill" />}
                            {description.tone === "muted" && <Clock data-icon="inline-start" />}
                            <span className="truncate">{renderPrimaryLine(site, locale, t)}</span>
                          </Badge>
                          {secondaryLine && (
                            <div className="mt-2 truncate text-xs text-muted-foreground">
                              {secondaryLine}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{progressLabel}</span>
                            <span className="font-medium text-foreground">{progressPercent}%</span>
                          </div>
                          <div className="mt-2">
                            <ProgressBar percent={progressPercent} isErrored={hasError} />
                          </div>
                          <div className="mt-2 truncate text-xs text-muted-foreground">{remainingLabel}</div>
                        </div>

                        <div className="min-w-0 text-sm">
                          <div className="font-medium text-foreground">
                            {freshnessDate ? formatShortDate(freshnessDate, locale) : t("never")}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {site.minDate && site.maxDate
                              ? `${formatShortDate(site.minDate, locale)} - ${formatShortDate(site.maxDate, locale)}`
                              : t("retentionWindow", {
                                  start: formatShortDate(site.retentionStart, locale),
                                  end: formatShortDate(site.retentionEnd, locale),
                                })}
                          </div>
                        </div>

                        <div className="min-w-0 text-sm">
                          <div className="font-medium text-foreground">{updatedLabel}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {site.updatedAt
                              ? new Date(site.updatedAt).toLocaleTimeString(locale, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : t("never")}
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => void handleSyncSite(site.siteId)}
                            disabled={isSyncingLocal}
                            aria-label={t("syncSiteAria", { site: displaySiteName(site.siteUrl) })}
                          >
                            {isSyncingLocal ? <Spinner /> : <ArrowsClockwise />}
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:hidden">
                        <div className="flex items-start gap-3">
                          <SiteFavicon siteUrl={site.siteUrl} size={22} className="mt-0.5 shrink-0 rounded-md" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{displaySiteName(site.siteUrl)}</div>
                            <div className="truncate text-xs text-muted-foreground">{site.siteUrl}</div>
                          </div>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => void handleSyncSite(site.siteId)}
                            disabled={isSyncingLocal}
                            aria-label={t("syncSiteAria", { site: displaySiteName(site.siteUrl) })}
                          >
                            {isSyncingLocal ? <Spinner /> : <ArrowsClockwise />}
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={badgeVariantForTone(description.tone)} className="max-w-full">
                            {description.tone === "active" && <ArrowsClockwise data-icon="inline-start" className="animate-spin" />}
                            {description.tone === "success" && <CheckCircle data-icon="inline-start" weight="fill" className={toneClass(description.tone)} />}
                            {description.tone === "warning" && <Warning data-icon="inline-start" weight="fill" className={toneClass(description.tone)} />}
                            {description.tone === "error" && <XCircle data-icon="inline-start" weight="fill" />}
                            {description.tone === "muted" && <Clock data-icon="inline-start" />}
                            <span className="truncate">{renderPrimaryLine(site, locale, t)}</span>
                          </Badge>
                          {secondaryLine && (
                            <span className="text-xs text-muted-foreground">
                              {secondaryLine}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3">
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{t("progressColumn")}</span>
                            <span className="font-medium text-foreground">{progressPercent}%</span>
                          </div>
                          <ProgressBar percent={progressPercent} isErrored={hasError} />
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{progressLabel}</span>
                            <span>{remainingLabel}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-[0.7rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">{t("freshnessColumn")}</div>
                            <div className="mt-1 font-medium text-foreground">
                              {freshnessDate ? formatShortDate(freshnessDate, locale) : t("never")}
                            </div>
                          </div>
                          <div>
                            <div className="text-[0.7rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">{t("updatedColumn")}</div>
                            <div className="mt-1 font-medium text-foreground">{updatedLabel}</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <CalendarBlank className="size-3.5" />
                            {t("retentionWindow", {
                              start: formatShortDate(site.retentionStart, locale),
                              end: formatShortDate(site.retentionEnd, locale),
                            })}
                          </span>
                          {secondaryLine && (
                            <span className="flex items-center gap-1.5">
                              <ArrowSquareOut className="size-3.5" />
                              {secondaryLine}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

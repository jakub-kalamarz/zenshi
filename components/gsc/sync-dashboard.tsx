"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
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
  const freshestDate = statuses
    .map((status) => status.activeRun?.dataFreshThrough ?? status.lastSuccessfulDataFreshThrough)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ?? null

  return {
    activeCount: statuses.filter((status) => status.activeRun !== null).length,
    queuedCount: statuses.filter((status) => status.activeRun?.state === "queued").length,
    attentionCount: statuses.filter((status) => ["error", "partial", "delayed", "stalled"].includes(status.healthSummary)).length,
    freshestDate,
  }
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
      return "text-blue-600 dark:text-blue-400"
    case "success":
      return "text-green-600 dark:text-green-400"
    case "warning":
      return "text-yellow-600 dark:text-yellow-400"
    case "error":
      return "text-destructive"
    default:
      return "text-muted-foreground"
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
        <div className="rounded-lg border">
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-5" />
          </div>
        </div>
      )}
      {!loading && statuses.length === 0 && (
        <div className="rounded-lg border">
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <GlobeHemisphereWest className="size-6 opacity-40" />
            {t("empty")}
          </div>
        </div>
      )}
      {!loading && statuses.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <div className="text-xs text-muted-foreground">{t("summaryActive")}</div>
              <div className="text-lg font-semibold">{summary.activeCount}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <div className="text-xs text-muted-foreground">{t("summaryQueued")}</div>
              <div className="text-lg font-semibold">{summary.queuedCount}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <div className="text-xs text-muted-foreground">{t("summaryAttention")}</div>
              <div className="text-lg font-semibold">{summary.attentionCount}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <div className="text-xs text-muted-foreground">{t("summaryFreshest")}</div>
              <div className="text-sm font-semibold">
                {summary.freshestDate ? formatShortDate(summary.freshestDate, locale) : t("never")}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {statuses.map((site) => {
            const isSyncingLocal = syncingIds.has(site.siteId)
            const hasError = site.status === "error" || site.lastCompletedRun?.state === "error"
            const description = describeSyncCardState(site)
            const progressPercent = site.activeRun?.progressPercent ?? site.syncProgressPct
            return (
              <div
                key={site.siteId}
                className="flex h-full flex-col gap-4 rounded-lg border px-5 py-4"
              >
                <div className="flex items-start gap-4">
                  <SiteFavicon siteUrl={site.siteUrl} size={24} className="mt-0.5 shrink-0 rounded" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      {displaySiteName(site.siteUrl)}
                    </span>
                    <div className={`flex items-center gap-1.5 text-xs ${toneClass(description.tone)}`}>
                      {description.tone === "active" && <ArrowsClockwise className="size-4 animate-spin" />}
                      {description.tone === "success" && <CheckCircle className="size-4 shrink-0" weight="fill" />}
                      {description.tone === "warning" && <Warning className="size-4 shrink-0" weight="fill" />}
                      {description.tone === "error" && <XCircle className="size-4 shrink-0" weight="fill" />}
                      {description.tone === "muted" && <Clock className="size-4 shrink-0" />}
                      <span className="truncate">{renderPrimaryLine(site, locale, t)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {renderSecondaryLine(site, locale, t) && (
                        <span className="flex items-center gap-1.5">
                          <ArrowSquareOut className="size-3.5 shrink-0" />
                          {renderSecondaryLine(site, locale, t)}
                        </span>
                      )}
                      {site.minDate && site.maxDate && (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarBlank className="size-3.5 shrink-0" />
                          {formatShortDate(site.minDate, locale)} – {formatShortDate(site.maxDate, locale)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0"
                    onClick={() => void handleSyncSite(site.siteId)}
                    disabled={isSyncingLocal}
                    aria-label={t("syncSiteAria", { site: displaySiteName(site.siteUrl) })}
                  >
                    {isSyncingLocal ? <Spinner className="size-4" /> : <ArrowsClockwise className="size-4" />}
                  </Button>
                </div>

                  <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{t("progressLabel")}</span>
                    <span className="font-medium text-foreground">
                      {progressPercent}%
                    </span>
                  </div>
                  <ProgressBar percent={progressPercent} isErrored={hasError} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    <span>{t("progressDays", { synced: site.activeRun?.processedUnits ?? site.syncedDays, total: site.activeRun?.totalUnits ?? site.expectedDays })}</span>
                    <span>{t("remainingDays", { days: Math.max(0, (site.activeRun?.totalUnits ?? site.expectedDays) - (site.activeRun?.processedUnits ?? site.syncedDays)) })}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {t("retentionWindow", {
                      start: formatShortDate(site.retentionStart, locale),
                      end: formatShortDate(site.retentionEnd, locale),
                    })}
                  </span>
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}

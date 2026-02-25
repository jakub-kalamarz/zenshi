"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { SiteFavicon } from "@/components/site-favicon"
import { displaySiteName } from "@/components/gsc/date-utils"
import {
  ArrowsClockwise,
  CalendarBlank,
  CheckCircle,
  Clock,
  GlobeHemisphereWest,
  Warning,
  XCircle,
} from "@phosphor-icons/react"

type SyncStatus = {
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

function StatusLine({
  site,
  locale,
}: {
  site: SyncStatus
  locale: string
}) {
  const t = useTranslations("syncPage")

  if (site.isSyncing) {
    return (
      <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
        <ArrowsClockwise className="size-4 animate-spin" />
        {t("syncInProgress", { percent: site.syncProgressPct })}
      </span>
    )
  }
  if (site.status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-destructive">
        <XCircle className="size-4 shrink-0" weight="fill" />
        <span className="truncate">{site.errorMessage ?? t("syncFailed")}</span>
      </span>
    )
  }
  if (site.status === "truncated") {
    return (
      <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
        <Warning className="size-4 shrink-0" weight="fill" />
        {t("truncated")}
      </span>
    )
  }
  if (site.backfillCursorDate !== null && site.datesSynced > 0) {
    return (
      <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
        <Warning className="size-4 shrink-0" weight="fill" />
        {t("backfillingFrom", { date: formatShortDate(site.backfillCursorDate, locale) })}
      </span>
    )
  }
  if (site.status === "ok" || site.datesSynced > 0) {
    return (
      <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
        <CheckCircle className="size-4 shrink-0" weight="fill" />
        {t("synced")}{" "}
        {relativeTime(site.updatedAt, locale, {
          never: t("never"),
          justNow: t("justNow"),
          yesterday: t("yesterday"),
        })}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Clock className="size-4 shrink-0" />
      {t("never")}
    </span>
  )
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {statuses.map((site) => {
            const isSyncingLocal = syncingIds.has(site.siteId)
            const hasError = site.status === "error"
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
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <StatusLine site={site} locale={locale} />
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
                      {site.syncProgressPct}%
                    </span>
                  </div>
                  <ProgressBar percent={site.syncProgressPct} isErrored={hasError} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    <span>{t("progressDays", { synced: site.syncedDays, total: site.expectedDays })}</span>
                    <span>{t("remainingDays", { days: site.remainingDays })}</span>
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
      )}
    </div>
  )
}

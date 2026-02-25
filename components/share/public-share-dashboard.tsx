"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import type { DateRange as CalendarRange } from "react-day-picker"
import { GlobeHemisphereWest } from "@phosphor-icons/react"
import { SiteCard, type Site, type SiteCardData } from "@/components/site-card"
import { MetricGrid } from "@/components/metric-grid"
import { SiteCardChart } from "@/components/site-card-chart"
import { PagesTable, type PageRow } from "@/components/pages-table"
import { QueriesTable, type QueryRow } from "@/components/queries-table"
import { DevicesTable, type DeviceRow } from "@/components/devices-table"
import { SiteDetailToolbar } from "@/components/gsc/site-detail-toolbar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CompareMode, DateRange, Granularity } from "@/components/gsc/types"
import {
  defaultDateRange,
  matchPreset,
  previousRange,
  rangeYearOverYear,
  toYmd,
  ymdToUtcDate,
} from "@/components/gsc/date-utils"
import {
  clampGranularityToAllowed,
  getAllowedGranularities,
} from "@/lib/gsc-granularity"

type ShareDefaults = {
  start: string | null
  end: string | null
  compareMode: CompareMode
  compareStart: string | null
  compareEnd: string | null
  granularity: Granularity
}

type ShareBranding = {
  brandName: string
  logoUrl: string | null
  faviconUrl: string | null
  accentColor: string
  headerBgColor: string | null
  textColor: string | null
  showPoweredBy: boolean
}

type ResolvedSharePayload = {
  share: {
    id: string
    scopeType: "site" | "folder"
    scopeId: string
    expiresAt: string
    defaults: ShareDefaults
    branding: ShareBranding
    sites: Site[]
  }
}

type PublicShareDashboardProps = {
  token: string
}

function displayDomain(raw: string) {
  try {
    const url = new URL(raw)
    return url.hostname
  } catch {
    return raw
  }
}

export function PublicShareDashboard({ token }: PublicShareDashboardProps) {
  const t = useTranslations("share")
  const [resolved, setResolved] = useState<ResolvedSharePayload["share"] | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [range, setRange] = useState<DateRange>(() => defaultDateRange())
  const [preset, setPreset] = useState(() => matchPreset(defaultDateRange()))
  const [compareMode, setCompareMode] = useState<CompareMode>("disabled")
  const [compareSettings, setCompareSettings] = useState({
    showPreviousTrend: true,
    matchWeekdays: true,
    showChangePercent: true,
  })
  const [granularity, setGranularity] = useState<Granularity>("day")
  const [allowedGranularities, setAllowedGranularities] = useState<Granularity[]>(
    () => {
      const initial = defaultDateRange()
      return getAllowedGranularities(initial.start, initial.end)
    },
  )
  const [calendarRange, setCalendarRange] = useState<CalendarRange | undefined>({
    from: ymdToUtcDate(defaultDateRange().start),
    to: ymdToUtcDate(defaultDateRange().end),
  })
  const [compareCalendarRange, setCompareCalendarRange] = useState<CalendarRange | undefined>(
    {
      from: ymdToUtcDate(defaultDateRange().start),
      to: ymdToUtcDate(defaultDateRange().end),
    },
  )

  const [siteCards, setSiteCards] = useState<Record<string, SiteCardData>>({})
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [card, setCard] = useState<SiteCardData | null>(null)
  const [pages, setPages] = useState<PageRow[]>([])
  const [queries, setQueries] = useState<QueryRow[]>([])
  const [devices, setDevices] = useState<DeviceRow[]>([])

  const compareLabelText = useMemo(() => t(`compare.${compareMode}`), [compareMode, t])
  const compareRange = useMemo(() => {
    if (compareMode === "disabled") return null
    if (compareMode === "previous") return previousRange(range.start, range.end)
    if (compareMode === "yoy") return rangeYearOverYear(range)
    if (compareMode === "custom" && compareCalendarRange?.from && compareCalendarRange?.to) {
      return {
        start: toYmd(compareCalendarRange.from),
        end: toYmd(compareCalendarRange.to),
      }
    }
    return null
  }, [compareCalendarRange, compareMode, range])
  const granularityLabel = useMemo(() => {
    if (granularity === "week") return t("weekly")
    if (granularity === "month") return t("monthly")
    return t("daily")
  }, [granularity, t])

  const selectedSite = useMemo(() => {
    if (!resolved || !selectedSiteId) return null
    return resolved.sites.find((site) => site.id === selectedSiteId) ?? null
  }, [resolved, selectedSiteId])

  const loadResolved = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ token })
      const res = await fetch(`/api/public/share/resolve?${params.toString()}`)
      if (!res.ok) {
        throw new Error(await res.text())
      }
      const payload = (await res.json()) as ResolvedSharePayload
      setResolved(payload.share)

      const defaults = payload.share.defaults
      const nextRange =
        defaults.start && defaults.end
          ? { start: defaults.start, end: defaults.end }
          : defaultDateRange()

      setRange(nextRange)
      setPreset(matchPreset(nextRange))
      setGranularity(defaults.granularity ?? "day")
      setCompareMode(defaults.compareMode ?? "disabled")

      if (defaults.compareStart && defaults.compareEnd) {
        setCompareCalendarRange({
          from: ymdToUtcDate(defaults.compareStart),
          to: ymdToUtcDate(defaults.compareEnd),
        })
      }

      const firstSite =
        payload.share.scopeType === "site"
          ? payload.share.scopeId
          : payload.share.sites[0]?.id ?? null
      setSelectedSiteId(firstSite)
    } catch (err) {
      const message = err instanceof Error ? err.message : t("loadSharedFailed")
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadResolved()
  }, [loadResolved])

  useEffect(() => {
    setPreset(matchPreset(range))
    setCalendarRange({ from: ymdToUtcDate(range.start), to: ymdToUtcDate(range.end) })
    setAllowedGranularities(getAllowedGranularities(range.start, range.end))
  }, [range])

  useEffect(() => {
    const next = clampGranularityToAllowed(granularity, allowedGranularities)
    if (next !== granularity) {
      setGranularity(next)
    }
  }, [allowedGranularities, granularity])

  const loadSiteCards = useCallback(async () => {
    if (!resolved || resolved.sites.length === 0) return
    const res = await fetch("/api/public/share/site-cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        siteIds: resolved.sites.map((site) => site.id),
        start: range.start,
        end: range.end,
        compareStart: compareRange?.start,
        compareEnd: compareRange?.end,
        granularity,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    const payload = (await res.json()) as { results: Record<string, SiteCardData> }
    setSiteCards(payload.results ?? {})

    const first = Object.values(payload.results ?? {})[0]
    if (first?.granularity && first.granularity !== granularity) {
      setGranularity(first.granularity)
    }
  }, [compareRange?.end, compareRange?.start, granularity, range.end, range.start, resolved, token])

  const loadSiteDetail = useCallback(async () => {
    if (!selectedSiteId) return
    setDetailLoading(true)
    try {
      const params = new URLSearchParams({
        token,
        siteId: selectedSiteId,
        start: range.start,
        end: range.end,
        granularity,
        limit: "1000",
      })
      if (compareRange) {
        params.set("compareStart", compareRange.start)
        params.set("compareEnd", compareRange.end)
      }
      const res = await fetch(`/api/public/share/site-detail?${params.toString()}`)
      if (!res.ok) throw new Error(await res.text())

      const payload = (await res.json()) as {
        card: SiteCardData
        pages: PageRow[]
        queries: QueryRow[]
        devices: DeviceRow[]
      }
      setCard(payload.card)
      setPages(payload.pages)
      setQueries(payload.queries)
      setDevices(payload.devices ?? [])

      const servedRange = payload.card?.servedRange ?? payload.card?.effectiveRange
      if (servedRange) {
        const nextAllowed =
          Array.isArray(payload.card.allowedGranularities) && payload.card.allowedGranularities.length > 0
            ? payload.card.allowedGranularities
            : getAllowedGranularities(servedRange.start, servedRange.end)
        setAllowedGranularities(nextAllowed)
      }

      if (payload.card?.granularity && payload.card.granularity !== granularity) {
        setGranularity(payload.card.granularity)
      }
    } finally {
      setDetailLoading(false)
    }
  }, [compareRange, granularity, range.end, range.start, selectedSiteId, token])

  useEffect(() => {
    if (!resolved || resolved.scopeType !== "folder") return
    loadSiteCards().catch((err) => {
      const message = err instanceof Error ? err.message : t("loadFailed")
      toast.error(message)
    })
  }, [loadSiteCards, resolved])

  useEffect(() => {
    if (!resolved || !selectedSiteId) return
    loadSiteDetail().catch((err) => {
      const message = err instanceof Error ? err.message : t("loadFailed")
      toast.error(message)
    })
  }, [loadSiteDetail, resolved, selectedSiteId])

  useEffect(() => {
    if (!resolved?.branding.faviconUrl) return
    const head = document.head
    const existing = head.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const previousHref = existing?.href ?? null

    const link = existing ?? document.createElement("link")
    link.rel = "icon"
    link.href = resolved.branding.faviconUrl
    if (!existing) head.appendChild(link)

    return () => {
      if (previousHref) {
        link.href = previousHref
      }
    }
  }, [resolved?.branding.faviconUrl])

  useEffect(() => {
    if (!resolved) return
    const previousTitle = document.title
    document.title = `${resolved.branding.brandName} | ${t("sharedDashboardTitle")}`
    return () => {
      document.title = previousTitle
    }
  }, [resolved, t])

  const applyRange = useCallback((nextRange: DateRange) => {
    setRange(nextRange)
  }, [])

  const handleCalendarSelect = useCallback(
    (nextRange: CalendarRange | undefined) => {
      if (!nextRange) {
        setCalendarRange(undefined)
        return
      }
      setCalendarRange(nextRange)
      if (nextRange.from && nextRange.to) {
        applyRange({ start: toYmd(nextRange.from), end: toYmd(nextRange.to) })
      }
    },
    [applyRange],
  )

  const handleCompareCalendarSelect = useCallback((nextRange: CalendarRange | undefined) => {
    if (!nextRange) {
      setCompareCalendarRange(undefined)
      return
    }
    setCompareCalendarRange(nextRange)
    if (nextRange.from && nextRange.to) {
      setCompareMode("custom")
    }
  }, [])

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-6">
        <div className="rounded-xl border px-4 py-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    )
  }

  if (error || !resolved) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {error ?? t("linkUnavailable")}
      </div>
    )
  }

  return (
    <div
      className="flex w-full flex-col gap-6"
      style={{
        ["--share-accent" as string]: resolved.branding.accentColor,
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SiteDetailToolbar
          granularity={granularity}
          allowedGranularities={allowedGranularities}
          granularityLabel={granularityLabel}
          onGranularityChange={setGranularity}
          preset={preset}
          range={range}
          onApplyRange={applyRange}
          calendarRange={calendarRange}
          onCalendarSelect={handleCalendarSelect}
          compareMode={compareMode}
          compareLabelText={compareLabelText}
          onCompareModeChange={setCompareMode}
          compareCalendarRange={compareCalendarRange}
          onCompareCalendarSelect={handleCompareCalendarSelect}
          compareSettings={compareSettings}
          onCompareSettingsChange={setCompareSettings}
        />

        {resolved.scopeType === "folder" ? (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">{t("viewing")}:</span>
            <Select value={selectedSiteId ?? undefined} onValueChange={setSelectedSiteId}>
              <SelectTrigger className="h-9 w-full min-w-[200px] sm:w-[320px]">
                <SelectValue placeholder={t("selectSite")} />
              </SelectTrigger>
              <SelectContent>
                {resolved.sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    <span className="inline-flex items-center gap-2">
                      <GlobeHemisphereWest className="size-4 text-muted-foreground" />
                      {displayDomain(site.gsc_site_url)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {resolved.scopeType === "folder" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resolved.sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              card={siteCards[site.id]}
              granularity={granularity}
              compareSettings={compareSettings}
              compareEnabled={compareMode !== "disabled"}
              linkToSite={false}
              onClick={() => setSelectedSiteId(site.id)}
              className={selectedSiteId === site.id ? "ring-2 ring-primary ring-offset-2" : ""}
            />
          ))}
        </div>
      ) : null}

      <Separator />

      {card?.retention?.partiallyOutside ? (
        <p className="text-xs text-muted-foreground">
          {t("retentionWarning", {
            start: card.retention.start,
            end: card.retention.end,
          })}
        </p>
      ) : null}

      {detailLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-[400px] w-full rounded-xl" />
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-[300px] rounded-xl" />
            <Skeleton className="h-[300px] rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          <MetricGrid
            variant="default"
            clicks={card?.total?.clicks}
            impressions={card?.total?.impressions}
            ctr={card?.total?.ctr}
            position={card?.total?.position}
            compareClicks={card?.compareTotal?.clicks}
            compareImpressions={card?.compareTotal?.impressions}
            compareCtr={card?.compareTotal?.ctr}
            comparePosition={card?.compareTotal?.position}
          />

          <SiteCardChart
            chartId={selectedSite?.id ?? resolved.scopeId}
            series={card?.series ?? []}
            compareSeries={card?.compareSeries}
            granularity={granularity}
            compareSettings={compareSettings}
            compareEnabled={compareMode !== "disabled"}
            height="24rem"
          />

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <QueriesTable queries={queries} compareEnabled={compareMode !== "disabled"} />
            <PagesTable pages={pages} compareEnabled={compareMode !== "disabled"} />
            <div className="xl:col-span-2">
              <DevicesTable devices={devices} compareEnabled={compareMode !== "disabled"} />
            </div>
          </div>
        </>
      )}

      {resolved.branding.showPoweredBy ? (
        <p className="text-center text-xs text-muted-foreground">{t("poweredBy")}</p>
      ) : null}
    </div>
  )
}

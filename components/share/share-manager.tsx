"use client"

import { Link } from "@/i18n/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CalendarBlank,
  Clock,
  Copy,
  DotsThree,
  Eye,
  FolderOpen,
  GlobeHemisphereWest,
  Infinity as PhosphorInfinity,
  LinkSimple,
  PencilSimple,
  Plus,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DomainBadge } from "@/components/domain-badge"

type ShareScopeType = "site" | "folder"
type EffectiveStatus = "active" | "revoked" | "expired" | "legacy_active"

type ShareRecord = {
  id: string
  scope_type: ShareScopeType
  scope_id: string
  status: "active" | "revoked" | "expired" | string
  expires_at: string
  created_at: string
  last_accessed_at: string | null
  site_label: string | null
  folder_label: string | null
  shareUrl: string | null
}

type SiteOption = { id: string; gsc_site_url: string }
type FolderOption = { id: string; name: string }

const IMMORTAL_PREFIX = "9999-"

function displaySite(raw: string) {
  try {
    const parsed = new URL(raw)
    return parsed.hostname
  } catch {
    return raw
  }
}

function formatScopeLabel(scopeType: ShareScopeType, siteLabel: string | null, folderLabel: string | null, scopeId: string) {
  if (scopeType === "site") return displaySite(siteLabel ?? scopeId)
  return folderLabel ?? scopeId
}

function safeLocalDate(value: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function safeLocalDateCompact(value: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function scopeKey(scopeType: ShareScopeType, scopeId: string) {
  return `${scopeType}:${scopeId}`
}

function isExpired(share: ShareRecord) {
  if (share.status === "revoked") return false
  const ts = Date.parse(share.expires_at)
  if (!Number.isFinite(ts)) return false
  return ts <= Date.now()
}

function isImmortalExpiry(value: string) {
  return value.startsWith(IMMORTAL_PREFIX)
}

function statusVariant(status: EffectiveStatus) {
  if (status === "active") return "default"
  if (status === "legacy_active") return "secondary"
  return "destructive"
}

function statusLabel(status: EffectiveStatus) {
  if (status === "legacy_active") return "legacy_active"
  if (status === "revoked") return "revoked"
  if (status === "expired") return "expired"
  return "active"
}

export function ShareManager() {
  const t = useTranslations("shareManager")
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [sites, setSites] = useState<SiteOption[]>([])
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [scopeType, setScopeType] = useState<ShareScopeType>("site")
  const [scopeId, setScopeId] = useState<string>("")
  const [editingShareId, setEditingShareId] = useState<string | null>(null)
  const [pendingRevokeShare, setPendingRevokeShare] = useState<ShareRecord | null>(null)

  const [neverExpires, setNeverExpires] = useState(true)
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined)

  const hasScopes = sites.length > 0 || folders.length > 0

  const scopeOptions = useMemo(
    () =>
      scopeType === "site"
        ? sites.map((site) => ({ id: site.id, label: displaySite(site.gsc_site_url) }))
        : folders.map((folder) => ({ id: folder.id, label: folder.name })),
    [scopeType, sites, folders],
  )

  const sharesByScope = useMemo(() => {
    const grouped = new Map<string, ShareRecord[]>()
    for (const share of shares) {
      const key = scopeKey(share.scope_type, share.scope_id)
      const current = grouped.get(key) ?? []
      current.push(share)
      grouped.set(key, current)
    }
    for (const [key, value] of grouped.entries()) {
      value.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      grouped.set(key, value)
    }
    return grouped
  }, [shares])

  const activeByScope = useMemo(() => {
    const map = new Map<string, ShareRecord>()
    for (const [key, scopedShares] of sharesByScope.entries()) {
      const candidate = scopedShares.find((share) => share.status === "active" && !isExpired(share))
      if (candidate) map.set(key, candidate)
    }
    return map
  }, [sharesByScope])

  const legacyActiveIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [, scopedShares] of sharesByScope.entries()) {
      const active = scopedShares.filter((share) => share.status === "active" && !isExpired(share))
      if (active.length <= 1) continue
      for (const share of active.slice(1)) {
        ids.add(share.id)
      }
    }
    return ids
  }, [sharesByScope])

  const getEffectiveStatus = useCallback(
    (share: ShareRecord): EffectiveStatus => {
      if (share.status === "revoked") return "revoked"
      if (isExpired(share)) return "expired"
      if (legacyActiveIds.has(share.id)) return "legacy_active"
      return "active"
    },
    [legacyActiveIds],
  )

  const selectedScopeKey = scopeId ? scopeKey(scopeType, scopeId) : null
  const selectedScopeCurrent = selectedScopeKey ? activeByScope.get(selectedScopeKey) ?? null : null
  const selectedScopeActiveIds = useMemo(() => {
    if (!selectedScopeKey) return []
    return (sharesByScope.get(selectedScopeKey) ?? [])
      .filter((share) => share.status === "active" && !isExpired(share))
      .map((share) => share.id)
  }, [selectedScopeKey, sharesByScope])

  const resetForm = useCallback(() => {
    setNeverExpires(true)
    setExpiresAt(undefined)
    setEditingShareId(null)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [sharesRes, sitesRes, foldersRes] = await Promise.all([
        fetch("/api/gsc/shares"),
        fetch("/api/gsc/sites"),
        fetch("/api/gsc/folders"),
      ])

      if (!sharesRes.ok) throw new Error(await sharesRes.text())
      if (!sitesRes.ok) throw new Error(await sitesRes.text())
      if (!foldersRes.ok) throw new Error(await foldersRes.text())

      const sharesData = (await sharesRes.json()) as { shares: ShareRecord[] }
      const sitesData = (await sitesRes.json()) as { sites: SiteOption[] }
      const foldersData = (await foldersRes.json()) as { folders: FolderOption[] }

      setShares(sharesData.shares ?? [])
      setSites(sitesData.sites ?? [])
      setFolders(foldersData.folders ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : t("failedLoad")
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const nextOptions = scopeType === "site" ? sites : folders
    const stillValid = nextOptions.some((option) => option.id === scopeId)
    if (stillValid) return
    setScopeId(nextOptions[0]?.id ?? "")
  }, [scopeId, scopeType, sites, folders])

  const expiresValidation = useMemo(() => {
    if (neverExpires || !expiresAt) return null
    if (expiresAt.getTime() <= Date.now()) return t("expiryFuture")
    return null
  }, [expiresAt, neverExpires, t])

  const canSubmit = Boolean(scopeId && !expiresValidation && !submitting)

  const revokeShare = useCallback(
    async (shareId: string) => {
      const res = await fetch("/api/gsc/shares", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shareId }),
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }
    },
    [],
  )

  const patchShare = useCallback(
    async (shareId: string, payload: { status?: "active" | "revoked"; expiresAt?: string }) => {
      const res = await fetch("/api/gsc/shares", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shareId, ...payload }),
      })
      if (!res.ok) throw new Error(await res.text())
    },
    [],
  )

  const createShare = useCallback(
    async (replaceIds: string[] = []) => {
      if (!scopeId) {
        throw new Error(t("selectScopeFirst"))
      }

      for (const id of replaceIds) {
        await revokeShare(id)
      }

      const body: {
        scopeType: ShareScopeType
        scopeId: string
        expiresAt?: string
      } = {
        scopeType,
        scopeId,
      }

      if (!neverExpires && expiresAt) {
        body.expiresAt = expiresAt.toISOString()
      }

      const res = await fetch("/api/gsc/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error(await res.text())
      return (await res.json()) as { shareUrl: string }
    },
    [expiresAt, neverExpires, revokeShare, scopeId, scopeType, t],
  )

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return

    setSubmitting(true)
    try {
      if (editingShareId) {
        const payload: { expiresAt?: string } = {}
        if (!neverExpires && expiresAt) payload.expiresAt = expiresAt.toISOString()

        await patchShare(editingShareId, payload)
        toast.success(t("linkSettingsUpdated"))
      } else {
        const replaceIds = selectedScopeActiveIds
        const payload = await createShare(replaceIds)
        await navigator.clipboard.writeText(payload.shareUrl)

        toast.success(
          replaceIds.length > 0
            ? t("linkReplacedCopied")
            : t("linkCreatedCopied"),
        )
      }

      await loadData()
      if (editingShareId) {
        setEditingShareId(null)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("couldNotSave")
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }, [
    canSubmit,
    createShare,
    editingShareId,
    expiresAt,
    loadData,
    neverExpires,
    patchShare,
    selectedScopeActiveIds,
    t,
  ])

  const handleRevokeConfirmed = useCallback(async () => {
    if (!pendingRevokeShare) return
    setSubmitting(true)
    try {
      await revokeShare(pendingRevokeShare.id)
      toast.success(t("shareRevoked"))
      await loadData()
      if (editingShareId === pendingRevokeShare.id) {
        resetForm()
      }
      setPendingRevokeShare(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : t("couldNotRevoke")
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }, [editingShareId, loadData, pendingRevokeShare, resetForm, revokeShare, t])

  const handleReactivate = useCallback(
    async (share: ShareRecord) => {
      if (isExpired(share)) {
        toast.error(t("linkExpiredCreateNew"))
        return
      }

      setSubmitting(true)
      try {
        const key = scopeKey(share.scope_type, share.scope_id)
        const scopedActive = (sharesByScope.get(key) ?? []).filter(
          (item) => item.id !== share.id && item.status === "active" && !isExpired(item),
        )
        for (const item of scopedActive) {
          await revokeShare(item.id)
        }
        await patchShare(share.id, { status: "active" })
        toast.success(t("shareReactivated"))
        await loadData()
      } catch (err) {
        const message = err instanceof Error ? err.message : t("couldNotReactivate")
        toast.error(message)
      } finally {
        setSubmitting(false)
      }
    },
    [loadData, patchShare, revokeShare, sharesByScope, t],
  )

  const handleEdit = useCallback((share: ShareRecord) => {
    setEditingShareId(share.id)
    setScopeType(share.scope_type)
    setScopeId(share.scope_id)

    if (isImmortalExpiry(share.expires_at)) {
      setNeverExpires(true)
      setExpiresAt(undefined)
    } else {
      setNeverExpires(false)
      const parsed = new Date(share.expires_at)
      setExpiresAt(Number.isNaN(parsed.getTime()) ? undefined : parsed)
    }
  }, [])

  const handleCopy = useCallback(async (url: string | null) => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t("linkCopied"))
    } catch {
      toast.error(t("clipboardUnavailable"))
    }
  }, [t])

  const handleOpen = useCallback((url: string | null) => {
    if (!url) return
    window.open(url, "_blank", "noopener,noreferrer")
  }, [])

  const handleRegenerate = useCallback(async () => {
    if (!selectedScopeCurrent) return

    setSubmitting(true)
    try {
      setScopeType(selectedScopeCurrent.scope_type)
      setScopeId(selectedScopeCurrent.scope_id)

      const payload = await createShare(selectedScopeActiveIds)
      await navigator.clipboard.writeText(payload.shareUrl)
      toast.success(t("linkRegeneratedCopied"))
      await loadData()
    } catch (err) {
      const message = err instanceof Error ? err.message : t("couldNotRegenerate")
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }, [createShare, loadData, selectedScopeActiveIds, selectedScopeCurrent, t])

  const primaryCtaText = useMemo(() => {
    if (editingShareId) return submitting ? t("saving") : t("saveSettings")
    if (selectedScopeCurrent) return submitting ? t("replacing") : t("replaceLink")
    return submitting ? t("creating") : t("createLink")
  }, [editingShareId, selectedScopeCurrent, submitting, t])

  const selectedScopeLabel = useMemo(() => {
    if (!scopeId) return ""
    const option = scopeOptions.find((item) => item.id === scopeId)
    return option?.label ?? ""
  }, [scopeId, scopeOptions])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4 pb-20 sm:pb-0">
        {loadError ? (
          <Card size="sm" className="border-destructive/40">
            <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-sm text-destructive">
                  <Warning className="size-3.5" />
                  {t("failedLoad")}
                </CardTitle>
              <CardDescription>{loadError}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
                <ArrowsClockwise className="size-4" />
                {t("retry")}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!hasScopes && !loading ? (
          <Card size="sm" className="border-border/70">
            <CardContent className="p-4">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <LinkSimple className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>{t("noScopesTitle")}</EmptyTitle>
                  <EmptyDescription>
                    {t("noScopesDescription")}
                  </EmptyDescription>
                </EmptyHeader>
                <Button asChild size="sm" variant="outline">
                  <Link href="/">{t("goDashboard")}</Link>
                </Button>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card size="sm" className="border-border/70 overflow-visible">
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  {editingShareId
                    ? <><PencilSimple className="size-3.5 text-muted-foreground" /> {t("editLinkSettings")}</>
                    : <><Plus className="size-3.5 text-muted-foreground" /> {t("createOrReplaceLink")}</>}
                </CardTitle>
                <CardDescription>
                  {editingShareId
                    ? t("editDescription")
                    : t("createDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("scope")}</Label>
                  <Tabs value={scopeType} onValueChange={(value) => setScopeType(value as ShareScopeType)}>
                    <TabsList>
                      <TabsTrigger value="site" disabled={Boolean(editingShareId)}>
                        <GlobeHemisphereWest className="size-4" />
                        {t("site")}
                      </TabsTrigger>
                      <TabsTrigger value="folder" disabled={Boolean(editingShareId)}>
                        <FolderOpen className="size-4" />
                        {t("folder")}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="share-scope-select">{scopeType === "site" ? t("site") : t("folder")}</Label>
                  <Select
                    value={scopeId}
                    onValueChange={setScopeId}
                    disabled={Boolean(editingShareId) || scopeOptions.length === 0}
                  >
                    <SelectTrigger id="share-scope-select" className="w-full min-w-0">
                      <SelectValue placeholder={scopeType === "site" ? t("selectSite") : t("selectFolder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {scopeOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          <span className="truncate">{option.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedScopeCurrent && !editingShareId ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                    <Warning className="mt-px size-3.5 shrink-0" />
                    {t("replaceWarning", { scope: selectedScopeLabel || t("thisScope") })}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="never-expires"
                      checked={neverExpires}
                      onCheckedChange={(next) => setNeverExpires(Boolean(next))}
                    />
                    <Label htmlFor="never-expires" className="flex items-center gap-1.5">
                      <PhosphorInfinity className="size-3.5 text-muted-foreground" />
                      {t("neverExpires")}
                    </Label>
                  </div>

                  {!neverExpires ? (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <CalendarBlank className="size-3.5 text-muted-foreground" />
                        {t("expiryDate")}
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarBlank className="size-4" />
                            {expiresAt ? safeLocalDateCompact(expiresAt.toISOString()) : t("selectExpiryDate")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={expiresAt}
                            onSelect={setExpiresAt}
                            defaultMonth={expiresAt ?? new Date()}
                          />
                        </PopoverContent>
                      </Popover>
                      {expiresValidation ? (
                        <p className="text-xs text-destructive">{expiresValidation}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {editingShareId ? (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={resetForm} disabled={submitting}>
                      <X className="size-4" />
                      {t("cancelEdit")}
                    </Button>
                    <Button className="ml-auto hidden sm:inline-flex" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                      <PencilSimple className="size-4" />
                      {primaryCtaText}
                    </Button>
                  </div>
                ) : (
                  <Button className="hidden w-full sm:inline-flex" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                    <Plus className="size-4" />
                    {primaryCtaText}
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card size="sm" className="border-border/70 overflow-visible">
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <LinkSimple className="size-3.5 text-muted-foreground" />
                  {t("activeLinkForScope")}
                </CardTitle>
                <CardDescription>
                  {selectedScopeCurrent
                    ? t("currentStatus", { status: t(`status.${statusLabel(getEffectiveStatus(selectedScopeCurrent))}`) })
                    : t("noActiveLink")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedScopeCurrent ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="active-link" className="flex items-center gap-1.5">
                        <GlobeHemisphereWest className="size-3.5 text-muted-foreground" />
                        {t("publicUrl")}
                      </Label>
                      <div className="flex gap-2">
                        <Input id="active-link" readOnly value={selectedScopeCurrent.shareUrl ?? ""} />
                        <Button variant="outline" onClick={() => void handleCopy(selectedScopeCurrent.shareUrl)}>
                          <Copy className="size-4" />
                          {t("copy")}
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={statusVariant(getEffectiveStatus(selectedScopeCurrent))} className="capitalize">
                        {t(`status.${getEffectiveStatus(selectedScopeCurrent)}`)}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {t("created")} {safeLocalDate(selectedScopeCurrent.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarBlank className="size-3" />
                        {t("expires")} {isImmortalExpiry(selectedScopeCurrent.expires_at) ? t("never") : safeLocalDate(selectedScopeCurrent.expires_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="size-3" />
                        {t("lastAccess")} {safeLocalDate(selectedScopeCurrent.last_accessed_at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleOpen(selectedScopeCurrent.shareUrl)}>
                        <ArrowSquareOut className="size-4" />
                        {t("openPreview")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void handleRegenerate()} disabled={submitting}>
                        <ArrowsClockwise className="size-4" />
                        {t("regenerate")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setPendingRevokeShare(selectedScopeCurrent)}
                      >
                        <Trash className="size-4" />
                        {t("revoke")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                    {t("createToSee")}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card size="sm" className="border-border/70 overflow-visible">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-1.5 text-sm">
                      <DotsThree className="size-3.5 text-muted-foreground" />
                      {t("allLinks")}
                    </CardTitle>
                    <CardDescription>{t("allLinksDescription")}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
                    <ArrowsClockwise className="size-4" />
                    {t("refresh")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <div className="rounded-md border px-3 py-4 text-sm text-muted-foreground">{t("loadingLinks")}</div>
                ) : shares.length === 0 ? (
                  <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                    {t("noShareLinksYet")}
                  </div>
                ) : (
                  shares.map((share) => {
                    const effectiveStatus = getEffectiveStatus(share)
                    const scopeName = formatScopeLabel(
                      share.scope_type,
                      share.site_label,
                      share.folder_label,
                      share.scope_id,
                    )
                    const canCopy = effectiveStatus === "active" || effectiveStatus === "legacy_active"
                    const canReactivate = effectiveStatus === "revoked" && !isExpired(share)

                    return (
                      <div
                        key={share.id}
                        className="rounded-lg border p-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {share.scope_type === "site" ? (
                                <DomainBadge
                                  siteUrl={share.site_label ?? share.scope_id}
                                  siteId={share.scope_id}
                                  size={18}
                                  className="p-0 hover:bg-transparent"
                                />
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                                  <FolderOpen className="size-4 text-muted-foreground" />
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="max-w-[220px] truncate">{scopeName}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>{scopeName}</TooltipContent>
                                  </Tooltip>
                                </span>
                              )}
                              <Badge variant="outline" className="h-5 px-1 text-[10px] uppercase tracking-wider">
                                {share.scope_type === "site" ? t("site") : t("folder")}
                              </Badge>
                              <Badge variant={statusVariant(effectiveStatus)} className="h-5 px-1.5 capitalize">
                                {t(`status.${effectiveStatus}`)}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1">
                                    <Clock className="size-3 shrink-0" />
                                    {safeLocalDateCompact(share.created_at)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t("created")} {safeLocalDate(share.created_at)}</TooltipContent>
                              </Tooltip>
                              <span className="opacity-50">•</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1">
                                    {isImmortalExpiry(share.expires_at)
                                      ? <PhosphorInfinity className="size-3 shrink-0" />
                                      : <CalendarBlank className="size-3 shrink-0" />}
                                    {isImmortalExpiry(share.expires_at)
                                      ? t("never")
                                      : safeLocalDateCompact(share.expires_at)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isImmortalExpiry(share.expires_at)
                                    ? t("neverExpires")
                                    : `${t("expires")} ${safeLocalDate(share.expires_at)}`}
                                </TooltipContent>
                              </Tooltip>
                              <span className="opacity-50">•</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1">
                                    <Eye className="size-3 shrink-0" />
                                    {safeLocalDateCompact(share.last_accessed_at)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t("lastAccess")} {safeLocalDate(share.last_accessed_at)}</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <DotsThree className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  disabled={!canCopy}
                                  onSelect={() => {
                                    void handleCopy(share.shareUrl)
                                  }}
                                >
                                  <Copy className="size-4" />
                                  {t("copyLink")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canCopy}
                                  onSelect={() => handleOpen(share.shareUrl)}
                                >
                                  <LinkSimple className="size-4" />
                                  {t("openPreview")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleEdit(share)}>
                                  <PencilSimple className="size-4" />
                                  {t("editSettings")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canReactivate}
                                  onSelect={() => {
                                    void handleReactivate(share)
                                  }}
                                >
                                  <ArrowsClockwise className="size-4" />
                                  {t("reactivate")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => setPendingRevokeShare(share)}
                                >
                                  <Trash className="size-4" />
                                  {t("revoke")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 p-4 backdrop-blur-sm sm:hidden">
              <Button className="w-full" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {editingShareId ? <PencilSimple className="size-4" /> : <Plus className="size-4" />}
                {primaryCtaText}
              </Button>
            </div>
          </>
        )}

        <AlertDialog open={Boolean(pendingRevokeShare)} onOpenChange={(open) => !open && setPendingRevokeShare(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("revokeTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("revokeDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void handleRevokeConfirmed()}
              >
                {t("revokeAccess")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SiteCard, type Site, type SiteCardData } from "@/components/site-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FolderOpen, CaretDown } from "@phosphor-icons/react";
import type { DateRange as CalendarRange } from "react-day-picker";
import type {
  DateRange,
  Folder,
  CompareMode,
  Granularity,
  SortId,
} from "@/components/gsc/types";
import { SORT_OPTIONS } from "@/components/gsc/types";
import {
  toYmd,
  rangeFromDays,
  rangeYearOverYear,
  previousRange,
  ymdToUtcDate,
  defaultDateRange,
  matchPreset,
  displaySiteName,
} from "@/components/gsc/date-utils";
import { FolderGlyph } from "@/components/gsc/folder-glyph";
import { FolderMasterCard } from "@/components/gsc/folder-master-card";
import { DashboardToolbar } from "@/components/gsc/dashboard-toolbar";
import { FolderDialogs } from "@/components/gsc/folder-dialogs";
import { useChartTooltip } from "@/components/gsc/chart-tooltip-context";
import { Spinner } from "@/components/ui/spinner";
import { aggregateGroupCard } from "@/lib/gsc-master-chart";
import {
  clampGranularity,
  clampGranularityToAllowed,
  getAllowedGranularities,
  intersectGranularities,
} from "@/lib/gsc-granularity";

type DashboardPreferences = {
  compareMode: CompareMode;
  compareSettings: {
    showPreviousTrend: boolean;
    matchWeekdays: boolean;
    showChangePercent: boolean;
  };
  folderOpenKeys: string[];
  granularity: Granularity;
  preset: string;
  range: DateRange | null;
  compareRange: DateRange | null;
};

function isSameDateRange(a: DateRange | null | undefined, b: DateRange | null | undefined) {
  if (!a || !b) return a === b;
  return a.start === b.start && a.end === b.end;
}

function isSameCompareSettings(
  a: {
    showPreviousTrend: boolean;
    matchWeekdays: boolean;
    showChangePercent: boolean;
  },
  b: {
    showPreviousTrend: boolean;
    matchWeekdays: boolean;
    showChangePercent: boolean;
  },
) {
  return (
    a.showPreviousTrend === b.showPreviousTrend &&
    a.matchWeekdays === b.matchWeekdays &&
    a.showChangePercent === b.showChangePercent
  );
}

function normalizeOpenFolderKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (key, index, all): key is string =>
      typeof key === "string" && key.length > 0 && all.indexOf(key) === index,
  );
}

export function GscDashboard() {
  const t = useTranslations("dashboard");
  const { setActiveId } = useChartTooltip();
  const [sites, setSites] = useState<Site[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [cards, setCards] = useState<Record<string, SiteCardData>>({});
  const [range, setRange] = useState<DateRange>(() => defaultDateRange());
  const [preset, setPreset] = useState(() => matchPreset(defaultDateRange()));
  const [compareMode, setCompareMode] = useState<CompareMode>("previous");
  const [compareSettings, setCompareSettings] = useState({
    showPreviousTrend: true,
    matchWeekdays: true,
    showChangePercent: true,
  });
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [sortId, setSortId] = useState<SortId>("az");
  const [calendarRange, setCalendarRange] = useState<CalendarRange | undefined>(
    {
      from: ymdToUtcDate(defaultDateRange().start),
      to: ymdToUtcDate(defaultDateRange().end),
    },
  );
  const [compareCalendarRange, setCompareCalendarRange] = useState<
    CalendarRange | undefined
  >({
    from: ymdToUtcDate(defaultDateRange().start),
    to: ymdToUtcDate(defaultDateRange().end),
  });
  const [syncing, setSyncing] = useState(false);
  const [domainQuery, setDomainQuery] = useState("");
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateIcon, setFolderCreateIcon] = useState<string>("folder");
  const [folderCreateColor, setFolderCreateColor] = useState<string>("#6b7280");
  const [folderRenameOpen, setFolderRenameOpen] = useState(false);
  const [folderRenameId, setFolderRenameId] = useState<string | null>(null);
  const [folderRenameName, setFolderRenameName] = useState("");
  const [folderRenameIcon, setFolderRenameIcon] = useState<string>("folder");
  const [folderRenameColor, setFolderRenameColor] = useState<string>("#6b7280");
  const [folderDeleteOpen, setFolderDeleteOpen] = useState(false);
  const [folderDeleteId, setFolderDeleteId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveSiteIds, setMoveSiteIds] = useState<string[]>([]);
  const [moveFolderId, setMoveFolderId] = useState<string>("unassigned");
  const [openFolderKeys, setOpenFolderKeys] = useState<string[]>([
    "unassigned",
  ]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [, startTransition] = useTransition();
  const cacheRef = useRef<Map<string, SiteCardData>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const compareLabelText = useMemo(
    () => t(`compare.${compareMode}`),
    [compareMode, t],
  );
  const currentSort = useMemo(
    () =>
      SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0],
    [sortId],
  );
  const compareRange = useMemo(() => {
    if (compareMode === "disabled") return null;
    if (compareMode === "previous") {
      return previousRange(range.start, range.end);
    }
    if (compareMode === "yoy") {
      return rangeYearOverYear(range);
    }
    if (
      compareMode === "custom" &&
      compareCalendarRange?.from &&
      compareCalendarRange?.to
    ) {
      return {
        start: toYmd(compareCalendarRange.from),
        end: toYmd(compareCalendarRange.to),
      };
    }
    return null;
  }, [compareCalendarRange, compareMode, range]);
  const granularityLabel = useMemo(() => {
    if (granularity === "week") return t("weekly");
    if (granularity === "month") return t("monthly");
    return t("daily");
  }, [granularity, t]);
  const normalizedQuery = useMemo(
    () => domainQuery.trim().toLowerCase(),
    [domainQuery],
  );
  const filteredSites = useMemo(() => {
    if (!normalizedQuery) return sites;
    return sites.filter((site) =>
      site.gsc_site_url.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, sites]);
  const fallbackAllowedGranularities = useMemo<Granularity[]>(
    () => getAllowedGranularities(range.start, range.end),
    [range],
  );
  const allowedGranularities = useMemo<Granularity[]>(() => {
    if (filteredSites.length === 0) return fallbackAllowedGranularities;
    const all: Granularity[][] = [];
    for (const site of filteredSites) {
      const card = cards[site.id];
      if (!card) continue;
      if (
        Array.isArray(card.allowedGranularities) &&
        card.allowedGranularities.length > 0
      ) {
        all.push(card.allowedGranularities);
        continue;
      }
      const served = card.servedRange ?? card.effectiveRange;
      if (served) {
        all.push(getAllowedGranularities(served.start, served.end));
      }
    }
    if (all.length === 0) return fallbackAllowedGranularities;
    return intersectGranularities(all);
  }, [cards, fallbackAllowedGranularities, filteredSites]);
  const folderById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);
  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [folders]);
  const sortSites = useCallback((sitesToSort: Site[]) => {
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      numeric: true,
    });
    const withSort = sitesToSort.map((site, index) => {
      const card = cards[site.id];
      const totalClicks = card?.total?.clicks ?? null;
      const compareClicks = card?.compareTotal?.clicks ?? null;
      const growthClicks =
        totalClicks != null && compareClicks != null
          ? totalClicks - compareClicks
          : null;
      const growthPct =
        compareMode !== "disabled" &&
        totalClicks != null &&
        compareClicks != null &&
        compareClicks > 0
          ? (totalClicks - compareClicks) / compareClicks
          : null;
      let sortValue: number | string | null = null;
      if (sortId === "az") {
        sortValue = displaySiteName(site.gsc_site_url);
      } else if (sortId === "total-clicks") {
        sortValue = totalClicks;
      } else if (sortId === "growth-clicks") {
        sortValue = growthClicks;
      } else if (sortId === "growth-clicks-pct") {
        sortValue = growthPct;
      }
      const missing = sortValue == null;
      return { site, index, sortValue, missing };
    });
    withSort.sort((a, b) => {
      if (a.missing !== b.missing) return a.missing ? 1 : -1;
      if (a.sortValue == null && b.sortValue == null) {
        return a.index - b.index;
      }
      if (sortId === "az") {
        const result = collator.compare(
          String(a.sortValue ?? ""),
          String(b.sortValue ?? ""),
        );
        return result !== 0 ? result : a.index - b.index;
      }
      const aNum = Number(a.sortValue ?? 0);
      const bNum = Number(b.sortValue ?? 0);
      if (aNum === bNum) return a.index - b.index;
      return bNum - aNum;
    });
    return withSort.map((entry) => entry.site);
  }, [cards, compareMode, sortId]);
  const allSitesSorted = useMemo(
    () => sortSites(sites),
    [sites, sortSites],
  );
  const visibleSitesSorted = useMemo(
    () => sortSites(filteredSites),
    [filteredSites, sortSites],
  );
  const groupedSites = useMemo(() => {
    const groupedAll = new Map<string | null, Site[]>();
    for (const site of allSitesSorted) {
      const key = site.folder_id ?? null;
      const existing = groupedAll.get(key);
      if (existing) {
        existing.push(site);
      } else {
        groupedAll.set(key, [site]);
      }
    }

    const groupedVisible = new Map<string | null, Site[]>();
    for (const site of visibleSitesSorted) {
      const key = site.folder_id ?? null;
      const existing = groupedVisible.get(key);
      if (existing) {
        existing.push(site);
      } else {
        groupedVisible.set(key, [site]);
      }
    }

    const groups: Array<{
      key: string;
      label: string;
      allSiteIds: string[];
      visibleSites: Site[];
      folder: Folder | null;
    }> = [];

    for (const folder of sortedFolders) {
      const allSitesInFolder = groupedAll.get(folder.id) ?? [];
      groups.push({
        key: folder.id,
        label: folder.name,
        allSiteIds: allSitesInFolder.map((site) => site.id),
        visibleSites: groupedVisible.get(folder.id) ?? [],
        folder,
      });
    }

    const allUnassignedSites = groupedAll.get(null) ?? [];
    if (allUnassignedSites.length > 0) {
      groups.push({
        key: "unassigned",
        label: t("unassigned"),
        allSiteIds: allUnassignedSites.map((site) => site.id),
        visibleSites: groupedVisible.get(null) ?? [],
        folder: null,
      });
    }

    return groups;
  }, [allSitesSorted, sortedFolders, t, visibleSitesSorted]);
  const masterCardsByGroupKey = useMemo(() => {
    const masterCards: Record<string, SiteCardData | null> = {};
    for (const group of groupedSites) {
      if (group.allSiteIds.length === 0) continue;
      masterCards[group.key] = aggregateGroupCard(group.allSiteIds, cards);
    }
    return masterCards;
  }, [cards, groupedSites]);
  const visibleOpenFolderKeys = useMemo(() => {
    const visibleKeysSet = new Set(groupedSites.map((group) => group.key));
    return openFolderKeys.filter((key) => visibleKeysSet.has(key));
  }, [groupedSites, openFolderKeys]);

  useEffect(() => {
    const nextPreset = matchPreset(range);
    setPreset((prev) => (prev === nextPreset ? prev : nextPreset));
    setCalendarRange((prev) => {
      if (!prev?.from || !prev?.to) {
        return {
          from: ymdToUtcDate(range.start),
          to: ymdToUtcDate(range.end),
        };
      }
      const prevRange = {
        start: toYmd(prev.from),
        end: toYmd(prev.to),
      };
      if (isSameDateRange(prevRange, range)) return prev;
      return {
        from: ymdToUtcDate(range.start),
        to: ymdToUtcDate(range.end),
      };
    });
  }, [range]);

  useEffect(() => {
    const next = clampGranularityToAllowed(granularity, allowedGranularities);
    if (next !== granularity) {
      setGranularity(next);
    }
  }, [allowedGranularities, granularity]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  const loadFolders = useCallback(async () => {
    const res = await fetch("/api/gsc/folders");
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { folders: Folder[] };
    setFolders(data.folders ?? []);
    setFoldersLoaded(true);
    return data.folders ?? [];
  }, []);

  const loadSites = useCallback(async (refresh = false) => {
    const url = refresh ? "/api/gsc/sites?refresh=1" : "/api/gsc/sites";
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { sites: Site[] };
    setSites(data.sites ?? []);
    return data.sites ?? [];
  }, []);

  const loadPreferences = useCallback(async () => {
    const res = await fetch("/api/gsc/preferences");
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as {
      preferences: DashboardPreferences | null;
    };
    const prefs = data.preferences;
    if (!prefs) {
      setPreferencesLoaded(true);
      return;
    }
    setCompareMode((prev) =>
      prev === prefs.compareMode ? prev : prefs.compareMode,
    );
    setCompareSettings((prev) =>
      isSameCompareSettings(prev, prefs.compareSettings)
        ? prev
        : prefs.compareSettings,
    );
    const nextRange =
      prefs.range?.start && prefs.range?.end ? prefs.range : defaultDateRange();
    setRange((prev) => (isSameDateRange(prev, nextRange) ? prev : nextRange));
    const nextGranularity = clampGranularity(
      prefs.granularity,
      nextRange.start,
      nextRange.end,
    );
    setGranularity((prev) => (prev === nextGranularity ? prev : nextGranularity));
    if (prefs.compareRange?.start && prefs.compareRange?.end) {
      setCompareCalendarRange({
        from: ymdToUtcDate(prefs.compareRange.start),
        to: ymdToUtcDate(prefs.compareRange.end),
      });
    }
    setOpenFolderKeys(normalizeOpenFolderKeys(prefs.folderOpenKeys));
    setPreferencesLoaded(true);
  }, []);

  const loadCards = useCallback(
    async (
      nextSites: Site[],
      dateRange: DateRange,
      cmpRange: DateRange | null,
    ) => {
      if (!nextSites.length) {
        setCards({});
        return;
      }

      const compareKey = cmpRange
        ? `${cmpRange.start}|${cmpRange.end}`
        : "none";
      const siteIdsToFetch: string[] = [];
      const cachedCards: Record<string, SiteCardData> = {};

      for (const site of nextSites) {
        const key = `${site.id}|${dateRange.start}|${dateRange.end}|${compareKey}|${granularity}`;
        const cached = cacheRef.current.get(key);
        if (cached) {
          cachedCards[site.id] = cached;
        } else {
          siteIdsToFetch.push(site.id);
        }
      }

      if (Object.keys(cachedCards).length > 0) {
        startTransition(() => {
          setCards((prev) => ({
            ...prev,
            ...cachedCards,
          }));
        });
      }

      if (siteIdsToFetch.length === 0) return;

      const res = await fetch("/api/gsc/site-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteIds: siteIdsToFetch,
          start: dateRange.start,
          end: dateRange.end,
          compareStart: cmpRange?.start,
          compareEnd: cmpRange?.end,
          granularity,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const { results } = (await res.json()) as {
        results: Record<string, SiteCardData>;
      };

      for (const [siteId, data] of Object.entries(results)) {
        const key = `${siteId}|${dateRange.start}|${dateRange.end}|${compareKey}|${granularity}`;
        cacheRef.current.set(key, data);
      }

      startTransition(() => {
        setCards((prev) => ({
          ...prev,
          ...results,
        }));
      });
      const firstResult = Object.values(results)[0];
      const resultGranularity = firstResult?.granularity;
      if (resultGranularity && resultGranularity !== granularity) {
        setGranularity((prev) =>
          prev === resultGranularity ? prev : resultGranularity,
        );
      }

      if (preset !== "custom") {
        const entries = Object.entries(results);
        const servedRanges = entries
          .map(([, data]) => data.servedRange ?? data.effectiveRange)
          .filter((r): r is DateRange => Boolean(r));
        const unique =
          servedRanges.length > 0
            ? servedRanges.every(
                (r) =>
                  r.start === servedRanges[0].start &&
                  r.end === servedRanges[0].end,
              )
              ? servedRanges[0]
              : null
            : null;
        if (
          unique &&
          (unique.start !== dateRange.start || unique.end !== dateRange.end)
        ) {
          setRange((prev) => (isSameDateRange(prev, unique) ? prev : unique));
        }
      }
    },
    [granularity, preset, startTransition],
  );

  const assignSitesToFolder = useCallback(
    async (siteIds: string[], folderId: string | null) => {
      if (!siteIds.length) return;

      const failed: string[] = [];
      for (const siteId of siteIds) {
        const res = await fetch("/api/gsc/sites", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId, folderId }),
        });
        if (!res.ok) {
          failed.push(siteId);
        }
      }

      if (failed.length) {
        toast.error(t("failedToMove", { count: failed.length }));
      }

      const movedIds = new Set(siteIds.filter((id) => !failed.includes(id)));
      const folderName =
        folderId != null ? (folderById.get(folderId)?.name ?? null) : null;

      if (movedIds.size) {
        setSites((prev) =>
          prev.map((site) =>
            movedIds.has(site.id)
              ? { ...site, folder_id: folderId, folder_name: folderName }
              : site,
          ),
        );
        toast.success(t("movedCount", { count: movedIds.size }));
      }
    },
    [folderById, t],
  );

  const openCreateFolder = useCallback(() => {
    setFolderCreateName("");
    setFolderCreateIcon("folder");
    setFolderCreateColor("#6b7280");
    setFolderCreateOpen(true);
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const name = folderCreateName.trim();
    if (!name) {
      toast.error(t("folderNameRequired"));
      return;
    }
    const res = await fetch("/api/gsc/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        icon: folderCreateIcon,
        color: folderCreateColor,
      }),
    });
    if (!res.ok) {
      const message = (await res.text())?.trim();
      toast.error(message || t("failedCreateFolder"));
      return;
    }
    await loadFolders();
    setFolderCreateOpen(false);
  }, [folderCreateColor, folderCreateIcon, folderCreateName, loadFolders, t]);

  const openRenameFolder = useCallback((folder: Folder) => {
    setFolderRenameId(folder.id);
    setFolderRenameName(folder.name);
    setFolderRenameIcon(folder.icon);
    setFolderRenameColor(folder.color);
    setFolderRenameOpen(true);
  }, []);

  const handleRenameFolder = useCallback(async () => {
    if (!folderRenameId) return;
    const name = folderRenameName.trim();
    if (!name) {
      toast.error(t("folderNameRequired"));
      return;
    }
    const res = await fetch("/api/gsc/folders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        folderId: folderRenameId,
        name,
        icon: folderRenameIcon,
        color: folderRenameColor,
      }),
    });
    if (!res.ok) {
      const message = (await res.text())?.trim();
      toast.error(message || t("failedRenameFolder"));
      return;
    }
    await loadFolders();
    setSites((prev) =>
      prev.map((site) =>
        site.folder_id === folderRenameId
          ? { ...site, folder_name: name }
          : site,
      ),
    );
    setFolderRenameOpen(false);
    setFolderRenameId(null);
  }, [
    folderRenameColor,
    folderRenameIcon,
    folderRenameId,
    folderRenameName,
    loadFolders,
    t,
  ]);

  const openDeleteFolder = useCallback((folder: Folder) => {
    setFolderDeleteId(folder.id);
    setFolderDeleteOpen(true);
  }, []);

  const openRenameFromMenu = useCallback(() => {
    if (!sortedFolders.length) {
      toast.error(t("noFoldersRename"));
      return;
    }
    openRenameFolder(sortedFolders[0]);
  }, [openRenameFolder, sortedFolders, t]);

  const openDeleteFromMenu = useCallback(() => {
    if (!sortedFolders.length) {
      toast.error(t("noFoldersDelete"));
      return;
    }
    openDeleteFolder(sortedFolders[0]);
  }, [openDeleteFolder, sortedFolders, t]);

  const openMoveFromMenu = useCallback(() => {
    if (!visibleSitesSorted.length) {
      toast.error(t("noSitesMove"));
      return;
    }
    setMoveSiteIds([]);
    setMoveFolderId("unassigned");
    setMoveOpen(true);
  }, [t, visibleSitesSorted]);

  const toggleMoveSiteId = useCallback((siteId: string, checked: boolean) => {
    setMoveSiteIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(siteId);
      } else {
        next.delete(siteId);
      }
      return Array.from(next);
    });
  }, []);

  const handleMoveSite = useCallback(async () => {
    if (!moveSiteIds.length) {
      toast.error(t("selectSite"));
      return;
    }
    const folderId = moveFolderId === "unassigned" ? null : moveFolderId;
    await assignSitesToFolder(moveSiteIds, folderId);
    setMoveOpen(false);
    setMoveSiteIds([]);
  }, [assignSitesToFolder, moveFolderId, moveSiteIds, t]);

  const handleDeleteFolder = useCallback(async () => {
    if (!folderDeleteId) return;
    const res = await fetch("/api/gsc/folders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: folderDeleteId }),
    });
    if (!res.ok) {
      const message = (await res.text())?.trim();
      toast.error(message || t("failedDeleteFolder"));
      return;
    }
    await loadFolders();
    setSites((prev) =>
      prev.map((site) =>
        site.folder_id === folderDeleteId
          ? { ...site, folder_id: null, folder_name: null }
          : site,
      ),
    );
    setFolderDeleteOpen(false);
    setFolderDeleteId(null);
  }, [folderDeleteId, loadFolders, t]);

  const syncSites = useCallback(async (targetSites: Site[]) => {
    for (let i = 0; i < targetSites.length; i += 1) {
      const site = targetSites[i];
      const name = displaySiteName(site.gsc_site_url);
      const siteToastId = toast.loading(t("syncingSite", { name }), {
        duration: Infinity,
      });
      const res = await fetch("/api/gsc/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId: site.id }),
      });
      if (!res.ok) {
        const message = (await res.text())?.trim();
        toast.error(
          message
            ? t("syncFailedForSiteWithReason", { name, reason: message })
            : t("syncFailedForSite", { name }),
          {
            id: siteToastId,
          },
        );
        throw new Error(t("syncFailed"));
      }
      await res.json();
      toast.success(t("syncStartedForSite", { name }), {
        id: siteToastId,
      });
    }
  }, [t]);

  const syncOneSite = useCallback(
    async (siteId: string) => {
      const site = sites.find((s) => s.id === siteId);
      if (!site) return;
      await syncSites([site]);
    },
    [sites, syncSites],
  );

  const manualSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const nextSites = await loadSites(true);
      setSites(nextSites);
      await loadCards(nextSites, range, compareRange);
      if (!nextSites.length) return;
      await syncSites(nextSites);
      await loadCards(nextSites, range, compareRange);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("syncFailed");
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  }, [compareRange, loadCards, loadSites, range, syncSites, syncing, t]);

  useEffect(() => {
    Promise.all([loadFolders(), loadSites(), loadPreferences()])
      .catch((err) => {
        const message = err instanceof Error ? err.message : t("loadFailed");
        toast.error(message);
      })
      .finally(() => {
        setPreferencesLoaded(true);
        setIsInitialLoading(false);
      });
  }, [loadFolders, loadPreferences, loadSites, t]);

  useEffect(() => {
    if (!preferencesLoaded || !foldersLoaded) return;
    const validKeys = new Set(["unassigned", ...folders.map((folder) => folder.id)]);
    setOpenFolderKeys((prev) => {
      const next = prev.filter((key) => validKeys.has(key));
      if (next.length === prev.length) return prev;
      return next;
    });
  }, [folders, foldersLoaded, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const timeout = window.setTimeout(() => {
      const persistedGranularity = clampGranularityToAllowed(
        granularity,
        allowedGranularities,
      );
      const payload = {
        compareMode,
        compareSettings,
        folderOpenKeys: normalizeOpenFolderKeys(openFolderKeys),
        granularity: persistedGranularity,
        preset,
        range,
        compareRange,
      };
      void fetch("/api/gsc/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (!res.ok) {
          throw new Error(await res.text());
        }
      }).catch((err) => {
        const message = err instanceof Error ? err.message : t("saveFailed");
        toast.error(message);
      });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    compareMode,
    compareRange,
    compareSettings,
    allowedGranularities,
    granularity,
    openFolderKeys,
    preferencesLoaded,
    preset,
    range,
    t,
  ]);

  const handleOpenFolderKeysChange = useCallback((value: string | string[]) => {
    setOpenFolderKeys(normalizeOpenFolderKeys(Array.isArray(value) ? value : [value]));
  }, []);

  useEffect(() => {
    if (sites.length > 0) {
      loadCards(sites, range, compareRange).catch((err) => {
        const message = err instanceof Error ? err.message : t("loadFailed");
        toast.error(message);
      });
    }
  }, [compareRange, loadCards, range, sites, t]);

  useEffect(() => {
    const handleManualSync = () => {
      void manualSync();
    };
    window.addEventListener("gsc:sync-all", handleManualSync);
    return () => {
      window.removeEventListener("gsc:sync-all", handleManualSync);
    };
  }, [manualSync]);

  const applyRange = useCallback((nextRange: DateRange) => {
    setRange(nextRange);
  }, []);

  const handleCalendarSelect = useCallback(
    (nextRange: CalendarRange | undefined) => {
      if (!nextRange) {
        setCalendarRange(undefined);
        return;
      }
      setCalendarRange(nextRange);
      if (nextRange.from && nextRange.to) {
        applyRange({
          start: toYmd(nextRange.from),
          end: toYmd(nextRange.to),
        });
      }
    },
    [applyRange],
  );

  const handleCompareCalendarSelect = useCallback(
    (nextRange: CalendarRange | undefined) => {
      if (!nextRange) {
        setCompareCalendarRange(undefined);
        return;
      }
      setCompareCalendarRange(nextRange);
      if (nextRange.from && nextRange.to) {
        setCompareMode("custom");
      }
    },
    [],
  );

  return (
    <div
      className="flex w-full flex-col gap-6"
      onMouseMove={(e) => {
        if (e.target === e.currentTarget) setActiveId(null);
      }}
    >
      <DashboardToolbar
        domainQuery={domainQuery}
        onDomainQueryChange={setDomainQuery}
        searchInputRef={searchInputRef}
        sortId={sortId}
        onSortChange={setSortId}
        currentSort={currentSort}
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
        onOpenCreateFolder={openCreateFolder}
        onOpenMoveFromMenu={openMoveFromMenu}
        onOpenRenameFromMenu={openRenameFromMenu}
        onOpenDeleteFromMenu={openDeleteFromMenu}
      />
      {Object.values(cards).some((card) => card?.retention?.partiallyOutside) ? (
        <p className="text-xs text-muted-foreground">
          {t("retentionWarning")}
        </p>
      ) : null}
      <div
        className="flex flex-col gap-6"
        onMouseMove={(e) => {
          if (e.target === e.currentTarget) setActiveId(null);
        }}
      >
        <Accordion
          type="multiple"
          value={visibleOpenFolderKeys}
          onValueChange={handleOpenFolderKeysChange}
          className="w-full space-y-4"
        >
          {groupedSites.map((group) => (
            <AccordionItem
              key={group.key}
              value={group.key}
              className="relative z-0 hover:z-50 focus-within:z-50 data-[state=open]:z-10"
            >
              <AccordionTrigger className="py-4">
                <div className="flex items-center gap-3">
                  {group.folder ? (
                    <span
                      className="inline-flex size-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${group.folder.color}22` }}
                    >
                      <FolderGlyph
                        iconId={group.folder.icon}
                        className="size-4"
                        color={group.folder.color}
                      />
                    </span>
                  ) : (
                    <span
                      className="inline-flex size-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: "#6b728022" }}
                    >
                      <FolderOpen className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="text-base font-semibold tracking-tight">
                    {group.label}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {group.allSiteIds.length}
                  </span>
                </div>
                <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted/70">
                  <CaretDown className="size-4 text-muted-foreground transition-transform" />
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {group.allSiteIds.length === 0 ? (
                  <div className="rounded-lg bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
                    {t("noSitesInFolder")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <FolderMasterCard
                      label={group.label}
                      icon={
                        group.folder
                          ? { id: group.folder.icon, color: group.folder.color }
                          : null
                      }
                      card={masterCardsByGroupKey[group.key] ?? null}
                      granularity={granularity}
                      compareSettings={compareSettings}
                      compareEnabled={compareMode !== "disabled"}
                      chartId={`master:${group.key}`}
                    />
                    {group.visibleSites.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        {group.visibleSites.map((site) => (
                          <SiteCard
                            key={site.id}
                            site={site}
                            card={cards[site.id]}
                            granularity={granularity}
                            compareSettings={compareSettings}
                            compareEnabled={compareMode !== "disabled"}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {isInitialLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("noSitesYet")}
          </div>
        ) : filteredSites.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("noDomainsMatch", { query: domainQuery.trim() })}
          </div>
        ) : null}
      </div>
      <FolderDialogs
        folders={folders}
        sortedFolders={sortedFolders}
        sortedSites={visibleSitesSorted}
        folderCreateOpen={folderCreateOpen}
        onFolderCreateOpenChange={setFolderCreateOpen}
        folderCreateName={folderCreateName}
        onFolderCreateNameChange={setFolderCreateName}
        folderCreateIcon={folderCreateIcon}
        onFolderCreateIconChange={setFolderCreateIcon}
        folderCreateColor={folderCreateColor}
        onFolderCreateColorChange={setFolderCreateColor}
        onCreateFolder={handleCreateFolder}
        folderRenameOpen={folderRenameOpen}
        onFolderRenameOpenChange={setFolderRenameOpen}
        folderRenameId={folderRenameId}
        onFolderRenameIdChange={setFolderRenameId}
        folderRenameName={folderRenameName}
        onFolderRenameNameChange={setFolderRenameName}
        folderRenameIcon={folderRenameIcon}
        onFolderRenameIconChange={setFolderRenameIcon}
        folderRenameColor={folderRenameColor}
        onFolderRenameColorChange={setFolderRenameColor}
        onRenameFolder={handleRenameFolder}
        folderDeleteOpen={folderDeleteOpen}
        onFolderDeleteOpenChange={setFolderDeleteOpen}
        folderDeleteId={folderDeleteId}
        onFolderDeleteIdChange={setFolderDeleteId}
        onDeleteFolder={handleDeleteFolder}
        moveOpen={moveOpen}
        onMoveOpenChange={setMoveOpen}
        moveSiteIds={moveSiteIds}
        onMoveSiteIdsChange={setMoveSiteIds}
        onToggleMoveSiteId={toggleMoveSiteId}
        moveFolderId={moveFolderId}
        onMoveFolderIdChange={setMoveFolderId}
        onMoveSite={handleMoveSite}
      />
    </div>
  );
}

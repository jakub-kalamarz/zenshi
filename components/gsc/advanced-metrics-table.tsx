"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CaretDown, CaretUp, DotsThree, Hash, Infinity, MagnifyingGlass, Minus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { metricConfig } from "@/lib/metrics";
import { cn } from "@/lib/utils";

export type AdvancedMetricsBaseRow = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  compareClicks?: number | null;
  compareImpressions?: number | null;
  compareCtr?: number | null;
  comparePosition?: number | null;
};

type MetricId = "clicks" | "impressions" | "ctr" | "position";

type RangeFilterValue = {
  min?: number;
  max?: number;
};

type MetricFilterInputs = Record<MetricId, { min: string; max: string }>;

type TableRow<T> = T & {
  __key: string;
  __displayKey: string;
};

type AdvancedMetricsTableProps<T extends AdvancedMetricsBaseRow> = {
  rows: T[];
  compareEnabled: boolean;
  dimensionLabel: string;
  emptyStateText: string;
  getKey: (row: T) => string;
  formatKey?: (key: string, row: T) => string;
  renderKey?: (args: { key: string; displayKey: string; row: T }) => ReactNode;
  renderContextMenuItems?: (row: T) => ReactNode;
  searchPlaceholder?: string;
};

const initialMetricInputs: MetricFilterInputs = {
  clicks: { min: "", max: "" },
  impressions: { min: "", max: "" },
  ctr: { min: "", max: "" },
  position: { min: "", max: "" },
};

function formatNumber(value: number, locale: string) {
  return Intl.NumberFormat(locale).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPosition(value: number) {
  return value.toFixed(1);
}

function parseInputNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function DeltaBadge({
  current,
  compare,
  invertColor,
}: {
  current: number;
  compare: number | null | undefined;
  invertColor?: boolean;
}) {
  if (compare == null) return null;
  const delta = current - compare;
  if (delta === 0) return <span className="text-muted-foreground">0%</span>;
  const isInfinite = compare === 0;
  const percent = isInfinite ? 0 : Math.abs((delta / compare) * 100);
  const positive = invertColor ? delta < 0 : delta > 0;
  const colorClass = positive ? "text-emerald-500" : "text-rose-500";
  const Icon = positive ? CaretUp : CaretDown;

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", colorClass)}>
      <Icon className="size-3" weight="bold" />
      {isInfinite ? <Infinity className="size-3" weight="bold" /> : `${percent.toFixed(0)}%`}
    </span>
  );
}

function SortMarker({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <CaretUp className="size-3" weight="bold" />;
  if (sorted === "desc") return <CaretDown className="size-3" weight="bold" />;
  return <Minus className="size-3 text-muted-foreground" weight="bold" />;
}

function MetricLabel({ metric, label }: { metric: MetricId; label: string }) {
  const config = metricConfig[metric];
  const Icon = config.Icon;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn("size-3.5", config.className)} weight="bold" />
      {label}
    </span>
  );
}

function isMetricId(value: string): value is MetricId {
  return value === "clicks" || value === "impressions" || value === "ctr" || value === "position";
}

function KeyValueWithTooltip({
  value,
  children,
  className,
  onClick,
}: {
  value: string;
  children: ReactNode;
  className: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={className} title={value} onClick={onClick}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[40rem] break-all">
        {value}
      </TooltipContent>
    </Tooltip>
  );
}

export function AdvancedMetricsTable<T extends AdvancedMetricsBaseRow>({
  rows,
  compareEnabled,
  dimensionLabel,
  emptyStateText,
  getKey,
  formatKey,
  renderKey,
  renderContextMenuItems,
  searchPlaceholder,
}: AdvancedMetricsTableProps<T>) {
  const locale = useLocale();
  const t = useTranslations("table");
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "clicks", desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [metricInputs, setMetricInputs] = useState<MetricFilterInputs>(initialMetricInputs);

  const metricLabels: Record<MetricId, string> = useMemo(
    () => ({
      clicks: t("clicks"),
      impressions: t("impressions"),
      ctr: t("ctr"),
      position: t("position"),
    }),
    [t],
  );

  const data = useMemo<TableRow<T>[]>(() => {
    return rows.map((row) => {
      const key = getKey(row);
      return {
        ...row,
        __key: key,
        __displayKey: formatKey ? formatKey(key, row) : key,
      };
    });
  }, [formatKey, getKey, rows]);

  const copyValue = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied", { label: dimensionLabel }));
    } catch {
      toast.error(t("copyFailed"));
    }
  }, [dimensionLabel, t]);

  const rangeFilter = useCallback<FilterFn<TableRow<T>>>((row, columnId, value) => {
    const raw = row.getValue(columnId);
    const numeric = typeof raw === "number" ? raw : Number(raw ?? 0);
    const range = value as RangeFilterValue | undefined;
    if (!range) return true;
    if (range.min != null && numeric < range.min) return false;
    if (range.max != null && numeric > range.max) return false;
    return true;
  }, []);

  const updateMetricFilter = (metric: MetricId, bound: "min" | "max", value: string) => {
    setMetricInputs((prev) => ({
      ...prev,
      [metric]: {
        ...prev[metric],
        [bound]: value,
      },
    }));

    setColumnFilters((prev) => {
      const withoutMetric = prev.filter((item) => item.id !== metric);
      const min = parseInputNumber(bound === "min" ? value : metricInputs[metric].min);
      const max = parseInputNumber(bound === "max" ? value : metricInputs[metric].max);

      if (min == null && max == null) return withoutMetric;
      return [...withoutMetric, { id: metric, value: { min, max } as RangeFilterValue }];
    });
  };

  const columns = useMemo<ColumnDef<TableRow<T>>[]>(() => {
    return [
      {
        id: "key",
        accessorFn: (row) => row.__key,
        header: dimensionLabel,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <KeyValueWithTooltip
              value={row.original.__key}
              className="w-full min-w-0 truncate text-left font-medium hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                copyValue(row.original.__key);
              }}
            >
              {renderKey
                ? renderKey({
                    key: row.original.__key,
                    displayKey: row.original.__displayKey,
                    row: row.original,
                  })
                : row.original.__displayKey}
            </KeyValueWithTooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("actionsAria", { label: dimensionLabel })}
                  onClick={(event) => event.stopPropagation()}
                >
                  <DotsThree className="size-3.5" weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="!w-44">
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    copyValue(row.original.__key);
                  }}
                >
                  {t("copyValue")}
                </DropdownMenuItem>
                {renderContextMenuItems ? (
                  <>
                    <DropdownMenuSeparator />
                    {renderContextMenuItems(row.original)}
                  </>
                ) : (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled>{t("moreActionsSoon")}</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        enableHiding: false,
        sortingFn: (a, b) => a.original.__key.localeCompare(b.original.__key),
      },
      {
        id: "clicks",
        accessorFn: (row) => row.clicks,
        header: () => <MetricLabel metric="clicks" label={metricLabels.clicks} />,
        filterFn: rangeFilter,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            <div>{formatNumber(row.original.clicks, locale)}</div>
            {compareEnabled ? (
              <DeltaBadge current={row.original.clicks} compare={row.original.compareClicks} />
            ) : null}
          </div>
        ),
      },
      {
        id: "impressions",
        accessorFn: (row) => row.impressions,
        header: () => <MetricLabel metric="impressions" label={metricLabels.impressions} />,
        filterFn: rangeFilter,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            <div>{formatNumber(row.original.impressions, locale)}</div>
            {compareEnabled ? (
              <DeltaBadge
                current={row.original.impressions}
                compare={row.original.compareImpressions}
              />
            ) : null}
          </div>
        ),
      },
      {
        id: "ctr",
        accessorFn: (row) => row.ctr,
        header: () => <MetricLabel metric="ctr" label={metricLabels.ctr} />,
        filterFn: rangeFilter,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            <div>{formatPercent(row.original.ctr)}</div>
            {compareEnabled ? (
              <DeltaBadge current={row.original.ctr} compare={row.original.compareCtr} />
            ) : null}
          </div>
        ),
      },
      {
        id: "position",
        accessorFn: (row) => row.position,
        header: () => <MetricLabel metric="position" label={metricLabels.position} />,
        filterFn: rangeFilter,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            <div>{formatPosition(row.original.position)}</div>
            {compareEnabled ? (
              <DeltaBadge
                current={row.original.position}
                compare={row.original.comparePosition}
                invertColor
              />
            ) : null}
          </div>
        ),
      },
    ];
  }, [compareEnabled, copyValue, dimensionLabel, locale, metricLabels, rangeFilter, renderKey, t]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      columnFilters,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: (row, _columnId, value) => {
      const search = String(value ?? "").trim().toLowerCase();
      if (!search) return true;
      return (
        row.original.__key.toLowerCase().includes(search) ||
        row.original.__displayKey.toLowerCase().includes(search)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  });

  const pagedRows = table.getPaginationRowModel().rows;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/45 px-4 py-6 text-center text-sm text-muted-foreground">
        <Hash className="size-4 opacity-50" weight="bold" />
        {emptyStateText}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="relative md:max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(event) => {
              setGlobalFilter(event.target.value);
              table.setPageIndex(0);
            }}
            placeholder={searchPlaceholder ?? t("searchPlaceholder", { label: dimensionLabel.toLowerCase() })}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <span className="inline-flex items-center gap-1.5">
                  <DotsThree className="size-3.5" weight="bold" />
                  {t("filters")}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="!w-64">
              <DropdownMenuLabel>{t("metricRanges")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(metricLabels) as MetricId[]).map((metric) => (
                <div key={metric} className="space-y-1 px-1 py-1.5">
                  <div className="text-xs text-muted-foreground">
                    <MetricLabel metric={metric} label={metricLabels[metric]} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={metricInputs[metric].min}
                      onChange={(event) => {
                        updateMetricFilter(metric, "min", event.target.value);
                        table.setPageIndex(0);
                      }}
                      placeholder={t("min")}
                      className="h-7"
                    />
                    <Input
                      value={metricInputs[metric].max}
                      onChange={(event) => {
                        updateMetricFilter(metric, "max", event.target.value);
                        table.setPageIndex(0);
                      }}
                      placeholder={t("max")}
                      className="h-7"
                    />
                  </div>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="size-3.5" weight="bold" />
                  {t("columns")}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="!w-44">
              <DropdownMenuLabel>{t("toggleColumns")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
                  >
                    {isMetricId(column.id) ? (
                      <MetricLabel metric={column.id} label={metricLabels[column.id]} />
                    ) : (
                      column.id
                    )}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>

      <div className="hidden md:block rounded-lg border border-border/60">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/35">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "sticky top-0 z-10 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/65",
                        header.column.id === "key" ? "w-[42%] text-left" : "text-right",
                        canSort ? "cursor-pointer select-none" : "",
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div
                        className={cn(
                          "inline-flex items-center gap-1",
                          header.column.id === "key" ? "justify-start" : "justify-end",
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {canSort ? <SortMarker sorted={header.column.getIsSorted()} /> : null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  <span className="inline-flex flex-col items-center gap-1.5">
                    <MagnifyingGlass className="size-4 opacity-40" />
                    {t("noResults")}
                  </span>
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr key={row.id} className="border-t border-border/50">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-3 py-2 align-top",
                        cell.column.id === "key" ? "text-left" : "text-right",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 md:hidden">
        {pagedRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
            <MagnifyingGlass className="size-4 opacity-40" />
            {t("noResults")}
          </div>
        ) : (
          pagedRows.map((row) => (
            <article key={row.id} className="rounded-lg border border-border/60 bg-card px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <KeyValueWithTooltip
                  value={row.original.__key}
                  className="max-w-[82%] truncate text-left text-sm font-medium"
                  onClick={() => copyValue(row.original.__key)}
                >
                  {renderKey
                    ? renderKey({
                        key: row.original.__key,
                        displayKey: row.original.__displayKey,
                        row: row.original,
                      })
                    : row.original.__displayKey}
                </KeyValueWithTooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label={`${dimensionLabel} actions`}>
                      <DotsThree className="size-3.5" weight="bold" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="!w-44">
                    <DropdownMenuItem onClick={() => copyValue(row.original.__key)}>
                      {t("copyValue")}
                    </DropdownMenuItem>
                    {renderContextMenuItems ? (
                      <>
                        <DropdownMenuSeparator />
                        {renderContextMenuItems(row.original)}
                      </>
                    ) : (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled>{t("moreActionsSoon")}</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="text-muted-foreground">
                    <MetricLabel metric="clicks" label={metricLabels.clicks} />
                  </div>
                  <div className="text-sm font-medium tabular-nums">{formatNumber(row.original.clicks, locale)}</div>
                  {compareEnabled ? (
                    <DeltaBadge current={row.original.clicks} compare={row.original.compareClicks} />
                  ) : null}
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="text-muted-foreground">
                    <MetricLabel metric="impressions" label={metricLabels.impressions} />
                  </div>
                  <div className="text-sm font-medium tabular-nums">
                    {formatNumber(row.original.impressions, locale)}
                  </div>
                  {compareEnabled ? (
                    <DeltaBadge
                      current={row.original.impressions}
                      compare={row.original.compareImpressions}
                    />
                  ) : null}
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="text-muted-foreground">
                    <MetricLabel metric="ctr" label={metricLabels.ctr} />
                  </div>
                  <div className="text-sm font-medium tabular-nums">{formatPercent(row.original.ctr)}</div>
                  {compareEnabled ? (
                    <DeltaBadge current={row.original.ctr} compare={row.original.compareCtr} />
                  ) : null}
                </div>
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="text-muted-foreground">
                    <MetricLabel metric="position" label={metricLabels.position} />
                  </div>
                  <div className="text-sm font-medium tabular-nums">
                    {formatPosition(row.original.position)}
                  </div>
                  {compareEnabled ? (
                    <DeltaBadge
                      current={row.original.position}
                      compare={row.original.comparePosition}
                      invertColor
                    />
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {t("pageOf", {
            page: table.getState().pagination.pageIndex + 1,
            total: Math.max(table.getPageCount(), 1),
          })}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${dimensionLabel}-page-size`} className="text-xs text-muted-foreground">
            {t("rows")}
          </label>
          <select
            id={`${dimensionLabel}-page-size`}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
            value={table.getState().pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {t("next")}
          </Button>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}

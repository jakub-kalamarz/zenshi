"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  GoogleLogo,
  Hash,
  MagnifyingGlass,
  Star,
  TrendDown,
  TrendUp,
} from "@phosphor-icons/react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdvancedMetricsTable,
  type AdvancedMetricsBaseRow,
} from "@/components/gsc/advanced-metrics-table";
import { segmentRowsByClickDelta } from "@/components/gsc/table-segments";

export type QueryRow = AdvancedMetricsBaseRow & {
  query: string;
};

type QueriesTableProps = {
  queries: QueryRow[];
  compareEnabled?: boolean;
};

export function QueriesTable({ queries, compareEnabled = false }: QueriesTableProps) {
  const t = useTranslations("tables");
  const [tab, setTab] = useState("all");

  const segments = useMemo(() => segmentRowsByClickDelta(queries), [queries]);
  const renderTopQuery = ({
    displayKey,
    row,
  }: {
    displayKey: string;
    row: QueryRow;
  }) =>
    row.position <= 1 ? (
      <span className="inline-flex items-center gap-1">
        <Star className="size-3.5 text-amber-500" weight="fill" />
        {displayKey}
      </span>
    ) : (
      displayKey
    );
  const renderQueryMenuItems = (row: QueryRow) => (
    <DropdownMenuItem
      onClick={() => {
        const url = `https://www.google.com/search?q=${encodeURIComponent(row.query)}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }}
    >
      <GoogleLogo className="size-3.5" weight="bold" />
      {t("searchInGoogle")}
    </DropdownMenuItem>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MagnifyingGlass className="size-4 text-metric-clicks" weight="bold" />
          {t("queries")}
        </h2>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">
            <span className="inline-flex items-center gap-1.5">
              <Hash className="size-3.5" weight="bold" />
              {t("all")} ({segments.all.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="growing">
            <span className="inline-flex items-center gap-1.5">
              <TrendUp className="size-3.5 text-emerald-500" weight="bold" />
              {t("growing")} ({segments.growing.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="decaying">
            <span className="inline-flex items-center gap-1.5">
              <TrendDown className="size-3.5 text-rose-500" weight="bold" />
              {t("decaying")} ({segments.decaying.length})
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <AdvancedMetricsTable
            rows={segments.all}
            compareEnabled={compareEnabled}
            dimensionLabel={t("query")}
            emptyStateText={t("noQueries")}
            getKey={(row) => row.query}
            renderKey={renderTopQuery}
            renderContextMenuItems={renderQueryMenuItems}
          />
        </TabsContent>
        <TabsContent value="growing">
          <AdvancedMetricsTable
            rows={segments.growing}
            compareEnabled={compareEnabled}
            dimensionLabel={t("query")}
            emptyStateText={t("noGrowingQueries")}
            getKey={(row) => row.query}
            renderKey={renderTopQuery}
            renderContextMenuItems={renderQueryMenuItems}
          />
        </TabsContent>
        <TabsContent value="decaying">
          <AdvancedMetricsTable
            rows={segments.decaying}
            compareEnabled={compareEnabled}
            dimensionLabel={t("query")}
            emptyStateText={t("noDecayingQueries")}
            getKey={(row) => row.query}
            renderKey={renderTopQuery}
            renderContextMenuItems={renderQueryMenuItems}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

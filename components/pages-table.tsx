"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { GlobeHemisphereWest, Hash, TrendDown, TrendUp } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdvancedMetricsTable,
  type AdvancedMetricsBaseRow,
} from "@/components/gsc/advanced-metrics-table";
import { segmentRowsByClickDelta } from "@/components/gsc/table-segments";

export type PageRow = AdvancedMetricsBaseRow & {
  page: string;
};

type PagesTableProps = {
  pages: PageRow[];
  compareEnabled?: boolean;
};

function extractPath(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    return url.pathname + url.search;
  } catch {
    return pageUrl;
  }
}

export function PagesTable({ pages, compareEnabled = false }: PagesTableProps) {
  const t = useTranslations("tables");
  const [tab, setTab] = useState("all");

  const segments = useMemo(() => segmentRowsByClickDelta(pages), [pages]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <GlobeHemisphereWest className="size-4 text-metric-impressions" weight="bold" />
          {t("pages")}
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
            dimensionLabel={t("page")}
            emptyStateText={t("noPages")}
            getKey={(row) => row.page}
            formatKey={(value) => extractPath(value)}
          />
        </TabsContent>
        <TabsContent value="growing">
          <AdvancedMetricsTable
            rows={segments.growing}
            compareEnabled={compareEnabled}
            dimensionLabel={t("page")}
            emptyStateText={t("noGrowingPages")}
            getKey={(row) => row.page}
            formatKey={(value) => extractPath(value)}
          />
        </TabsContent>
        <TabsContent value="decaying">
          <AdvancedMetricsTable
            rows={segments.decaying}
            compareEnabled={compareEnabled}
            dimensionLabel={t("page")}
            emptyStateText={t("noDecayingPages")}
            getKey={(row) => row.page}
            formatKey={(value) => extractPath(value)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

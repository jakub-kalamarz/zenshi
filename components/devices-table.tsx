"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Desktop,
  DeviceMobile,
  DeviceTablet,
  DotsThreeOutline,
  Hash,
} from "@phosphor-icons/react";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AdvancedMetricsTable,
  type AdvancedMetricsBaseRow,
} from "@/components/gsc/advanced-metrics-table";

export type DeviceRow = AdvancedMetricsBaseRow & {
  device: string;
};

type DevicesTableProps = {
  devices: DeviceRow[];
  compareEnabled?: boolean;
};

export function DevicesTable({ devices, compareEnabled = false }: DevicesTableProps) {
  const t = useTranslations("tables");
  const tTable = useTranslations("table");
  const tDevice = useTranslations("device");
  const locale = useLocale();
  const [tab, setTab] = useState("all");

  const rows = useMemo<DeviceRow[]>(() => {
    const byDevice = new Map(devices.map((row) => [row.device, row]));
    return ["mobile", "desktop", "tablet", "other"].map((device) => {
      const row = byDevice.get(device);
      const clicks = row?.clicks ?? 0;
      const impressions = row?.impressions ?? 0;
      return {
        device,
        clicks,
        impressions,
        ctr: row?.ctr ?? (impressions > 0 ? clicks / impressions : 0),
        position: row?.position ?? 0,
        compareClicks: row?.compareClicks ?? null,
        compareImpressions: row?.compareImpressions ?? null,
        compareCtr: row?.compareCtr ?? null,
        comparePosition: row?.comparePosition ?? null,
      };
    });
  }, [devices]);

  const hasData = useMemo(() => rows.some((row) => row.clicks > 0 || row.impressions > 0), [rows]);
  const allRows = useMemo(() => rows.filter((row) => row.clicks > 0 || row.impressions > 0), [rows]);
  const mobileRows = useMemo(() => rows.filter((row) => row.device === "mobile" && rowHasData(row)), [rows]);
  const desktopRows = useMemo(() => rows.filter((row) => row.device === "desktop" && rowHasData(row)), [rows]);
  const tabletRows = useMemo(() => rows.filter((row) => row.device === "tablet" && rowHasData(row)), [rows]);
  const otherRows = useMemo(() => rows.filter((row) => row.device === "other" && rowHasData(row)), [rows]);
  const totalClicks = useMemo(() => allRows.reduce((sum, row) => sum + row.clicks, 0), [allRows]);
  const pieData = useMemo(
    () =>
      allRows.map((row) => ({
        name: deviceLabel(row.device, tDevice),
        value: row.clicks,
        fill: deviceColor(row.device),
      })),
    [allRows, tDevice],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Desktop className="size-4 text-metric-position" weight="bold" />
          {t("devices")}
        </h2>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">
            <span className="inline-flex items-center gap-1.5">
              <Hash className="size-3.5" weight="bold" />
              {t("all")} ({allRows.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="mobile">
            <span className="inline-flex items-center gap-1.5">
              <DeviceMobile className="size-3.5" weight="bold" />
              {tDevice("mobile")} ({mobileRows.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="desktop">
            <span className="inline-flex items-center gap-1.5">
              <Desktop className="size-3.5" weight="bold" />
              {tDevice("desktop")} ({desktopRows.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="tablet">
            <span className="inline-flex items-center gap-1.5">
              <DeviceTablet className="size-3.5" weight="bold" />
              {tDevice("tablet")} ({tabletRows.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="other">
            <span className="inline-flex items-center gap-1.5">
              <DotsThreeOutline className="size-3.5" weight="bold" />
              {tDevice("other")} ({otherRows.length})
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <div className="flex flex-col gap-4">
              {hasData ? (
                <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
                  <div className="relative h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          formatter={(value: number | string | undefined, name: string | number | undefined) => [
                            Intl.NumberFormat(locale).format(Number(value ?? 0)),
                            String(name ?? ""),
                          ]}
                        />
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={78}
                          strokeWidth={3}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-xl font-semibold">{Intl.NumberFormat(locale).format(totalClicks)}</p>
                      <p className="text-xs text-muted-foreground">{tTable("clicks")}</p>
                    </div>
                  </div>
                  <div className="grid content-start gap-2 sm:grid-cols-2">
                    {allRows.map((row) => {
                      const share = totalClicks > 0 ? (row.clicks / totalClicks) * 100 : 0;
                      return (
                        <div key={row.device} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <span className="size-2 rounded-full" style={{ backgroundColor: deviceColor(row.device) }} />
                            <DeviceIcon device={row.device} />
                            {deviceLabel(row.device, tDevice)}
                          </span>
                          <span className="text-muted-foreground">
                            {Intl.NumberFormat(locale).format(row.clicks)} ({share.toFixed(1)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <AdvancedMetricsTable
              rows={hasData ? allRows : []}
              compareEnabled={compareEnabled}
              dimensionLabel={t("device")}
              emptyStateText={t("noDevices")}
              getKey={(row) => row.device}
              formatKey={(value) => deviceLabel(value, tDevice)}
              renderKey={({ row, displayKey }) => (
                <span className="inline-flex items-center gap-1.5">
                  <DeviceIcon device={row.device} />
                  {displayKey}
                </span>
              )}
            />
          </div>
        </TabsContent>
        <TabsContent value="mobile">
          <AdvancedMetricsTable
            rows={mobileRows}
            compareEnabled={compareEnabled}
            dimensionLabel={t("device")}
            emptyStateText={t("noDevices")}
            getKey={(row) => row.device}
            formatKey={(value) => deviceLabel(value, tDevice)}
            renderKey={({ row, displayKey }) => (
              <span className="inline-flex items-center gap-1.5">
                <DeviceIcon device={row.device} />
                {displayKey}
              </span>
            )}
          />
        </TabsContent>
        <TabsContent value="desktop">
          <AdvancedMetricsTable
            rows={desktopRows}
            compareEnabled={compareEnabled}
            dimensionLabel={t("device")}
            emptyStateText={t("noDevices")}
            getKey={(row) => row.device}
            formatKey={(value) => deviceLabel(value, tDevice)}
            renderKey={({ row, displayKey }) => (
              <span className="inline-flex items-center gap-1.5">
                <DeviceIcon device={row.device} />
                {displayKey}
              </span>
            )}
          />
        </TabsContent>
        <TabsContent value="tablet">
          <AdvancedMetricsTable
            rows={tabletRows}
            compareEnabled={compareEnabled}
            dimensionLabel={t("device")}
            emptyStateText={t("noDevices")}
            getKey={(row) => row.device}
            formatKey={(value) => deviceLabel(value, tDevice)}
            renderKey={({ row, displayKey }) => (
              <span className="inline-flex items-center gap-1.5">
                <DeviceIcon device={row.device} />
                {displayKey}
              </span>
            )}
          />
        </TabsContent>
        <TabsContent value="other">
          <AdvancedMetricsTable
            rows={otherRows}
            compareEnabled={compareEnabled}
            dimensionLabel={t("device")}
            emptyStateText={t("noDevices")}
            getKey={(row) => row.device}
            formatKey={(value) => deviceLabel(value, tDevice)}
            renderKey={({ row, displayKey }) => (
              <span className="inline-flex items-center gap-1.5">
                <DeviceIcon device={row.device} />
                {displayKey}
              </span>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function deviceLabel(
  device: string,
  t: (key: "mobile" | "desktop" | "tablet" | "other") => string,
) {
  if (device === "mobile") return t("mobile");
  if (device === "desktop") return t("desktop");
  if (device === "tablet") return t("tablet");
  return t("other");
}

function rowHasData(row: DeviceRow) {
  return row.clicks > 0 || row.impressions > 0;
}

function DeviceIcon({ device }: { device: string }) {
  if (device === "mobile") return <DeviceMobile className="size-3.5 text-metric-clicks" weight="bold" />;
  if (device === "desktop") return <Desktop className="size-3.5 text-metric-impressions" weight="bold" />;
  if (device === "tablet") return <DeviceTablet className="size-3.5 text-metric-ctr" weight="bold" />;
  return <DotsThreeOutline className="size-3.5 text-metric-position" weight="bold" />;
}

function deviceColor(device: string) {
  if (device === "mobile") return "var(--color-chart-1)";
  if (device === "desktop") return "var(--color-chart-2)";
  if (device === "tablet") return "var(--color-chart-3)";
  return "var(--color-chart-5)";
}

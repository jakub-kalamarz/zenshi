"use client";

import { GlobeHemisphereWest, Camera, LinkSimple } from "@phosphor-icons/react";
import { SiteCard, type Site, type SiteCardData } from "@/components/site-card";
import { MetricGrid } from "@/components/metric-grid";
import { SiteCardChart } from "@/components/site-card-chart";
import { PagesTable, type PageRow } from "@/components/pages-table";
import { QueriesTable, type QueryRow } from "@/components/queries-table";
import { DevicesTable, type DeviceRow } from "@/components/devices-table";
import { Separator } from "@/components/ui/separator";

const wikipediaSite: Site = {
  id: "wikipedia-preview",
  gsc_site_url: "https://www.wikipedia.org",
  enabled: 1,
  created_at: "2026-03-01T00:00:00.000Z",
  folder_id: "knowledge-sites",
  folder_name: "Knowledge",
};

const wikipediaCard: SiteCardData = {
  total: {
    clicks: 1483200,
    impressions: 28745000,
    ctr: 0.0516,
    position: 3.8,
  },
  compareTotal: {
    clicks: 1369400,
    impressions: 26182000,
    ctr: 0.0523,
    position: 4.2,
  },
  series: [
    { date: "2026-03-01", clicks: 44200, impressions: 864000, ctr: 0.0512, position: 4.3 },
    { date: "2026-03-02", clicks: 45850, impressions: 892000, ctr: 0.0514, position: 4.2 },
    { date: "2026-03-03", clicks: 47100, impressions: 915500, ctr: 0.0514, position: 4.1 },
    { date: "2026-03-04", clicks: 49680, impressions: 949000, ctr: 0.0523, position: 4.0 },
    { date: "2026-03-05", clicks: 50920, impressions: 971500, ctr: 0.0524, position: 3.9 },
    { date: "2026-03-06", clicks: 53340, impressions: 1002000, ctr: 0.0532, position: 3.8 },
    { date: "2026-03-07", clicks: 52120, impressions: 988500, ctr: 0.0527, position: 3.8 },
    { date: "2026-03-08", clicks: 54860, impressions: 1041000, ctr: 0.0527, position: 3.7 },
    { date: "2026-03-09", clicks: 56310, impressions: 1068000, ctr: 0.0527, position: 3.7 },
    { date: "2026-03-10", clicks: 57790, impressions: 1096500, ctr: 0.0527, position: 3.6 },
    { date: "2026-03-11", clicks: 59420, impressions: 1129000, ctr: 0.0526, position: 3.6 },
    { date: "2026-03-12", clicks: 60340, impressions: 1153000, ctr: 0.0523, position: 3.5 },
    { date: "2026-03-13", clicks: 62110, impressions: 1184000, ctr: 0.0525, position: 3.5 },
    { date: "2026-03-14", clicks: 63890, impressions: 1212000, ctr: 0.0527, position: 3.4 },
    { date: "2026-03-15", clicks: 65440, impressions: 1245000, ctr: 0.0526, position: 3.4 },
    { date: "2026-03-16", clicks: 67030, impressions: 1271000, ctr: 0.0527, position: 3.3 },
    { date: "2026-03-17", clicks: 68820, impressions: 1304000, ctr: 0.0528, position: 3.3 },
    { date: "2026-03-18", clicks: 70140, impressions: 1330000, ctr: 0.0527, position: 3.2 },
    { date: "2026-03-19", clicks: 71420, impressions: 1356500, ctr: 0.0527, position: 3.2 },
    { date: "2026-03-20", clicks: 72810, impressions: 1380000, ctr: 0.0528, position: 3.2 },
    { date: "2026-03-21", clicks: 73900, impressions: 1406000, ctr: 0.0526, position: 3.1 },
    { date: "2026-03-22", clicks: 75220, impressions: 1431000, ctr: 0.0526, position: 3.1 },
    { date: "2026-03-23", clicks: 76840, impressions: 1462000, ctr: 0.0526, position: 3.1 },
    { date: "2026-03-24", clicks: 77920, impressions: 1489000, ctr: 0.0523, position: 3.0 },
    { date: "2026-03-25", clicks: 79210, impressions: 1515000, ctr: 0.0523, position: 3.0 },
    { date: "2026-03-26", clicks: 80440, impressions: 1542000, ctr: 0.0522, position: 2.9 },
    { date: "2026-03-27", clicks: 81980, impressions: 1570000, ctr: 0.0522, position: 2.9 },
    { date: "2026-03-28", clicks: 83520, impressions: 1604000, ctr: 0.0521, position: 2.8 },
  ],
  compareSeries: [
    { date: "2026-02-01", clicks: 40800, impressions: 801000, ctr: 0.0509, position: 4.7 },
    { date: "2026-02-02", clicks: 42100, impressions: 829000, ctr: 0.0508, position: 4.6 },
    { date: "2026-02-03", clicks: 43420, impressions: 852000, ctr: 0.0510, position: 4.6 },
    { date: "2026-02-04", clicks: 44860, impressions: 880500, ctr: 0.0510, position: 4.5 },
    { date: "2026-02-05", clicks: 46140, impressions: 905200, ctr: 0.0510, position: 4.5 },
    { date: "2026-02-06", clicks: 47800, impressions: 934000, ctr: 0.0512, position: 4.4 },
    { date: "2026-02-07", clicks: 47020, impressions: 921300, ctr: 0.0510, position: 4.4 },
    { date: "2026-02-08", clicks: 48950, impressions: 958600, ctr: 0.0511, position: 4.3 },
    { date: "2026-02-09", clicks: 50340, impressions: 985000, ctr: 0.0511, position: 4.3 },
    { date: "2026-02-10", clicks: 51610, impressions: 1014200, ctr: 0.0509, position: 4.2 },
    { date: "2026-02-11", clicks: 52980, impressions: 1048000, ctr: 0.0506, position: 4.2 },
    { date: "2026-02-12", clicks: 54020, impressions: 1072000, ctr: 0.0504, position: 4.1 },
    { date: "2026-02-13", clicks: 55200, impressions: 1099000, ctr: 0.0502, position: 4.1 },
    { date: "2026-02-14", clicks: 56620, impressions: 1126000, ctr: 0.0503, position: 4.0 },
    { date: "2026-02-15", clicks: 57810, impressions: 1154000, ctr: 0.0501, position: 4.0 },
    { date: "2026-02-16", clicks: 59100, impressions: 1180000, ctr: 0.0501, position: 3.9 },
    { date: "2026-02-17", clicks: 60380, impressions: 1207000, ctr: 0.0500, position: 3.9 },
    { date: "2026-02-18", clicks: 61620, impressions: 1232000, ctr: 0.0500, position: 3.8 },
    { date: "2026-02-19", clicks: 62720, impressions: 1258000, ctr: 0.0499, position: 3.8 },
    { date: "2026-02-20", clicks: 63840, impressions: 1284000, ctr: 0.0497, position: 3.8 },
    { date: "2026-02-21", clicks: 64750, impressions: 1306000, ctr: 0.0496, position: 3.7 },
    { date: "2026-02-22", clicks: 65910, impressions: 1330000, ctr: 0.0496, position: 3.7 },
    { date: "2026-02-23", clicks: 67240, impressions: 1364000, ctr: 0.0493, position: 3.6 },
    { date: "2026-02-24", clicks: 68110, impressions: 1389000, ctr: 0.0490, position: 3.6 },
    { date: "2026-02-25", clicks: 69220, impressions: 1412000, ctr: 0.0490, position: 3.5 },
    { date: "2026-02-26", clicks: 70310, impressions: 1436000, ctr: 0.0490, position: 3.5 },
    { date: "2026-02-27", clicks: 71640, impressions: 1463000, ctr: 0.0490, position: 3.4 },
    { date: "2026-02-28", clicks: 72820, impressions: 1498000, ctr: 0.0486, position: 3.4 },
  ],
  lastAvailable: "2026-03-28",
  granularity: "day",
  allowedGranularities: ["day", "week", "month"],
};

const wikipediaQueries: QueryRow[] = [
  { query: "wikipedia", clicks: 420000, impressions: 1820000, ctr: 0.2308, position: 1.0, compareClicks: 392000, compareImpressions: 1710000, compareCtr: 0.2292, comparePosition: 1.1 },
  { query: "wikipedia english", clicks: 114500, impressions: 790000, ctr: 0.1449, position: 1.2, compareClicks: 108200, compareImpressions: 745000, compareCtr: 0.1452, comparePosition: 1.3 },
  { query: "history of artificial intelligence", clicks: 42200, impressions: 691000, ctr: 0.0611, position: 2.4, compareClicks: 36100, compareImpressions: 628000, compareCtr: 0.0575, comparePosition: 2.8 },
  { query: "quantum computing", clicks: 38700, impressions: 584000, ctr: 0.0663, position: 2.1, compareClicks: 34900, compareImpressions: 541000, compareCtr: 0.0645, comparePosition: 2.3 },
  { query: "margaret hamilton", clicks: 26500, impressions: 311000, ctr: 0.0852, position: 1.8, compareClicks: 21800, compareImpressions: 276000, compareCtr: 0.0790, comparePosition: 2.2 },
  { query: "alan turing wikipedia", clicks: 24300, impressions: 222000, ctr: 0.1095, position: 1.4, compareClicks: 23800, compareImpressions: 229000, compareCtr: 0.1039, comparePosition: 1.5 },
  { query: "world war 2", clicks: 20100, impressions: 492000, ctr: 0.0409, position: 3.3, compareClicks: 22600, compareImpressions: 514000, compareCtr: 0.0440, comparePosition: 3.1 },
  { query: "apollo 11", clicks: 18400, impressions: 236000, ctr: 0.0780, position: 2.0, compareClicks: 17100, compareImpressions: 226000, compareCtr: 0.0757, comparePosition: 2.1 },
];

const wikipediaPages: PageRow[] = [
  { page: "https://www.wikipedia.org/wiki/Artificial_intelligence", clicks: 90200, impressions: 1240000, ctr: 0.0727, position: 2.1, compareClicks: 84600, compareImpressions: 1185000, compareCtr: 0.0714, comparePosition: 2.3 },
  { page: "https://www.wikipedia.org/wiki/Quantum_computing", clicks: 74400, impressions: 1023000, ctr: 0.0727, position: 2.0, compareClicks: 68100, compareImpressions: 961000, compareCtr: 0.0709, comparePosition: 2.2 },
  { page: "https://www.wikipedia.org/wiki/Alan_Turing", clicks: 51500, impressions: 611000, ctr: 0.0843, position: 1.7, compareClicks: 49700, compareImpressions: 598000, compareCtr: 0.0831, comparePosition: 1.8 },
  { page: "https://www.wikipedia.org/wiki/Margaret_Hamilton_(software_engineer)", clicks: 43700, impressions: 482000, ctr: 0.0907, position: 1.8, compareClicks: 36200, compareImpressions: 431000, compareCtr: 0.0840, comparePosition: 2.2 },
  { page: "https://www.wikipedia.org/wiki/World_War_II", clicks: 39800, impressions: 914000, ctr: 0.0435, position: 3.4, compareClicks: 42100, compareImpressions: 948000, compareCtr: 0.0444, comparePosition: 3.2 },
  { page: "https://www.wikipedia.org/wiki/Internet", clicks: 34200, impressions: 558000, ctr: 0.0613, position: 2.6, compareClicks: 31800, compareImpressions: 524000, compareCtr: 0.0607, comparePosition: 2.7 },
  { page: "https://www.wikipedia.org/wiki/Apollo_11", clicks: 27900, impressions: 353000, ctr: 0.0790, position: 2.1, compareClicks: 26300, compareImpressions: 335000, compareCtr: 0.0785, comparePosition: 2.3 },
  { page: "https://www.wikipedia.org/wiki/Marie_Curie", clicks: 25100, impressions: 298000, ctr: 0.0842, position: 2.0, compareClicks: 23800, compareImpressions: 284000, compareCtr: 0.0838, comparePosition: 2.1 },
];

const wikipediaDevices: DeviceRow[] = [
  { device: "mobile", clicks: 812400, impressions: 14840000, ctr: 0.0547, position: 3.5, compareClicks: 744000, compareImpressions: 13620000, compareCtr: 0.0546, comparePosition: 3.8 },
  { device: "desktop", clicks: 523800, impressions: 10910000, ctr: 0.0480, position: 4.1, compareClicks: 495300, compareImpressions: 10200000, compareCtr: 0.0486, comparePosition: 4.4 },
  { device: "tablet", clicks: 112500, impressions: 2290000, ctr: 0.0491, position: 4.0, compareClicks: 108400, compareImpressions: 2140000, compareCtr: 0.0507, comparePosition: 4.1 },
  { device: "other", clicks: 34500, impressions: 705000, ctr: 0.0489, position: 4.8, compareClicks: 31700, compareImpressions: 624000, compareCtr: 0.0508, comparePosition: 5.1 },
];

export function WikipediaScreenshotPreview() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(106,168,79,0.18),_transparent_40%),linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(var(--muted)/0.35)_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8">
        <section className="rounded-3xl border border-border/60 bg-background/92 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-emerald-700">
                <Camera className="size-3.5" weight="bold" />
                Screenshot Preview
              </div>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                  Wikipedia search performance preview
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                  Static demo surface for taking polished dashboard screenshots with a recognizable, high-signal dataset.
                </p>
              </div>
            </div>
            <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <GlobeHemisphereWest className="size-4 text-emerald-600" weight="bold" />
                <span>Domain: wikipedia.org</span>
              </div>
              <div className="flex items-center gap-2">
                <LinkSimple className="size-4 text-emerald-600" weight="bold" />
                <span>Window: Mar 1 to Mar 28, 2026</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-3xl border border-border/60 bg-background/96 p-6 shadow-sm backdrop-blur">
            <SiteCard
              site={wikipediaSite}
              card={wikipediaCard}
              granularity="day"
              compareEnabled
              compareSettings={{
                showPreviousTrend: true,
                matchWeekdays: true,
                showChangePercent: true,
              }}
              linkToSite={false}
            />
          </div>
          <div className="rounded-3xl border border-border/60 bg-background/96 p-6 shadow-sm backdrop-blur">
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Search overview
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Strong visibility across evergreen knowledge topics
              </h2>
            </div>
            <MetricGrid
              clicks={wikipediaCard.total?.clicks}
              impressions={wikipediaCard.total?.impressions}
              ctr={wikipediaCard.total?.ctr}
              position={wikipediaCard.total?.position}
              compareClicks={wikipediaCard.compareTotal?.clicks}
              compareImpressions={wikipediaCard.compareTotal?.impressions}
              compareCtr={wikipediaCard.compareTotal?.ctr}
              comparePosition={wikipediaCard.compareTotal?.position}
            />
            <Separator className="my-6" />
            <SiteCardChart
              chartId="wikipedia-preview-detail"
              series={wikipediaCard.series}
              compareSeries={wikipediaCard.compareSeries}
              granularity="day"
              compareEnabled
              compareSettings={{
                showPreviousTrend: true,
                matchWeekdays: true,
                showChangePercent: true,
              }}
              height="20rem"
            />
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-border/60 bg-background/96 p-6 shadow-sm backdrop-blur xl:grid-cols-2">
          <QueriesTable queries={wikipediaQueries} compareEnabled />
          <PagesTable pages={wikipediaPages} compareEnabled />
          <div className="xl:col-span-2">
            <DevicesTable devices={wikipediaDevices} compareEnabled />
          </div>
        </section>
      </div>
    </div>
  );
}

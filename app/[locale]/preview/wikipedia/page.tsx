import type { Metadata } from "next";
import { buildCanonical } from "@/lib/seo";
import { getLocalePath } from "@/lib/locale";
import { WikipediaScreenshotPreview } from "@/components/share/wikipedia-screenshot-preview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: "en" | "pl" | "de" }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = "Wikipedia preview";
  const path = "/preview/wikipedia";

  return {
    title,
    description: "Static Wikipedia analytics preview for screenshot capture.",
    alternates: {
      canonical: buildCanonical(getLocalePath(locale, path)),
      languages: {
        en: buildCanonical(getLocalePath("en", path)),
        pl: buildCanonical(getLocalePath("pl", path)),
        de: buildCanonical(getLocalePath("de", path)),
      },
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export default async function WikipediaPreviewPage({
  params,
}: {
  params: Promise<{ locale: "en" | "pl" | "de" }>;
}) {
  await params;
  return <WikipediaScreenshotPreview />;
}

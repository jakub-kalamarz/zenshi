export type SeoConfig = {
  brandName: string;
  defaultTitle: Record<"en" | "pl" | "de", string>;
  titleTemplate: Record<"en" | "pl" | "de", string>;
  description: Record<"en" | "pl" | "de", string>;
  locale: Record<"en" | "pl" | "de", string>;
  ogImagePath: string;
};

export const SEO_CONFIG: SeoConfig = {
  brandName: "zenshi",
  defaultTitle: {
    en: "zenshi | Google Search Console Insights Workspace",
    pl: "zenshi | Workspace z insightami Google Search Console",
    de: "zenshi | Workspace fur Google Search Console Insights",
  },
  titleTemplate: {
    en: "%s | zenshi",
    pl: "%s | zenshi",
    de: "%s | zenshi",
  },
  description: {
    en: "zenshi helps teams track Google Search Console performance, monitor pages and queries, and keep SEO reporting in one place.",
    pl: "zenshi pomaga zespolom sledzic wyniki Google Search Console, monitorowac strony i zapytania oraz trzymac raportowanie SEO w jednym miejscu.",
    de: "zenshi hilft Teams, die Google-Search-Console-Leistung zu verfolgen, Seiten und Suchanfragen zu uberwachen und SEO-Reporting an einem Ort zu verwalten.",
  },
  locale: {
    en: "en_US",
    pl: "pl_PL",
    de: "de_DE",
  },
  ogImagePath: "/opengraph-image",
};

export function getSiteUrl(): URL {
  const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return new URL(rawUrl);
}

export function buildCanonical(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}

export function buildOgImageUrl(): string {
  return buildCanonical(SEO_CONFIG.ogImagePath);
}

export function getGoogleSiteVerification(): string | undefined {
  return process.env.GOOGLE_SITE_VERIFICATION || undefined;
}

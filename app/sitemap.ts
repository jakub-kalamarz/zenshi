import type { MetadataRoute } from "next";
import { buildCanonical } from "@/lib/seo";
import { getLocalePath } from "@/lib/locale";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: buildCanonical(getLocalePath("en", "/")),
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: buildCanonical(getLocalePath("pl", "/")),
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: buildCanonical(getLocalePath("de", "/")),
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
}

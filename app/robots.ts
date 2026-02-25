import type { MetadataRoute } from "next";
import { buildCanonical } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/sync",
          "/*/sync",
          "/site/",
          "/*/site/",
          "/s/",
          "/*/s/",
          "/api/auth/google/start",
          "/api/auth/callback/google",
        ],
      },
    ],
    sitemap: buildCanonical("/sitemap.xml"),
  };
}

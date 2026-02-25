import { ImageResponse } from "next/og";
import { SEO_CONFIG } from "@/lib/seo";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, rgba(16,24,40,1) 0%, rgba(15,23,42,1) 50%, rgba(12,74,110,1) 100%)",
          color: "white",
          padding: "64px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div style={{ fontSize: 36, opacity: 0.85 }}>{SEO_CONFIG.brandName}</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            maxWidth: "900px",
          }}
        >
          <div style={{ fontSize: 64, lineHeight: 1.1, fontWeight: 700 }}>
            Google Search Console insights in one workspace
          </div>
          <div style={{ fontSize: 28, opacity: 0.9 }}>
            Monitor pages, queries, and sync status with less operational overhead.
          </div>
        </div>
      </div>
    ),
    size,
  );
}

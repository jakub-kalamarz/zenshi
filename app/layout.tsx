import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/geist-mono";
import "./globals.css";
import { cookies } from "next/headers";
import { normalizeLocale } from "@/lib/locale";
import { getSiteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("NEXT_LOCALE")?.value);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
    >
      <body className="antialiased tracking-tight">
        {children}
      </body>
    </html>
  );
}

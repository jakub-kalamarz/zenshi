import { Bricolage_Grotesque, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { normalizeLocale } from "@/lib/locale";

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage-grotesque",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={bricolageGrotesque.className}
      suppressHydrationWarning
    >
      <body
        className={`${bricolageGrotesque.variable} ${geistMono.variable} antialiased tracking-tight`}
      >
        {children}
      </body>
    </html>
  );
}

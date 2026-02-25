import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {NextIntlClientProvider, hasLocale} from 'next-intl';
import {getMessages, getTranslations, setRequestLocale} from 'next-intl/server';
import {routing} from '@/i18n/routing';
import {AppSessionProvider} from '@/components/session-provider';
import {ThemeProvider} from '@/components/theme-provider';
import {Toaster} from '@/components/ui/sonner';
import {IconProvider} from '@/components/icon-provider';
import {ChartTooltipProvider} from '@/components/gsc/chart-tooltip-context';
import {
  buildCanonical,
  buildOgImageUrl,
  getGoogleSiteVerification,
  getSiteUrl,
  SEO_CONFIG
} from '@/lib/seo';
import {getLocalePath, getOgLocale} from '@/lib/locale';

export async function generateMetadata({
  params
}: {
  params: Promise<{locale: string}>;
}): Promise<Metadata> {
  const {locale: requestedLocale} = await params;
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;
  const t = await getTranslations({locale, namespace: 'seo'});

  const localizedRoot = getLocalePath(locale, '/');

  return {
    metadataBase: getSiteUrl(),
    title: {
      default: t('defaultTitle'),
      template: SEO_CONFIG.titleTemplate[locale],
    },
    description: t('description'),
    alternates: {
      canonical: buildCanonical(localizedRoot),
      languages: {
        en: buildCanonical(getLocalePath('en', '/')),
        pl: buildCanonical(getLocalePath('pl', '/')),
        de: buildCanonical(getLocalePath('de', '/')),
      },
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: 'website',
      locale: getOgLocale(locale),
      siteName: SEO_CONFIG.brandName,
      title: t('defaultTitle'),
      description: t('description'),
      url: buildCanonical(localizedRoot),
      images: [
        {
          url: buildOgImageUrl(),
          width: 1200,
          height: 630,
          alt: t('socialPreviewAlt')
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: t('defaultTitle'),
      description: t('description'),
      images: [buildOgImageUrl()],
    },
    verification: {
      google: getGoogleSiteVerification(),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}>) {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <IconProvider>
          <ChartTooltipProvider>
            <AppSessionProvider>{children}</AppSessionProvider>
            <Toaster />
          </ChartTooltipProvider>
        </IconProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}

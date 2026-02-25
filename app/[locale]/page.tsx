import {auth} from '@/lib/auth';
import type {Metadata} from 'next';
import {Footer} from '@/components/footer';
import {Header} from '@/components/header';
import {LoginForm} from '@/components/login-form';
import {ModeToggle} from '@/components/mode-toggle';
import {NavUser} from '@/components/nav-user';
import {Separator} from '@/components/ui/separator';
import {GscDashboard} from '@/components/gsc-dashboard';
import {BrandButton} from '@/components/brand-button';
import {LanguageSwitcher} from '@/components/language-switcher';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
} from '@/components/ui/breadcrumb';
import Image from 'next/image';
import {cache} from 'react';
import {getTranslations} from 'next-intl/server';
import {buildCanonical, buildOgImageUrl} from '@/lib/seo';
import {getLocalePath, getOgLocale} from '@/lib/locale';

const getSession = cache(async () => auth());
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{locale: 'en' | 'pl' | 'de'}>;
}): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'seo'});
  const canonicalPath = getLocalePath(locale, '/');

  const session = await getSession();
  const user = session?.user;

  if (user) {
    return {
      title: t('dashboardTitle'),
      description: t('dashboardDescription'),
      alternates: {
        canonical: buildCanonical(canonicalPath),
      },
      robots: {
        index: false,
        follow: false,
        nocache: true,
      },
    };
  }

  return {
    title: t('defaultTitle'),
    description: t('description'),
    alternates: {
      canonical: buildCanonical(canonicalPath),
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
      title: t('defaultTitle'),
      description: t('description'),
      url: buildCanonical(canonicalPath),
      images: [
        {
          url: buildOgImageUrl(),
          width: 1200,
          height: 630,
          alt: t('socialPreviewAlt'),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('defaultTitle'),
      description: t('description'),
      images: [buildOgImageUrl()],
    },
  };
}

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{locale: 'en' | 'pl' | 'de'}>;
}) {
  const {locale} = await params;
  const tCommon = await getTranslations({locale, namespace: 'common'});
  const tSeo = await getTranslations({locale, namespace: 'seo'});

  const session = await getSession();
  const user = session?.user;

  if (!user) {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: 'zenshi',
          url: buildCanonical(getLocalePath(locale, '/')),
        },
        {
          '@type': 'WebSite',
          name: 'zenshi',
          url: buildCanonical(getLocalePath(locale, '/')),
          description: tSeo('description'),
        },
      ],
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
        />
        <div className="grid min-h-svh lg:grid-cols-2">
          <div className="flex flex-col gap-4 p-6 md:p-10">
            <div className="flex justify-center gap-2 md:justify-start">
              <BrandButton />
            </div>
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-xs">
                <LoginForm />
              </div>
            </div>
          </div>
          <div className="bg-muted relative hidden lg:block">
            <Image
              src="/loginPhoto.jpg"
              alt="Image"
              width={1920}
              height={1800}
              className="absolute inset-0 h-full w-full object-cover dark:grayscale"
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto flex w-full max-w-7xl 2xl:max-w-[100rem] flex-1 flex-col">
        <Header
          leftSlot={
            <div className="flex items-center space-x-4">
              <BrandButton />
              <Separator orientation="vertical" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href={getLocalePath(locale, '/')}>{tCommon('dashboard')}</BreadcrumbLink>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          }
          rightSlot={
            <NavUser
              user={{
                name: user.name || tCommon('user'),
                email: user.email || '',
                avatar: user.image,
              }}
            />
          }
        />
        <main className="flex flex-1 px-6 py-4 md:px-2">
          <GscDashboard />
        </main>
        <Footer
          leftSlot={
            <span>
              © {new Date().getFullYear()} zenshi. {tCommon('allRightsReserved')}
            </span>
          }
          rightSlot={
            <>
              <LanguageSwitcher />
              <ModeToggle />
            </>
          }
        />
      </div>
    </div>
  );
}

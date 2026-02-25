import type {Metadata} from 'next';
import {Header} from '@/components/header';
import {Footer} from '@/components/footer';
import {BrandButton} from '@/components/brand-button';
import {ModeToggle} from '@/components/mode-toggle';
import {Separator} from '@/components/ui/separator';
import {LanguageSwitcher} from '@/components/language-switcher';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import {PublicShareDashboard} from '@/components/share/public-share-dashboard';
import {getTranslations} from 'next-intl/server';
import {buildCanonical} from '@/lib/seo';
import {getLocalePath} from '@/lib/locale';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{locale: 'en' | 'pl' | 'de'; token: string}>;
}): Promise<Metadata> {
  const {locale, token} = await params;
  const tSeo = await getTranslations({locale, namespace: 'seo'});

  return {
    title: tSeo('sharedDashboardTitle'),
    alternates: {
      canonical: buildCanonical(getLocalePath(locale, `/s/${token}`)),
      languages: {
        en: buildCanonical(getLocalePath('en', `/s/${token}`)),
        pl: buildCanonical(getLocalePath('pl', `/s/${token}`)),
        de: buildCanonical(getLocalePath('de', `/s/${token}`)),
      },
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export default async function SharedDashboardPage({
  params,
}: {
  params: Promise<{locale: 'en' | 'pl' | 'de'; token: string}>;
}) {
  const {token, locale} = await params;
  const tCommon = await getTranslations({locale, namespace: 'common'});

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
                    <BreadcrumbPage>{tCommon('sharedDashboard')}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          }
          rightSlot={null}
        />
        <main className="flex flex-1 px-6 py-4 md:px-2">
          <PublicShareDashboard token={token} />
        </main>
        <Footer
          leftSlot={<span>© {new Date().getFullYear()} zenshi. {tCommon('allRightsReserved')}</span>}
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

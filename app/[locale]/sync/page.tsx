import {auth} from '@/lib/auth';
import type {Metadata} from 'next';
import {Footer} from '@/components/footer';
import {Header} from '@/components/header';
import {ModeToggle} from '@/components/mode-toggle';
import {NavUser} from '@/components/nav-user';
import {Separator} from '@/components/ui/separator';
import {BrandButton} from '@/components/brand-button';
import {SyncDashboard} from '@/components/gsc/sync-dashboard';
import {LanguageSwitcher} from '@/components/language-switcher';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {getTranslations} from 'next-intl/server';
import {buildCanonical} from '@/lib/seo';
import {getLocalePath} from '@/lib/locale';
import {redirect} from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{locale: 'en' | 'pl' | 'de'}>;
}): Promise<Metadata> {
  const {locale} = await params;
  const tSeo = await getTranslations({locale, namespace: 'seo'});

  return {
    title: tSeo('syncTitle'),
    alternates: {
      canonical: buildCanonical(getLocalePath(locale, '/sync')),
      languages: {
        en: buildCanonical(getLocalePath('en', '/sync')),
        pl: buildCanonical(getLocalePath('pl', '/sync')),
        de: buildCanonical(getLocalePath('de', '/sync')),
      },
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export default async function SyncPage({
  params,
}: {
  params: Promise<{locale: 'en' | 'pl' | 'de'}>;
}) {
  const {locale} = await params;
  const session = await auth();
  const user = session?.user;
  const tCommon = await getTranslations({locale, namespace: 'common'});

  if (!user) {
    redirect(getLocalePath(locale, '/'));
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
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href={getLocalePath(locale, '/sync')}>{tCommon('sync')}</BreadcrumbLink>
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
        <main className="flex flex-1 flex-col px-6 py-4 md:px-2">
          <SyncDashboard />
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

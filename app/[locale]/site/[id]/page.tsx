import {auth} from '@/lib/auth';
import type {Metadata} from 'next';
import {notFound, redirect} from 'next/navigation';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {ensureGscSchema} from '@/lib/gsc-schema';
import {Footer} from '@/components/footer';
import {Header} from '@/components/header';
import {ModeToggle} from '@/components/mode-toggle';
import {NavUser} from '@/components/nav-user';
import {Separator} from '@/components/ui/separator';
import {BrandButton} from '@/components/brand-button';
import {SiteFavicon} from '@/components/site-favicon';
import {SiteDetailDashboard} from '@/components/site-detail-dashboard';
import {LanguageSwitcher} from '@/components/language-switcher';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {getTranslations} from 'next-intl/server';
import {buildCanonical} from '@/lib/seo';
import {getLocalePath} from '@/lib/locale';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{locale: 'en' | 'pl' | 'de'; id: string}>;
}): Promise<Metadata> {
  const {locale, id} = await params;
  const tSeo = await getTranslations({locale, namespace: 'seo'});

  return {
    title: tSeo('siteDetailsTitle'),
    alternates: {
      canonical: buildCanonical(getLocalePath(locale, `/site/${id}`)),
      languages: {
        en: buildCanonical(getLocalePath('en', `/site/${id}`)),
        pl: buildCanonical(getLocalePath('pl', `/site/${id}`)),
        de: buildCanonical(getLocalePath('de', `/site/${id}`)),
      },
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

function displaySiteName(raw: string) {
  try {
    const url = new URL(raw);
    return url.hostname;
  } catch {
    return raw;
  }
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{locale: 'en' | 'pl' | 'de'; id: string}>;
}) {
  const {locale, id} = await params;
  const session = await auth();
  const user = session?.user;
  const tCommon = await getTranslations({locale, namespace: 'common'});

  if (!user) {
    redirect(getLocalePath(locale, '/'));
  }

  const {env} = await getCloudflareContext({async: true});
  await ensureGscSchema(env);

  const site = await env.DB.prepare(
    `SELECT id, gsc_site_url FROM gsc_sites WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(id, user.id)
    .first<{id: string; gsc_site_url: string}>();

  if (!site) {
    notFound();
  }

  const domainName = displaySiteName(site.gsc_site_url);

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
                    <BreadcrumbPage className="inline-flex items-center gap-1.5">
                      <SiteFavicon siteUrl={site.gsc_site_url} size={14} />
                      <span>{domainName}</span>
                    </BreadcrumbPage>
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
          <SiteDetailDashboard siteId={site.id} />
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

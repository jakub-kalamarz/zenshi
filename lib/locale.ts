import {routing, type AppLocale} from '@/i18n/routing';

export function isAppLocale(value: string): value is AppLocale {
  return routing.locales.includes(value as AppLocale);
}

export function getLocalePath(locale: AppLocale, path = '/'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (locale === routing.defaultLocale) return normalizedPath;
  if (normalizedPath === '/') return `/${locale}`;
  return `/${locale}${normalizedPath}`;
}

export function getOgLocale(locale: AppLocale): string {
  if (locale === 'pl') return 'pl_PL';
  if (locale === 'de') return 'de_DE';
  return 'en_US';
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
  if (value && isAppLocale(value)) return value;
  return routing.defaultLocale;
}

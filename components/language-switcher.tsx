"use client";

import {useLocale, useTranslations} from 'next-intl';
import {GlobeHemisphereWest} from '@phosphor-icons/react';
import {usePathname, useRouter} from '@/i18n/navigation';
import {routing, type AppLocale} from '@/i18n/routing';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';

const LABELS: Record<AppLocale, string> = {
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch'
};

export function LanguageSwitcher() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('common');

  return (
    <Select
      value={locale}
      onValueChange={(nextLocale) => {
        router.replace(pathname, {locale: nextLocale});
      }}
    >
      <SelectTrigger className="h-9 w-[140px] gap-2">
        <GlobeHemisphereWest className="size-4 text-muted-foreground" />
        <SelectValue aria-label={t('language')} placeholder={t('language')}>
          {LABELS[locale]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((item) => (
          <SelectItem key={item} value={item}>
            {LABELS[item]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

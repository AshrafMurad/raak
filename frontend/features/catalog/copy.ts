import en from '../../messages/en/catalog.json';
import ar from '../../messages/ar/catalog.json';
import type { Locale } from '../../lib/i18n';
export type CatalogCopy = typeof en;
export function catalogCopy(locale: Locale): CatalogCopy {
  return locale === 'ar' ? ar : en;
}
export function localized(value: { nameAr: string; nameEn: string }, locale: Locale) {
  return locale === 'ar' ? value.nameAr : value.nameEn;
}

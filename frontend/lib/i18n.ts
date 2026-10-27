/**
 * Locale contract — frontend copy of the closed set (ADR-0006; backend owns
 * the canonical version in `backend/src/contracts/locales.ts`).
 */
import ar from '../messages/ar/common.json';
import en from '../messages/en/common.json';

export const SUPPORTED_LOCALES = ['ar', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALE_DIRECTION: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}

export type Dictionary = typeof ar;

export function getDictionary(locale: Locale): Dictionary {
  return locale === 'ar' ? ar : en;
}

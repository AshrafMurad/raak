/**
 * Locale contract — frontend copy of the closed set (ADR-0006; backend owns
 * the canonical version in `backend/src/contracts/locales.ts`).
 */
import arCommon from '../messages/ar/common.json';
import enCommon from '../messages/en/common.json';
import arAuth from '../messages/ar/auth.json';
import enAuth from '../messages/en/auth.json';
import arPlatform from '../messages/ar/platform.json';
import enPlatform from '../messages/en/platform.json';

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

const ar = { ...arCommon, auth: arAuth, platform: arPlatform };
const en: typeof ar = { ...enCommon, auth: enAuth, platform: enPlatform };

export type Dictionary = typeof ar;

export function getDictionary(locale: Locale): Dictionary {
  return locale === 'ar' ? ar : en;
}

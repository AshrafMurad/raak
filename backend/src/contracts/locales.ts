/**
 * Locale contract (docs 10): Arabic-first RTL, English LTR.
 * Canonical codes are language-only; UI direction derives from locale.
 * The frontend keeps its own copy of this closed set (ADR-0006).
 */
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

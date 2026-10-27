import { describe, expect, it } from 'vitest';
import ar from '../messages/ar/common.json';
import en from '../messages/en/common.json';
import arAuth from '../messages/ar/auth.json';
import enAuth from '../messages/en/auth.json';
import arPlatform from '../messages/ar/platform.json';
import enPlatform from '../messages/en/platform.json';
import {
  DEFAULT_LOCALE,
  LOCALE_DIRECTION,
  SUPPORTED_LOCALES,
  getDictionary,
  isLocale,
  otherLocale,
} from '../lib/i18n';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      keyPaths(child, prefix === '' ? key : `${prefix}.${key}`),
    );
  }
  return [prefix];
}

describe('dictionaries', () => {
  it('ar and en expose exactly the same keys (no fallback holes)', () => {
    for (const [arabic, english] of [
      [ar, en],
      [arAuth, enAuth],
      [arPlatform, enPlatform],
    ]) {
      expect(keyPaths(english).sort()).toEqual(keyPaths(arabic).sort());
    }
  });

  it('every leaf value is a non-empty string', () => {
    for (const dictionary of [ar, en, arAuth, enAuth, arPlatform, enPlatform]) {
      for (const path of keyPaths(dictionary)) {
        const parts = path.split('.');
        let node: unknown = dictionary;
        for (const part of parts) {
          node = (node as Record<string, unknown>)[part];
        }
        expect(typeof node === 'string' && node.trim().length > 0, path).toBe(true);
      }
    }
  });
});

describe('locale helpers', () => {
  it('arabic is default and RTL; english is LTR', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(LOCALE_DIRECTION.ar).toBe('rtl');
    expect(LOCALE_DIRECTION.en).toBe('ltr');
    expect(SUPPORTED_LOCALES).toEqual(['ar', 'en']);
  });

  it('isLocale and otherLocale behave', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(otherLocale('ar')).toBe('en');
    expect(otherLocale('en')).toBe('ar');
  });

  it('getDictionary returns the matching dictionary', () => {
    expect(getDictionary('ar').brand['latin']).toBe('Raak');
    expect(getDictionary('en').brand['latin']).toBe('Raak');
  });
});

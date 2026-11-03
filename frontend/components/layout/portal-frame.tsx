'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import type { Locale } from '../../lib/i18n';
import { PortalShell } from './portal-shell';
import { Button } from '../ui/button';
import { ThemeContext } from '../ui/theme';
import arCatalog from '../../messages/ar/catalog.json';
import enCatalog from '../../messages/en/catalog.json';
import arPeople from '../../messages/ar/people.json';
import enPeople from '../../messages/en/people.json';

const catalog = { ar: arCatalog, en: enCatalog };
const people = { ar: arPeople, en: enPeople };

export function PortalFrame({
  locale,
  children,
  name,
  path = '/services',
  branding,
}: {
  locale: Locale;
  children: ReactNode;
  name?: string;
  path?: string;
  branding?: { primaryColor: string; logoPng?: string | null } | null;
}) {
  const c = catalog[locale];
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  return (
    <ThemeContext value={theme}>
      <div data-brand={branding?.primaryColor ?? 'MIDNIGHT'}>
        <PortalShell
          skipLabel={c.skip}
          theme={theme}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          header={
            <>
              <Link href={`/${locale}/services`} className="rv-wordmark">
                {branding?.logoPng ? (
                  <Image
                    unoptimized
                    src={`data:image/png;base64,${branding.logoPng}`}
                    width={48}
                    height={48}
                    alt=""
                  />
                ) : null}
                {name ?? c.brand}
              </Link>
              <nav className="raak-actions" aria-label={c.services}>
                <Link href={`/${locale}/services`}>{c.services}</Link>
                <Link href={`/${locale}/track`}>{c.track}</Link>
                <Link href={`/${locale}/account`}>{people[locale].account}</Link>
                <Link href={`/${locale}/workspace/services`}>{c.workspace}</Link>
                <Link href={`/${locale === 'ar' ? 'en' : 'ar'}${path}`}>{c.language}</Link>
                <Button
                  variant="ghost"
                  onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
                >
                  {c.theme}
                </Button>
              </nav>
            </>
          }
        >
          {children}
        </PortalShell>
      </div>
    </ThemeContext>
  );
}

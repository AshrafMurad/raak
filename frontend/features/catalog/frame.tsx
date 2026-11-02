'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import type { Locale } from '../../lib/i18n';
import { PortalShell } from '../../components/layout/portal-shell';
import { Button } from '../../components/ui/button';
import { ThemeContext } from '../../components/ui/theme';
import { catalogCopy } from './copy';
import { peopleCopy } from '../people/copy';

export function CatalogFrame({
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
  const c = catalogCopy(locale);
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
              <nav className="raak-actions">
                <Link href={`/${locale}/services`}>{c.services}</Link>
                <Link href={`/${locale}/track`}>{c.track}</Link>
                <Link href={`/${locale}/account`}>{peopleCopy(locale).account}</Link>
                <Link href={`/${locale}/workspace/services`}>{c.workspace}</Link>
                <Link href={`/${locale === 'ar' ? 'en' : 'ar'}${path}`}>{c.language}</Link>
                <Button
                  variant="ghost"
                  onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
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

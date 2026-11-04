'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { WorkspaceShell } from './workspace-shell';
import { Button } from '../ui/button';
import { ThemeContext } from '../ui/theme';
import { LOCALE_DIRECTION, otherLocale, type Locale } from '../../lib/i18n';
import { WorkspaceNavigation } from './workspace-navigation';
import { usePathname } from 'next/navigation';
import ar from '../../messages/ar/workspace.json';
import en from '../../messages/en/workspace.json';
import { useWorkspaceQuery } from '../../lib/use-workspace-query';
import { NotificationBadge } from './notification-badge';

const copy = { ar, en };

export function WorkspaceFrame({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { search, update } = useWorkspaceQuery();
  const theme = new URLSearchParams(search).get('theme') === 'dark' ? 'dark' : 'light';
  const pathname = usePathname();
  const labels = copy[locale];
  return (
    <ThemeContext value={theme}>
      <WorkspaceShell
        theme={theme}
        dir={LOCALE_DIRECTION[locale]}
        sidebar={
          <>
            <a href="#workspace-main" className="rv-skip">
              {labels.skip}
            </a>
            <aside className="rv-sidebar">
              <Link href={`/${locale}/workspace/services`} className="rv-wordmark">
                {labels.brand}
              </Link>
              <WorkspaceNavigation locale={locale} />
            </aside>
          </>
        }
      >
        <header className="rv-header">
          <div className="rv-breadcrumb">{labels.workspace}</div>
          <nav className="rv-header-actions" aria-label={labels.preferences}>
            <NotificationBadge locale={locale} href={`/${locale}/workspace/notifications`} />
            <Link
              className="rv-language"
              href={`/${otherLocale(locale)}${pathname.slice(locale.length + 1)}${search}`}
            >
              {labels.language}
            </Link>
            <Button
              variant="ghost"
              onClick={() => update({ theme: theme === 'light' ? 'dark' : null })}
            >
              {labels.theme}
            </Button>
          </nav>
        </header>
        <details className="rv-mobile-nav">
          <summary>
            {labels.brand}
            <span>{labels.menu}</span>
          </summary>
          <WorkspaceNavigation locale={locale} />
        </details>
        <main id="workspace-main" className="rv-main" tabIndex={-1}>
          {children}
        </main>
      </WorkspaceShell>
    </ThemeContext>
  );
}

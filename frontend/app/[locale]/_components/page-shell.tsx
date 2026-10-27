import Link from 'next/link';
import type { ReactNode } from 'react';
import { otherLocale, type Locale } from '../../../lib/i18n';

interface PageShellProps {
  locale: Locale;
  eyebrow: string;
  title: string;
  intro: string;
  switchPath: string;
  children: ReactNode;
}

export function PageShell({ locale, eyebrow, title, intro, switchPath, children }: PageShellProps) {
  const alternate = otherLocale(locale);
  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 py-6 sm:px-8 sm:py-10">
      <header className="mb-10 flex items-center justify-between gap-4">
        <Link href={`/${locale}`} className="text-lg font-bold text-brand">
          رعاك <span className="text-ink-muted">| Raak</span>
        </Link>
        <Link
          href={`/${alternate}${switchPath}`}
          lang={alternate}
          className="rounded-[var(--raak-radius-control)] border border-line bg-surface px-4 py-2 text-sm font-medium text-brand hover:bg-brand-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {locale === 'ar' ? 'English' : 'العربية'}
        </Link>
      </header>

      <main className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(480px,1.15fr)]">
        <section className="pt-5 lg:sticky lg:top-10">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
          <h1 className="max-w-xl text-[var(--raak-text-display-size)] font-bold leading-[var(--raak-text-display-line)] text-brand">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-ink-muted">{intro}</p>
          <div className="mt-8 h-1 w-20 rounded-full bg-accent" aria-hidden="true" />
        </section>
        {children}
      </main>
    </div>
  );
}

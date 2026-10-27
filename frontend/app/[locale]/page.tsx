import Link from 'next/link';
import { DEFAULT_LOCALE, getDictionary, isLocale, otherLocale, type Locale } from '../../lib/i18n';

interface LocalePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: LocalePageProps) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const switchTarget = otherLocale(locale);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        {/* Text wordmark only — logo not selected (docs 10). */}
        <p className="text-[var(--raak-text-card-title-size)] font-[var(--raak-font-weight-bold)] text-brand">
          {dict.brand.name} <span className="text-ink-muted">| {dict.brand['latin']}</span>
        </p>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Primary">
          <Link href={`/${locale}/register`} className="rounded-[var(--raak-radius-control)] px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-subtle">{dict.auth.nav.register}</Link>
          <Link href={`/${locale}/login`} className="rounded-[var(--raak-radius-control)] px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-subtle">{dict.auth.nav.login}</Link>
          <Link
            href={`/${switchTarget}`}
            lang={switchTarget}
            aria-label={dict.switch.label}
            className="rounded-[var(--raak-radius-control)] border border-line bg-surface px-4 py-2 text-[var(--raak-text-button-size)] font-[var(--raak-font-weight-medium)] text-brand hover:bg-brand-subtle"
          >
            {dict.switch.to}
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-start gap-6 rounded-[var(--raak-radius-card)] border border-line bg-surface p-8 shadow-[var(--raak-shadow-subtle)]">
        <p className="rounded-full border border-accent-subtle bg-accent-subtle px-3 py-1 text-[var(--raak-text-caption-size)] font-[var(--raak-font-weight-medium)] text-brand">
          {dict.badge}
        </p>
        <h1
          className="font-[var(--raak-font-weight-bold)] text-brand"
          style={{
            fontSize: 'var(--raak-text-page-title-size)',
            lineHeight: 'var(--raak-text-page-title-line)',
          }}
        >
          {dict.title}
        </h1>
        <p className="max-w-prose text-[var(--raak-text-body-lg-size)] leading-[var(--raak-text-body-lg-line)] text-ink-muted">
          {dict.body}
        </p>
      </main>

      <footer className="text-[var(--raak-text-caption-size)] text-ink-muted">
        <p dir="auto">{dict.footer}</p>
      </footer>
    </div>
  );
}

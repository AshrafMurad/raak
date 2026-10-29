import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '../../../lib/i18n';
import { PageShell } from '../_components/page-shell';
import { LoginForm } from '../_components/auth-forms';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <PageShell locale={locale} eyebrow={dict.auth.login.eyebrow} title={dict.auth.login.title} intro={dict.auth.login.intro} switchPath="/login">
      <LoginForm locale={locale} copy={dict.auth} />
    </PageShell>
  );
}

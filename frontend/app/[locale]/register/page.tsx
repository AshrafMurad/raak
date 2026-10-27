import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '../../../lib/i18n';
import { PageShell } from '../_components/page-shell';
import { RegistrationForm } from '../_components/auth-forms';

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <PageShell locale={locale} eyebrow={dict.auth.register.eyebrow} title={dict.auth.register.title} intro={dict.auth.register.intro} switchPath="/register">
      <RegistrationForm copy={dict.auth} />
    </PageShell>
  );
}

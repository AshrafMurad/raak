import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '../../../lib/i18n';
import { PageShell } from '../_components/page-shell';
import { ResetPasswordForm } from '../_components/auth-forms';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <PageShell locale={locale} eyebrow={dict.auth.reset.eyebrow} title={dict.auth.reset.title} intro={dict.auth.reset.intro} switchPath="/reset-password">
      <ResetPasswordForm copy={dict.auth} />
    </PageShell>
  );
}

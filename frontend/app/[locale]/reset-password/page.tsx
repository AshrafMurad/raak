import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '../../../lib/i18n';
import { PageShell } from '../_components/page-shell';
import { ResetPasswordForm } from '../_components/auth-forms';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <PageShell locale={locale} eyebrow={dict.auth.reset.eyebrow} title={dict.auth.reset.title} intro={dict.auth.reset.intro} switchPath={`/reset-password${token ? `?token=${encodeURIComponent(token)}` : ''}`}>
      <ResetPasswordForm token={token} copy={dict.auth} />
    </PageShell>
  );
}

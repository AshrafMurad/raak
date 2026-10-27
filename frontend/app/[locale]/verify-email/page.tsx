import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '../../../lib/i18n';
import { PageShell } from '../_components/page-shell';
import { VerifyEmailForm } from '../_components/auth-forms';

export default async function VerifyEmailPage({
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
    <PageShell locale={locale} eyebrow={dict.auth.verify.eyebrow} title={dict.auth.verify.title} intro={dict.auth.verify.intro} switchPath={`/verify-email${token ? `?token=${encodeURIComponent(token)}` : ''}`}>
      <VerifyEmailForm token={token} copy={dict.auth} />
    </PageShell>
  );
}

import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '../../../lib/i18n';
import { PageShell } from '../_components/page-shell';
import { AcceptInvitationForm } from '../_components/auth-forms';

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <PageShell locale={locale} eyebrow={dict.auth.invitation.eyebrow} title={dict.auth.invitation.title} intro={dict.auth.invitation.intro} switchPath="/accept-invitation">
      <AcceptInvitationForm copy={dict.auth} />
    </PageShell>
  );
}

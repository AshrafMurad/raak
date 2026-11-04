import { InboxScreen } from '../../../../features/notifications/inbox-screen';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InboxScreen locale={isLocale(locale) ? locale : 'ar'} workspace />;
}

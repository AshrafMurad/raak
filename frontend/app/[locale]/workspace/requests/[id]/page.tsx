import { RequestManagement } from '../../../../../features/commercial/request-management';
import { isLocale } from '../../../../../lib/i18n';
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <RequestManagement locale={isLocale(locale) ? locale : 'ar'} requestId={id} />;
}

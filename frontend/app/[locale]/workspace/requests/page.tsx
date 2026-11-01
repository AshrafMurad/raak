import { RequestQueue } from '../../../../features/catalog/request-queue';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <RequestQueue locale={isLocale(locale) ? locale : 'ar'} />;
}

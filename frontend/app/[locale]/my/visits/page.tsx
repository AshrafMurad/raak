import { CustomerVisitsScreen } from '../../../../features/customer-visits/screen';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CustomerVisitsScreen locale={isLocale(locale) ? locale : 'ar'} />;
}

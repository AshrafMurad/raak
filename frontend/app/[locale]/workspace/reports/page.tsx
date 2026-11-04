import { ReportsScreen } from '../../../../features/reporting/screens/reports-screen';
import { isLocale } from '../../../../lib/i18n';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ReportsScreen locale={isLocale(locale) ? locale : 'ar'} />;
}

import { ChangesScreen } from '../../../../features/visits/screens/changes-screen';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ChangesScreen locale={isLocale(locale) ? locale : 'ar'} />;
}

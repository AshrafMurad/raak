import { Patients } from '../../../../features/people/patients';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Patients locale={isLocale(locale) ? locale : 'ar'} portal />;
}

import { CaregiverVisitsScreen } from '../../../../features/caregiver-visits/screen';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CaregiverVisitsScreen locale={isLocale(locale) ? locale : 'ar'} />;
}

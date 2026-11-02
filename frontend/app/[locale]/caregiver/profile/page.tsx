import { Caregivers } from '../../../../features/people/caregivers';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Caregivers locale={isLocale(locale) ? locale : 'ar'} own />;
}

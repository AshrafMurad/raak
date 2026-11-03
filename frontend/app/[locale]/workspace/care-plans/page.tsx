import { CarePlansScreen } from '../../../../features/care-plans';
import { isLocale } from '../../../../lib/i18n';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CarePlansScreen locale={isLocale(locale) ? locale : 'ar'} />;
}

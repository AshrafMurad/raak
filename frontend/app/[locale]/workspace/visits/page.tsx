import { VisitsScreen } from '../../../../features/visits';
import { isLocale } from '../../../../lib/i18n';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <VisitsScreen locale={isLocale(locale) ? locale : 'ar'} />;
}

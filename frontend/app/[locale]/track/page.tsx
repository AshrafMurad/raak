import { GuestTracking } from '../../../features/catalog/tracking';
import { isLocale } from '../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <GuestTracking locale={isLocale(locale) ? locale : 'ar'} />;
}

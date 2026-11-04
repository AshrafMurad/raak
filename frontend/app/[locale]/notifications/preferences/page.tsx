import { PreferencesScreen } from '../../../../features/notifications/preferences-screen';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PreferencesScreen locale={isLocale(locale) ? locale : 'ar'} />;
}

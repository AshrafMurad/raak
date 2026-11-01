import { ServiceEditor } from '../../../../features/catalog/service-editor';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ServiceEditor locale={isLocale(locale) ? locale : 'ar'} />;
}

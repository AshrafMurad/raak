import { BrandingEditor } from '../../../../features/catalog/branding-editor';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BrandingEditor locale={isLocale(locale) ? locale : 'ar'} />;
}

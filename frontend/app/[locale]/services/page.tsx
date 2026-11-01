import { CatalogPortal } from '../../../features/catalog/portal';
import { isLocale } from '../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CatalogPortal locale={isLocale(locale) ? locale : 'ar'} />;
}

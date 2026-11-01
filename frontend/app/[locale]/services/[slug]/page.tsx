import { CatalogPortal } from '../../../../features/catalog/portal';
import { isLocale } from '../../../../lib/i18n';
export const dynamicParams = true;
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return <CatalogPortal locale={isLocale(locale) ? locale : 'ar'} slug={slug} />;
}

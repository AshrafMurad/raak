import { CustomerAccount } from '../../../features/people/account';
import { isLocale } from '../../../lib/i18n';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CustomerAccount locale={isLocale(locale) ? locale : 'ar'} />;
}

import { GuestIntake } from '../../../features/catalog/intake';
import { isLocale } from '../../../lib/i18n';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ service?: string }>;
}) {
  const [{ locale }, { service }] = await Promise.all([params, searchParams]);
  return <GuestIntake locale={isLocale(locale) ? locale : 'ar'} slug={service} />;
}

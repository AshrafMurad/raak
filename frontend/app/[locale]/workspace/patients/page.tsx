import { Patients } from '../../../../features/people/patients';
import { isLocale } from '../../../../lib/i18n';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ request?: string }>;
}) {
  const [{ locale }, { request }] = await Promise.all([params, searchParams]);
  return <Patients locale={isLocale(locale) ? locale : 'ar'} requestId={request} />;
}

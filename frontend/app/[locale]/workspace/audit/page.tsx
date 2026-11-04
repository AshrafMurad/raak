import { AuditScreen } from '../../../../features/reporting/screens/audit-screen';
import { isLocale } from '../../../../lib/i18n';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AuditScreen locale={isLocale(locale) ? locale : 'ar'} />;
}

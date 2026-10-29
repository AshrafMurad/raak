import { notFound } from 'next/navigation';
import { getDictionary, isLocale } from '../../../../lib/i18n';
import { PageShell } from '../../_components/page-shell';
import { TenantAdmin } from '../../_components/tenant-admin';

export default async function PlatformTenantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <PageShell locale={locale} eyebrow={dict.platform.eyebrow} title={dict.platform.title} intro={dict.platform.intro} switchPath="/platform/tenants">
      <TenantAdmin copy={dict.platform} />
    </PageShell>
  );
}

import { notFound } from 'next/navigation';
import { WorkspaceFrame } from '../../../components/layout/workspace-frame';
import { isLocale } from '../../../lib/i18n';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <WorkspaceFrame locale={locale}>{children}</WorkspaceFrame>;
}

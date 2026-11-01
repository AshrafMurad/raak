import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '../../../lib/i18n';
import { getPreviewCopy, getPreviewTheme } from '../../../lib/design-preview';
import { DesignPreview } from './_components/design-preview';

export const metadata: Metadata = {
  title: 'Raak — Visual system preview',
  robots: { index: false, follow: false },
};

export default async function DesignPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return (
    <DesignPreview
      locale={locale}
      copy={getPreviewCopy(locale)}
      initialTheme={getPreviewTheme(query.theme)}
    />
  );
}

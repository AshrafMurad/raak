import Link from 'next/link';
import type { Locale } from '../../lib/i18n';
import { catalogCopy } from './copy';
export function WorkspaceNav({ locale }: { locale: Locale }) {
  const c = catalogCopy(locale);
  return (
    <nav className="raak-actions">
      <Link href={`/${locale}/workspace/services`}>{c.services}</Link>
      <Link href={`/${locale}/workspace/branding`}>{c.branding}</Link>
      <Link href={`/${locale}/workspace/requests`}>{c.queue}</Link>
      <Link href={`/${locale}/login`}>{c.login}</Link>
    </nav>
  );
}

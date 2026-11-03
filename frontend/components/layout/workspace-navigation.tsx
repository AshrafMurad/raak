'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ar from '../../messages/ar/workspace.json';
import en from '../../messages/en/workspace.json';
import type { Locale } from '../../lib/i18n';

const copy = { ar, en };

export type WorkspaceNavigationItem = {
  id:
    | 'services'
    | 'branding'
    | 'requests'
    | 'patients'
    | 'caregivers'
    | 'carePlans'
    | 'visits'
    | 'login';
  href: string;
  label: string;
};

export function workspaceNavigationItems(locale: Locale): WorkspaceNavigationItem[] {
  const labels = copy[locale];
  return [
    { id: 'services', href: `/${locale}/workspace/services`, label: labels.services },
    { id: 'branding', href: `/${locale}/workspace/branding`, label: labels.branding },
    { id: 'requests', href: `/${locale}/workspace/requests`, label: labels.requests },
    { id: 'patients', href: `/${locale}/workspace/patients`, label: labels.patients },
    { id: 'caregivers', href: `/${locale}/workspace/caregivers`, label: labels.caregivers },
    { id: 'carePlans', href: `/${locale}/workspace/care-plans`, label: labels.carePlans },
    { id: 'visits', href: `/${locale}/workspace/visits`, label: labels.visits },
    { id: 'login', href: `/${locale}/login`, label: labels.login },
  ];
}

export function isWorkspaceNavigationItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceNavigation({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  return (
    <nav className="rv-nav" aria-label={copy[locale].workspace}>
      {workspaceNavigationItems(locale).map((item) => {
        const active = isWorkspaceNavigationItemActive(pathname, item.href);
        return (
          <Link key={item.id} href={item.href} aria-current={active ? 'page' : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

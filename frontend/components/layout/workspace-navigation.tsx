'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ar from '../../messages/ar/workspace.json';
import en from '../../messages/en/workspace.json';
import type { Locale } from '../../lib/i18n';
import { notificationCopy } from '../../features/notifications/copy';

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
    | 'changes'
    | 'reports'
    | 'audit'
    | 'settings'
    | 'notifications'
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
    { id: 'changes', href: `/${locale}/workspace/changes`, label: labels.changes },
    { id: 'reports', href: `/${locale}/workspace/reports`, label: labels.reports },
    { id: 'audit', href: `/${locale}/workspace/audit`, label: labels.audit },
    { id: 'settings', href: `/${locale}/workspace/settings`, label: labels.settings },
    {
      id: 'notifications',
      href: `/${locale}/workspace/notifications`,
      label: notificationCopy(locale).title,
    },
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

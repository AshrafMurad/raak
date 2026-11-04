'use client';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Locale } from '../../lib/i18n';
import { getUnreadCount } from '../../features/notifications/api';
import { notificationCopy } from '../../features/notifications/copy';

export function NotificationBadge({ locale, href }: { locale: Locale; href: string }) {
  const c = notificationCopy(locale);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    function refresh() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void getUnreadCount(signal)
        .then((data) => {
          if (active && !signal.aborted) setCount(data.count);
        })
        .catch(() => {
          if (active && !signal.aborted) setCount(null);
        });
    }
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('raak:notifications-changed', refresh);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('raak:notifications-changed', refresh);
    };
  }, []);
  if (count === null) return null;
  return (
    <Link
      className="rv-language"
      href={href}
      aria-label={c.badge.replace('{count}', String(count))}
      data-notification-badge
    >
      <Bell size={18} aria-hidden="true" /> <bdi>{count}</bdi>
    </Link>
  );
}

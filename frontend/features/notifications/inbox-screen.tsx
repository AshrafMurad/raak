'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '../../lib/i18n';
import { useWorkspaceQuery } from '../../lib/use-workspace-query';
import { Button } from '../../components/ui/button';
import { CheckboxField } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { StatusBadge } from '../../components/ui/status-badge';
import { PortalFrame } from '../../components/layout/portal-frame';
import { getInbox, getNotificationTarget, markRead, type Notice } from './api';
import { notificationCopy, notificationError } from './copy';
import '../../components/layout/visit-flow.css';

export function InboxScreen({
  locale,
  workspace = false,
}: {
  locale: Locale;
  workspace?: boolean;
}) {
  const c = notificationCopy(locale);
  const router = useRouter();
  const { search, update } = useWorkspaceQuery();
  const params = new URLSearchParams(search);
  const unreadOnly = params.get('unreadOnly') === 'true';
  const cursor = params.get('cursor');
  const key = `${unreadOnly}:${cursor}`;
  const [result, setResult] = useState<{
    key: string;
    items: Notice[];
    nextCursor: string | null;
    timezone: string;
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [pending, start] = useTransition();
  useEffect(() => {
    const controller = new AbortController();
    void getInbox({ unreadOnly, cursor }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          setResult({ key, ...page });
          setFailure(null);
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setResult(null);
          setFailure({ key, message: notificationError(c, e) });
        }
      });
    return () => controller.abort();
  }, [unreadOnly, cursor, key, revision, c]);
  const page = result?.key === key ? result : null;
  async function read(id: string, navigate: boolean) {
    setActionMessage('');
    try {
      await markRead(id);
      if (unreadOnly && !navigate) document.getElementById('unread-only')?.focus();
      window.dispatchEvent(new Event('raak:notifications-changed'));
      setRevision((r) => r + 1);
      if (navigate) {
        const path = await getNotificationTarget(id);
        if (path) router.push(`/${locale}${path}`);
        else setActionMessage(c.unavailable);
      }
    } catch (e) {
      setActionMessage(notificationError(c, e));
    }
  }
  const content = (
    <section className="raak-execution">
      <div className="rv-page-heading">
        <div>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
        <Link href={`/${locale}/${workspace ? 'workspace/' : ''}notifications/preferences`}>
          {c.preferences}
        </Link>
      </div>
      <div className="raak-actions">
        <CheckboxField
          id="unread-only"
          name="unreadOnly"
          autoComplete="off"
          label={c.unreadOnly}
          checked={unreadOnly}
          onChange={(e) => update({ unreadOnly: e.target.checked ? 'true' : null, cursor: null })}
        />
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setFailure(null);
            setRevision((r) => r + 1);
          }}
        >
          {c.refresh}
        </Button>
      </div>
      {failure?.key === key ? <Feedback title={failure.message} tone="error" /> : null}
      {actionMessage ? <Feedback title={actionMessage} tone="error" /> : null}
      {!page && !failure ? <Feedback title={c.loading} /> : null}
      {page?.items.length === 0 ? <Feedback title={c.empty} /> : null}
      {page?.items.map((item) => (
        <article className="raak-card" key={item.id} data-notification-id={item.id}>
          <h2>{c.events[item.eventType]}</h2>
          <p>
            <time dateTime={item.createdAt}>
              <bdi>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: page.timezone,
                }).format(new Date(item.createdAt))}
              </bdi>
            </time>
          </p>
          <StatusBadge tone={item.readAt ? 'planned' : 'scheduled'}>
            {item.readAt ? c.read : c.unread}
          </StatusBadge>
          <div className="raak-actions">
            {!item.readAt ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => start(() => read(item.id, false))}
              >
                {c.markRead}
              </Button>
            ) : null}
            <Button disabled={pending} onClick={() => start(() => read(item.id, true))}>
              {c.open}
            </Button>
          </div>
        </article>
      ))}
      <div className="raak-actions">
        {cursor ? (
          <Button variant="secondary" onClick={() => update({ cursor: null })}>
            {c.first}
          </Button>
        ) : null}
        {page?.nextCursor ? (
          <Button variant="secondary" onClick={() => update({ cursor: page.nextCursor })}>
            {c.next}
          </Button>
        ) : null}
      </div>
    </section>
  );
  return workspace ? (
    content
  ) : (
    <PortalFrame locale={locale} path={`/notifications${search}`}>
      {content}
    </PortalFrame>
  );
}

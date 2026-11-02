'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import {
  capabilityTokenFromLocation,
  locationWithoutCapabilityToken,
} from '../../lib/capability-token';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { StatusBadge } from '../../components/ui/status-badge';
import { CatalogFrame } from './frame';
import { catalogCopy, localized } from './copy';
import type { RequestView } from './contracts';
import { PortalQuotes, PortalRequestActions } from '../commercial/portal-quotes';

export function GuestTracking({ locale }: { locale: Locale }) {
  const c = catalogCopy(locale);
  const [token, setToken] = useState('');
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [view, setView] = useState<RequestView | null>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const initialized = useRef(false);
  const capabilityRevision = useRef(0);
  useEffect(() => {
    function captureFragment() {
      const url = new URL(window.location.href);
      const fragment = capabilityTokenFromLocation(url);
      if (!fragment) return false;
      capabilityRevision.current++;
      window.history.replaceState(window.history.state, '', locationWithoutCapabilityToken(url));
      setToken(fragment);
      setView(null);
      setMessage('');
      return true;
    }
    if (!initialized.current) {
      initialized.current = true;
      if (!captureFragment()) {
        const revision = capabilityRevision.current;
        void apiRequest<RequestView[]>('/portal/my/requests')
          .then((rows) => {
            if (revision === capabilityRevision.current) setView(rows[0] ?? null);
          })
          .catch(() => {});
      }
    }
    window.addEventListener('hashchange', captureFragment);
    return () => window.removeEventListener('hashchange', captureFragment);
  }, []);
  function consume() {
    const revision = capabilityRevision.current;
    startTransition(async () => {
      try {
        const { requestId } = await apiRequest<{ requestId: string }>(
          '/portal/requests/access-link/consume',
          { method: 'POST', body: JSON.stringify({ token }) },
        );
        if (revision !== capabilityRevision.current) return;
        const request = await apiRequest<RequestView>(`/portal/my/requests/${requestId}`);
        if (revision !== capabilityRevision.current) return;
        setToken('');
        setView(request);
        setMessage('');
      } catch {
        if (revision !== capabilityRevision.current) return;
        setToken('');
        setMessage(c.invalidLink);
      }
    });
  }
  return (
    <CatalogFrame locale={locale} path="/track">
      <h1>{view ? c.verified : c.track}</h1>
      {view ? (
        <>
          <section className="raak-card">
            <h2>{localized(view.serviceSnapshot, locale)}</h2>
            <bdi>{view.reference}</bdi>
            <p>{c.notConfirmed}</p>
            <StatusBadge tone={view.status === 'UNDER_REVIEW' ? 'in_progress' : 'planned'}>
              {c[view.status as 'SUBMITTED'] ?? view.status}
            </StatusBadge>
            <ol>
              {view.history.map((h, i) => (
                <li key={i}>
                  {c[h.toStatus as 'SUBMITTED'] ?? h.toStatus} ·{' '}
                  <bdi>
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                      new Date(h.at),
                    )}
                  </bdi>
                  {h.reason ? <p>{h.reason}</p> : null}
                </li>
              ))}
            </ol>
          </section>
          <PortalRequestActions
            locale={locale}
            requestId={view.id}
            status={view.status}
            onDone={() =>
              startTransition(async () => {
                try {
                  setView(await apiRequest<RequestView>(`/portal/my/requests/${view.id}`));
                } catch {
                  setMessage(c.error);
                }
              })
            }
          />
          {['UNDER_REVIEW', 'AWAITING_CUSTOMER', 'APPROVED'].includes(view.status) ? (
            <PortalQuotes locale={locale} requestId={view.id} />
          ) : null}
        </>
      ) : (
        <>
          {token ? (
            <Button onClick={consume} disabled={pending}>
              {pending ? c.loading : c.verify}
            </Button>
          ) : null}
          {message ? <Feedback title={message} /> : null}
          <form
            className="raak-form"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                try {
                  await apiRequest('/portal/requests/access-link', {
                    method: 'POST',
                    body: JSON.stringify({ reference, email, locale }),
                  });
                  setMessage(c.linkSent);
                } catch {
                  setMessage(c.error);
                }
              });
            }}
          >
            <Field id="reference" label={c.reference}>
              <Input
                id="reference"
                dir="ltr"
                value={reference}
                required
                maxLength={20}
                pattern="REQ-[A-F0-9]{16}"
                onChange={(e) => setReference(e.target.value.toUpperCase())}
              />
            </Field>
            <Field id="email" label={c.requesterEmail}>
              <Input
                id="email"
                dir="ltr"
                type="email"
                value={email}
                required
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {c.sendLink}
            </Button>
          </form>
        </>
      )}
    </CatalogFrame>
  );
}

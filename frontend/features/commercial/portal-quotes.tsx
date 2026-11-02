'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError, apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Field, Input, Textarea } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { StatusBadge } from '../../components/ui/status-badge';
import { commercialCopy, errorLabel, formatMinor, quoteStatusLabel } from './copy';
import type { QuoteView } from './contracts';

/** Verified-requester quote panel: privacy-minimal projection only. Renders
 * only for the request the guest session is bound to (server enforced). */
export function PortalQuotes({ locale, requestId }: { locale: Locale; requestId: string }) {
  const c = commercialCopy(locale);
  const [quotes, setQuotes] = useState<QuoteView[] | null>(null);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [revisionFor, setRevisionFor] = useState<string | null>(null);
  const [revisionText, setRevisionText] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void apiRequest<{ items: QuoteView[] }>(`/portal/my/requests/${requestId}/quotes`)
      .then((data) => setQuotes(data.items))
      .catch(() => setMessage(c.error));
  }, [requestId, c.error]);
  function fail(error: unknown) {
    setMessage(error instanceof ApiRequestError ? errorLabel(c, error.code) : c.error);
  }
  function reload() {
    return apiRequest<{ items: QuoteView[] }>(`/portal/my/requests/${requestId}/quotes`).then(
      (data) => {
        setQuotes(data.items);
        return data.items;
      },
    );
  }
  function act(quote: QuoteView, action: 'accept' | 'reject') {
    startTransition(async () => {
      try {
        await apiRequest(`/portal/my/quotes/${quote.id}/${action}`, {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ quoteVersion: quote.version }),
        });
        setNotice(action === 'accept' ? c.accepted : c.rejectedDone);
        setMessage('');
        await reload();
      } catch (error) {
        fail(error);
      }
    });
  }
  function submitRevision(quote: QuoteView) {
    startTransition(async () => {
      try {
        await apiRequest(`/portal/my/quotes/${quote.id}/revision-requests`, {
          method: 'POST',
          body: JSON.stringify({ quoteVersion: quote.version, message: revisionText }),
        });
        setNotice(c.revisionSent);
        setMessage('');
        setRevisionFor(null);
        setRevisionText('');
        await reload();
      } catch (error) {
        fail(error);
      }
    });
  }
  const latest = quotes?.at(-1);
  return (
    <section className="raak-card">
      <h2>{c.quotes}</h2>
      <p>{c.notPayment}</p>
      {notice ? <Feedback title={notice} tone="success" /> : null}
      {message ? <Feedback title={message} /> : null}
      {quotes === null ? (
        <p aria-busy="true">{c.loading}</p>
      ) : quotes.length === 0 ? (
        <Feedback title={c.emptyQuotes} />
      ) : (
        quotes.map((quote) => {
          const actionable =
            quote.status === 'SENT' &&
            quote.id === latest?.id &&
            !quotes.some((q) => q.status === 'SENT' && q.id !== quote.id);
          return (
            <article key={quote.id} className="raak-quote-version">
              <h3>
                {c.quoteVersion} <bdi>{quote.version}</bdi>
              </h3>
              <StatusBadge
                tone={
                  quote.status === 'ACCEPTED'
                    ? 'completed'
                    : quote.status === 'SENT'
                      ? 'in_progress'
                      : quote.status === 'EXPIRED' || quote.status === 'SUPERSEDED'
                        ? 'cancelled'
                        : 'planned'
                }
              >
                {quoteStatusLabel(c, quote.status)}
              </StatusBadge>
              <ul>
                {quote.lineItems.map((item, index) => (
                  <li key={index}>
                    {item.description} × <bdi>{item.quantity}</bdi> —{' '}
                    <bdi dir="ltr">{formatMinor(item.unitPriceMinor, quote.currency, locale)}</bdi>
                  </li>
                ))}
              </ul>
              <p>
                {c.total}:{' '}
                <bdi dir="ltr">{formatMinor(quote.totalMinor, quote.currency, locale)}</bdi>
              </p>
              <p>{quote.terms}</p>
              {quote.validUntil ? (
                <p>
                  {c.expiresAt}:{' '}
                  <bdi dir="ltr">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(quote.validUntil))}
                  </bdi>
                </p>
              ) : null}
              {actionable ? (
                <div className="raak-actions">
                  <Button
                    disabled={pending || quote.revisionPending}
                    onClick={() => act(quote, 'accept')}
                  >
                    {c.accept}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={pending || quote.revisionPending}
                    onClick={() => act(quote, 'reject')}
                  >
                    {c.reject}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending || quote.revisionPending || revisionFor === quote.id}
                    onClick={() => setRevisionFor(revisionFor === quote.id ? null : quote.id)}
                  >
                    {c.requestRevision}
                  </Button>
                </div>
              ) : null}
              {quote.revisionPending ? <Feedback title={c.revisionPending} /> : null}
              {revisionFor === quote.id ? (
                <form
                  className="raak-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitRevision(quote);
                  }}
                >
                  <Field id={`revision-${quote.id}`} label={c.revisionMessage}>
                    <Textarea
                      id={`revision-${quote.id}`}
                      value={revisionText}
                      required
                      minLength={10}
                      maxLength={1000}
                      onChange={(event) => setRevisionText(event.target.value)}
                    />
                  </Field>
                  <Button type="submit" disabled={pending}>
                    {c.requestRevision}
                  </Button>
                </form>
              ) : null}
            </article>
          );
        })
      )}
    </section>
  );
}

/** Customer response/withdraw actions for the verified request (docs 07). */
export function PortalRequestActions({
  locale,
  requestId,
  status,
  onDone,
}: {
  locale: Locale;
  requestId: string;
  status: string;
  onDone: (status: string) => void;
}) {
  const c = commercialCopy(locale);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const open = ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_CUSTOMER'].includes(status);
  if (!open) return null;
  return (
    <section className="raak-card">
      {message ? <Feedback title={message} /> : null}
      {status === 'AWAITING_CUSTOMER' ? (
        <form
          className="raak-form"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              try {
                const data = await apiRequest<{ status: string }>(
                  `/portal/my/requests/${requestId}/respond`,
                  {
                    method: 'POST',
                    body: JSON.stringify({ note }),
                  },
                );
                setMessage('');
                setNote('');
                onDone(data.status);
              } catch (error) {
                setMessage(error instanceof ApiRequestError ? errorLabel(c, error.code) : c.error);
              }
            });
          }}
        >
          <Field id="respond-note" label={c.respondNote}>
            <Textarea
              id="respond-note"
              value={note}
              required
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {c.respond}
          </Button>
        </form>
      ) : null}
      <form
        className="raak-form"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            try {
              const data = await apiRequest<{ status: string }>(
                `/portal/my/requests/${requestId}/withdraw`,
                {
                  method: 'POST',
                  body: JSON.stringify({ reason }),
                },
              );
              setMessage('');
              onDone(data.status);
            } catch (error) {
              setMessage(error instanceof ApiRequestError ? errorLabel(c, error.code) : c.error);
            }
          });
        }}
      >
        <Field id="withdraw-reason" label={c.withdrawReason}>
          <Input
            id="withdraw-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {c.withdraw}
        </Button>
      </form>
    </section>
  );
}

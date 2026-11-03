'use client';
import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { peopleCopy } from '../people/copy';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError, apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { CheckboxField, Field, Input, Textarea } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { StatusBadge } from '../../components/ui/status-badge';
import { catalogCopy, localized } from '../catalog/copy';
import type { RequestView } from '../catalog/contracts';
import {
  commercialCopy,
  errorLabel,
  formatMinor,
  quoteStatusLabel,
  requestStatusLabel,
  revisionStatusLabel,
} from './copy';
import type { AgencyQuoteView, QuoteLineItem, RevisionView } from './contracts';

interface DraftForm {
  lineItems: QuoteLineItem[];
  terms: string;
  validForHours: number;
}

const emptyDraft: DraftForm = {
  lineItems: [{ description: '', quantity: 1, unitPriceMinor: 0 }],
  terms: '',
  validForHours: 72,
};

/** Coordinator request management: decisions, versioned quotes, revisions
 * (docs 03 F03/F04). All state transitions stay server-owned. */
export function RequestManagement({ locale, requestId }: { locale: Locale; requestId: string }) {
  const catalog = catalogCopy(locale);
  const c = commercialCopy(locale);
  const [request, setRequest] = useState<RequestView | null>(null);
  const [quotes, setQuotes] = useState<AgencyQuoteView[]>([]);
  const [draft, setDraft] = useState<DraftForm>(emptyDraft);
  const [revisions, setRevisions] = useState<RevisionView[]>([]);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [infoNote, setInfoNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [feasibility, setFeasibility] = useState(false);
  const [pending, startTransition] = useTransition();

  const fail = useCallback(
    (error: unknown) =>
      setMessage(error instanceof ApiRequestError ? errorLabel(c, error.code) : c.error),
    [c],
  );

  const load = useCallback(async () => {
    const [detail, quoteList] = await Promise.all([
      apiRequest<RequestView>(`/agency/requests/${requestId}`),
      apiRequest<{ items: AgencyQuoteView[] }>(`/agency/requests/${requestId}/quotes`),
    ]);
    setRequest(detail);
    setQuotes(quoteList.items);
    const openDraft = quoteList.items.find((q) => q.rawStatus === 'DRAFT');
    if (openDraft) {
      setDraft({
        lineItems: openDraft.lineItems.map((item) => ({ ...item })),
        terms: openDraft.terms,
        validForHours: 72,
      });
    }
    const newest = quoteList.items.at(-1);
    if (newest) {
      const data = await apiRequest<{ items: RevisionView[] }>(
        `/agency/quotes/${newest.id}/revision-requests`,
      );
      setRevisions(data.items);
    } else {
      setRevisions([]);
    }
    return { detail, quoteList };
  }, [requestId]);

  useEffect(() => {
    void load().catch(() => setMessage(c.error));
  }, [load, c.error]);

  const openDraft = quotes.find((q) => q.rawStatus === 'DRAFT');
  const pendingRevision = revisions.find((r) => r.status === 'PENDING');
  const latestQuote = quotes.at(-1);
  const agreementAccepted = quotes.some((quote) => quote.status === 'ACCEPTED');
  const requestOpen = request
    ? ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_CUSTOMER'].includes(request.status)
    : false;

  function refresh(noticeText?: string) {
    startTransition(async () => {
      try {
        await load();
        setNotice(noticeText ?? '');
        setMessage('');
      } catch (error) {
        fail(error);
      }
    });
  }

  function post(path: string, body: unknown, noticeText: string) {
    startTransition(async () => {
      try {
        await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
        setInfoNote('');
        setRejectReason('');
        refresh(noticeText);
      } catch (error) {
        fail(error);
      }
    });
  }

  function saveDraft() {
    if (openDraft) {
      startTransition(async () => {
        try {
          await apiRequest(`/agency/quotes/${openDraft.id}/draft`, {
            method: 'PATCH',
            body: JSON.stringify({
              expectedVersion: openDraft.rowVersion,
              lineItems: draft.lineItems,
              terms: draft.terms,
            }),
          });
          refresh(c.saved);
        } catch (error) {
          fail(error);
        }
      });
    } else {
      post(
        `/agency/requests/${requestId}/quotes`,
        { lineItems: draft.lineItems, terms: draft.terms },
        c.saved,
      );
    }
  }

  function sendDraft() {
    if (!openDraft) return;
    if (!window.confirm(c.confirmSend)) return;
    post(
      `/agency/quotes/${openDraft.id}/send`,
      {
        expectedVersion: openDraft.rowVersion,
        validForHours: draft.validForHours,
        lineItems: draft.lineItems,
        terms: draft.terms,
      },
      c.sent,
    );
  }

  const totalMinor = draft.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceMinor,
    0,
  );

  return (
    <>
      {request ? (
        <>
          <h1>
            {localized(request.serviceSnapshot, locale)} · <bdi>{request.reference}</bdi>
          </h1>
          <StatusBadge
            tone={
              request.status === 'APPROVED'
                ? 'completed'
                : request.status === 'REJECTED' || request.status === 'WITHDRAWN'
                  ? 'cancelled'
                  : request.status === 'UNDER_REVIEW'
                    ? 'in_progress'
                    : 'planned'
            }
          >
            {requestStatusLabel(c, request.status)}
          </StatusBadge>
          {request.status === 'APPROVED' ? (
            <p>
              <Link href={`/${locale}/workspace/patients?request=${requestId}`}>
                {peopleCopy(locale).approvedRequest}
              </Link>
            </p>
          ) : null}
          <p>
            {request.requesterName} · <bdi dir="ltr">{request.requesterEmailNormalized}</bdi>
          </p>
          <p>
            {catalog.beneficiaryName}: {request.beneficiaryName}
          </p>
          <p>{request.notesRestricted}</p>
          <ol>
            {request.history.map((h, i) => (
              <li key={i}>
                {requestStatusLabel(c, h.toStatus)} ·{' '}
                <bdi>
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(h.at))}
                </bdi>
                {h.reason ? <p>{h.reason}</p> : null}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p aria-busy="true">{c.loading}</p>
      )}
      {message ? <Feedback title={message} /> : null}
      {notice ? <Feedback title={notice} tone="success" /> : null}

      {request && requestOpen ? (
        <section className="raak-card">
          <h2>{c.decisions}</h2>
          {request.status === 'UNDER_REVIEW' ? (
            <>
              <form
                className="raak-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  post(
                    `/agency/requests/${requestId}/request-info`,
                    { expectedVersion: request.version, note: infoNote },
                    c.saved,
                  );
                }}
              >
                <Field id="info-note" label={c.infoNote}>
                  <Textarea
                    id="info-note"
                    value={infoNote}
                    required
                    minLength={5}
                    maxLength={500}
                    onChange={(event) => setInfoNote(event.target.value)}
                  />
                </Field>
                <Button type="submit" variant="secondary" disabled={pending}>
                  {c.requestInfo}
                </Button>
              </form>
              <form
                className="raak-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  post(
                    `/agency/requests/${requestId}/approve`,
                    { expectedVersion: request.version, feasibilityConfirmed: true },
                    c.saved,
                  );
                }}
              >
                <CheckboxField
                  id="feasibility"
                  label={c.feasibility}
                  checked={feasibility}
                  onChange={(event) => setFeasibility(event.target.checked)}
                />
                <Button type="submit" disabled={pending || !feasibility}>
                  {c.approve}
                </Button>
              </form>
            </>
          ) : null}
          <form
            className="raak-form"
            onSubmit={(event) => {
              event.preventDefault();
              post(
                `/agency/requests/${requestId}/reject`,
                { expectedVersion: request.version, reason: rejectReason },
                c.saved,
              );
            }}
          >
            <Field id="reject-reason" label={c.rejectReason}>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                required
                minLength={5}
                maxLength={500}
                onChange={(event) => setRejectReason(event.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary" disabled={pending}>
              {c.rejectRequest}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="raak-card">
        <h2>{c.quotes}</h2>
        {quotes.length === 0 ? <Feedback title={c.emptyQuotes} /> : null}
        {quotes.map((quote) => (
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
            <p>
              {c.total}:{' '}
              <bdi dir="ltr">{formatMinor(quote.totalMinor, quote.currency, locale)}</bdi>
            </p>
          </article>
        ))}

        {requestOpen && !agreementAccepted ? (
          <div className="raak-form">
            <h3>{openDraft ? `${c.draft} v${openDraft.version}` : c.newDraft}</h3>
            {draft.lineItems.map((item, index) => (
              <fieldset key={index} className="raak-line-item">
                <Field id={`item-desc-${index}`} label={`${c.description} ${index + 1}`}>
                  <Input
                    id={`item-desc-${index}`}
                    value={item.description}
                    required
                    maxLength={300}
                    onChange={(event) =>
                      setDraft((d) => ({
                        ...d,
                        lineItems: d.lineItems.map((it, i) =>
                          i === index ? { ...it, description: event.target.value } : it,
                        ),
                      }))
                    }
                  />
                </Field>
                <Field id={`item-qty-${index}`} label={c.quantity}>
                  <Input
                    id={`item-qty-${index}`}
                    dir="ltr"
                    type="number"
                    min={1}
                    max={10000}
                    value={item.quantity}
                    required
                    onChange={(event) =>
                      setDraft((d) => ({
                        ...d,
                        lineItems: d.lineItems.map((it, i) =>
                          i === index ? { ...it, quantity: Number(event.target.value) } : it,
                        ),
                      }))
                    }
                  />
                </Field>
                <Field id={`item-price-${index}`} label={c.unitPriceMinor}>
                  <Input
                    id={`item-price-${index}`}
                    dir="ltr"
                    type="number"
                    min={0}
                    max={100000000}
                    value={item.unitPriceMinor}
                    required
                    onChange={(event) =>
                      setDraft((d) => ({
                        ...d,
                        lineItems: d.lineItems.map((it, i) =>
                          i === index ? { ...it, unitPriceMinor: Number(event.target.value) } : it,
                        ),
                      }))
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || draft.lineItems.length <= 1}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      lineItems: d.lineItems.filter((_, i) => i !== index),
                    }))
                  }
                >
                  {c.removeItem}
                </Button>
              </fieldset>
            ))}
            <div className="raak-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={pending || draft.lineItems.length >= 20}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    lineItems: [
                      ...d.lineItems,
                      { description: '', quantity: 1, unitPriceMinor: 0 },
                    ],
                  }))
                }
              >
                {c.addItem}
              </Button>
            </div>
            <p>
              {c.total}:{' '}
              <bdi dir="ltr">
                {formatMinor(totalMinor, request?.serviceSnapshot.currency ?? 'SAR', locale)}
              </bdi>
            </p>
            <Field id="terms" label={c.terms}>
              <Textarea
                id="terms"
                value={draft.terms}
                required
                maxLength={3000}
                onChange={(event) => setDraft((d) => ({ ...d, terms: event.target.value }))}
              />
            </Field>
            {openDraft ? (
              <>
                <Field id="valid-hours" label={c.validForHours}>
                  <Input
                    id="valid-hours"
                    dir="ltr"
                    type="number"
                    min={1}
                    max={2160}
                    value={draft.validForHours}
                    required
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, validForHours: Number(event.target.value) }))
                    }
                  />
                </Field>
                <div className="raak-actions">
                  <Button type="button" disabled={pending} onClick={saveDraft}>
                    {c.saveDraft}
                  </Button>
                  <Button type="button" disabled={pending} onClick={sendDraft}>
                    {c.sendQuote}
                  </Button>
                </div>
              </>
            ) : (
              <Button type="button" disabled={pending} onClick={saveDraft}>
                {c.newDraft}
              </Button>
            )}
          </div>
        ) : null}
      </section>

      {latestQuote ? (
        <section className="raak-card">
          <h2>{c.revisions}</h2>
          {revisions.length === 0 ? <Feedback title={c.noDraft} /> : null}
          {revisions.map((revision) => (
            <article key={revision.id} className="raak-quote-version">
              <p>{revision.message}</p>
              <StatusBadge tone={revision.status === 'PENDING' ? 'in_progress' : 'completed'}>
                {revisionStatusLabel(c, revision.status)}
              </StatusBadge>
              {revision.status === 'PENDING' ? (
                <>
                  <form
                    className="raak-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      post(
                        `/agency/quote-revisions/${revision.id}/decline`,
                        { reason: declineReason },
                        c.saved,
                      );
                    }}
                  >
                    <Field id={`decline-${revision.id}`} label={c.declineReason}>
                      <Textarea
                        id={`decline-${revision.id}`}
                        value={declineReason}
                        required
                        minLength={5}
                        maxLength={500}
                        onChange={(event) => setDeclineReason(event.target.value)}
                      />
                    </Field>
                    <Button type="submit" variant="secondary" disabled={pending}>
                      {c.declineRevision}
                    </Button>
                  </form>
                  {declineFor === revision.id ? (
                    <form
                      className="raak-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        post(
                          `/agency/quote-revisions/${revision.id}/resolve-with-replacement`,
                          {
                            validForHours: draft.validForHours,
                            lineItems: draft.lineItems,
                            terms: draft.terms,
                          },
                          c.sent,
                        );
                      }}
                    >
                      <Button type="submit" disabled={pending}>
                        {c.resolveWithReplacement}
                      </Button>
                    </form>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setDeclineFor(revision.id)}
                    >
                      {c.resolveWithReplacement}
                    </Button>
                  )}
                </>
              ) : null}
              {revision.declineReason ? <p>{revision.declineReason}</p> : null}
            </article>
          ))}
          {pendingRevision ? <Feedback title={c.revisionPending} /> : null}
        </section>
      ) : null}
    </>
  );
}

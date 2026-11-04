'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Field, Textarea } from '../../../components/ui/field';
import { Select } from '../../../components/ui/select';
import { Feedback } from '../../../components/ui/feedback';
import { visitCopy, visitError, formatVisitDateTime } from '../copy';
import { listChanges, approveChange, declineChange, type VisitChange } from '../changes-api';
import '../../../components/layout/visit-flow.css';
import { ChangeApprovalDialog } from '../components/change-approval-dialog';
import { useWorkspaceQuery } from '../../../lib/use-workspace-query';

export function ChangesScreen({ locale }: { locale: Locale }) {
  const c = visitCopy(locale);
  const { search, update } = useWorkspaceQuery();
  const params = new URLSearchParams(search);
  const requestedStatus = params.get('status') ?? 'PENDING';
  const status = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'].includes(requestedStatus)
    ? requestedStatus
    : 'PENDING';
  const requestedUrgency = params.get('urgency') ?? '';
  const urgency = ['NORMAL', 'LATE'].includes(requestedUrgency) ? requestedUrgency : '';
  const setStatus = (value: string) => update({ status: value });
  const setUrgency = (value: string) => update({ urgency: value || null });
  const [items, setItems] = useState<VisitChange[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success' | 'info'>('info');
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void listChanges(status, urgency, undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data.items);
          setCursor(data.nextCursor);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setMessage(visitError(c, e));
          setTone('error');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, urgency, c]);
  function run(id: string, reason?: string) {
    start(async () => {
      try {
        if (reason !== undefined) await declineChange(id, reason);
        else {
          const key = keys.current.get(id) ?? crypto.randomUUID();
          keys.current.set(id, key);
          await approveChange(id, key);
        }
      } catch (e) {
        setTone('error');
        setMessage(visitError(c, e));
        return;
      }
      setTone('success');
      setMessage(c.saved);
      try {
        const data = await listChanges(status, urgency);
        setItems(data.items);
        setCursor(data.nextCursor);
      } catch {
        setTone('info');
        setMessage(c.savedRefreshFailed);
      }
    });
  }
  return (
    <section className="raak-execution">
      <h1>{c.changes.title}</h1>
      <p>{c.changes.intro}</p>
      <div className="raak-actions">
        <Select
          id="change-status"
          name="status"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          label={c.status}
          value={status}
          onValueChange={setStatus}
          options={['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'].map((value) => ({
            value,
            label: c.changeStates[value as keyof typeof c.changeStates],
          }))}
        />
        <Select
          id="change-urgency"
          name="urgency"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          label={c.changes.urgency}
          value={urgency || 'ALL'}
          onValueChange={(v) => setUrgency(v === 'ALL' ? '' : v)}
          options={[
            { value: 'ALL', label: c.showAll },
            { value: 'NORMAL', label: c.changes.normal },
            { value: 'LATE', label: c.changes.late },
          ]}
        />
      </div>
      {message ? <Feedback tone={tone} title={message} /> : null}
      {loading ? (
        <Feedback title={c.loading} />
      ) : !items.length ? (
        <Feedback title={c.changes.empty} />
      ) : null}
      {items.map((change) => (
        <ChangeRow
          key={change.id}
          change={change}
          locale={locale}
          pending={pending}
          onApprove={() => run(change.id)}
          onDecline={(reason) => run(change.id, reason)}
        />
      ))}
      {cursor ? (
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                const data = await listChanges(status, urgency, cursor);
                setItems((old) => [
                  ...new Map([...old, ...data.items].map((v) => [v.id, v])).values(),
                ]);
                setCursor(data.nextCursor);
              } catch (e) {
                setTone('error');
                setMessage(visitError(c, e));
              }
            })
          }
        >
          {c.next}
        </Button>
      ) : null}
    </section>
  );
}
function ChangeRow({
  change,
  locale,
  pending,
  onApprove,
  onDecline,
}: {
  change: VisitChange;
  locale: Locale;
  pending: boolean;
  onApprove(): void;
  onDecline(reason: string): void;
}) {
  const c = visitCopy(locale);
  const [reason, setReason] = useState('');
  return (
    <article className="raak-card" data-change-id={change.id}>
      <h2>
        {change.visit.patient.displayName} ·{' '}
        {change.type === 'CANCEL' ? c.changes.cancelType : c.changes.rescheduleType}
      </h2>
      <p>
        {c.changeStates[change.status]} ·{' '}
        {change.urgency === 'LATE' ? c.changes.late : c.changes.normal}
      </p>
      <p>
        {c.changes.currentWindow}:{' '}
        {formatVisitDateTime(change.visit.scheduledStartUtc, locale, change.visit.timezoneSnapshot)}
      </p>
      {change.proposedStartUtc ? (
        <p>
          {c.changes.proposedWindow}:{' '}
          {formatVisitDateTime(change.proposedStartUtc, locale, change.visit.timezoneSnapshot)}
        </p>
      ) : null}
      <p>
        {c.changes.customerReason}: {change.reason}
      </p>
      {change.status === 'PENDING' ? (
        <>
          <p>{c.changes.approveHelp}</p>
          <ChangeApprovalDialog
            change={change}
            locale={locale}
            pending={pending}
            onApprove={onApprove}
          />
          <Field id={`decline-${change.id}`} label={c.changes.rejectReason}>
            <Textarea
              id={`decline-${change.id}`}
              name="declineReason"
              autoComplete="off"
              value={reason}
              minLength={5}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button
            variant="danger"
            disabled={pending || reason.trim().length < 5}
            onClick={() => onDecline(reason)}
          >
            {c.changes.reject}
          </Button>
        </>
      ) : change.decisionReason ? (
        <p>{change.decisionReason}</p>
      ) : null}
    </article>
  );
}

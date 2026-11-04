'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError } from '../../lib/api-client';
import { PortalFrame } from '../../components/layout/portal-frame';
import { Button } from '../../components/ui/button';
import { Field, Input, Textarea } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import ar from '../../messages/ar/customer-visits.json';
import en from '../../messages/en/customer-visits.json';
import {
  listMyVisits,
  getMyVisit,
  requestChange,
  withdrawChange,
  type CustomerVisit,
  type ChangeInput,
} from './api';
import { canRequestChange, validChangeInput } from './policies';
import { formatDateTime } from '../../lib/date-time';
import '../../components/layout/visit-flow.css';
import { useWorkspaceQuery } from '../../lib/use-workspace-query';

function errorText(c: typeof en, error: unknown) {
  if (!(error instanceof ApiRequestError)) return c.error;
  if ([401, 403, 404].includes(error.status)) return c.denied;
  if (error.code === 'CHANGE_REQUEST_PENDING') return c.changePending;
  if (error.code === 'CHANGE_CUTOFF_EXCEEDED') return c.cutoffExceeded;
  return [409, 422].includes(error.status) ? c.validation : c.error;
}
export function CustomerVisitsScreen({ locale }: { locale: Locale }) {
  const c = locale === 'ar' ? ar : en;
  const [items, setItems] = useState<CustomerVisit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const { search, update } = useWorkspaceQuery();
  const selected = new URLSearchParams(search).get('visit');
  const setSelected = (value: string | null) => update({ visit: value });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  async function reload() {
    const data = await listMyVisits();
    setItems(data.items);
    setCursor(data.nextCursor);
  }
  useEffect(() => {
    const controller = new AbortController();
    void listMyVisits(undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data.items);
          setCursor(data.nextCursor);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(c, e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [c]);
  return (
    <PortalFrame locale={locale} path={`/my/visits${search}`}>
      <div className="raak-execution">
        <h1>{c.myVisits}</h1>
        <p>{c.intro}</p>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                await reload();
                setError('');
              } catch (e) {
                setError(errorText(c, e));
              }
            })
          }
        >
          {c.refresh}
        </Button>
        {error ? <Feedback title={error} tone="error" /> : null}
        {loading ? (
          <Feedback title={c.loading} />
        ) : !items.length && !error ? (
          <Feedback title={c.empty} />
        ) : null}
        <div className="raak-visit-cards">
          {items.map((v) => (
            <article key={v.id} data-customer-visit={v.id} className="raak-card">
              <h2>{v.patient.displayName}</h2>
              <p>{locale === 'ar' ? v.serviceNameSnapshot.nameAr : v.serviceNameSnapshot.nameEn}</p>
              <p>{formatDateTime(v.scheduledStartUtc, locale, v.timezoneSnapshot)}</p>
              <p>{c.states[v.status as keyof typeof c.states] ?? v.status}</p>
              {v.pendingChange ? <Feedback title={c.pendingChange} /> : null}
              <Button onClick={() => setSelected(v.id)}>{c.open}</Button>
            </article>
          ))}
        </div>
        {cursor ? (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const data = await listMyVisits(cursor);
                  setItems((old) => [
                    ...new Map([...old, ...data.items].map((v) => [v.id, v])).values(),
                  ]);
                  setCursor(data.nextCursor);
                } catch (e) {
                  setError(errorText(c, e));
                }
              })
            }
          >
            {c.refresh}
          </Button>
        ) : null}
        {selected ? (
          <CustomerVisitPanel
            key={selected}
            id={selected}
            locale={locale}
            onClose={() => setSelected(null)}
            onChanged={reload}
          />
        ) : null}
      </div>
    </PortalFrame>
  );
}

function CustomerVisitPanel({
  id,
  locale,
  onClose,
  onChanged,
}: {
  id: string;
  locale: Locale;
  onClose(): void;
  onChanged(): Promise<void>;
}) {
  const c = locale === 'ar' ? ar : en;
  const [visit, setVisit] = useState<CustomerVisit | null>(null);
  const [opener] = useState(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [type, setType] = useState<'CANCEL' | 'RESCHEDULE'>('RESCHEDULE');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success' | 'info'>('info');
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    void getMyVisit(id)
      .then((v) => {
        if (active) setVisit(v);
      })
      .catch((e) => {
        if (active) {
          setTone('error');
          setMessage(errorText(c, e));
        }
      });
    return () => {
      active = false;
    };
  }, [id, c]);
  function run(action: () => Promise<unknown>) {
    start(async () => {
      try {
        await action();
      } catch (e) {
        setTone('error');
        setMessage(errorText(c, e));
        return;
      }
      setTone('success');
      setMessage(c.saved);
      try {
        setVisit(await getMyVisit(id));
        await onChanged();
      } catch {
        setTone('info');
        setMessage(c.savedRefreshFailed);
      }
    });
  }
  const input: ChangeInput =
    type === 'CANCEL' ? { type, reason } : { type, reason, proposedDate: date, proposedTime: time };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener?.focus();
        }}
      >
        <header className="rv-dialog-header">
          <div>
            <DialogTitle>{c.myVisits}</DialogTitle>
            <DialogDescription>{c.originalNote}</DialogDescription>
          </div>
          <Button disabled={pending} variant="secondary" onClick={onClose}>
            {c.close}
          </Button>
        </header>
        <div className="rv-dialog-body">
          {message ? <Feedback tone={tone} title={message} /> : null}
          {!visit ? (
            message ? null : (
              <Feedback title={c.loading} />
            )
          ) : (
            <div className="raak-execution">
              <h2>{visit.patient.displayName}</h2>
              <p>
                {formatDateTime(visit.scheduledStartUtc, locale, visit.timezoneSnapshot)} –{' '}
                {formatDateTime(visit.scheduledEndUtc, locale, visit.timezoneSnapshot)}
              </p>
              <p dir="ltr">{visit.timezoneSnapshot}</p>
              {visit.pendingChange ? <Feedback title={c.pendingChange} /> : null}
              {canRequestChange(visit) ? (
                <form
                  className="raak-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (validChangeInput(input)) run(() => requestChange(id, input));
                  }}
                >
                  <h3>{c.requestChange}</h3>
                  <div className="raak-actions">
                    <Button
                      variant={type === 'RESCHEDULE' ? 'primary' : 'secondary'}
                      onClick={() => setType('RESCHEDULE')}
                    >
                      {c.requestReschedule}
                    </Button>
                    <Button
                      variant={type === 'CANCEL' ? 'primary' : 'secondary'}
                      onClick={() => setType('CANCEL')}
                    >
                      {c.requestCancel}
                    </Button>
                  </div>
                  {type === 'RESCHEDULE' ? (
                    <>
                      <Field id="proposed-date" label={c.proposedDate}>
                        <Input
                          id="proposed-date"
                          name="proposedDate"
                          autoComplete="off"
                          dir="ltr"
                          type="date"
                          value={date}
                          required
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </Field>
                      <Field id="proposed-time" label={c.proposedTime}>
                        <Input
                          id="proposed-time"
                          name="proposedTime"
                          autoComplete="off"
                          dir="ltr"
                          type="time"
                          value={time}
                          required
                          onChange={(e) => setTime(e.target.value)}
                        />
                      </Field>
                    </>
                  ) : null}
                  <Field id="change-reason" label={c.reason} help={c.reasonHelp}>
                    <Textarea
                      id="change-reason"
                      name="reason"
                      autoComplete="off"
                      minLength={10}
                      maxLength={1000}
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  <Button type="submit" disabled={pending || !validChangeInput(input)}>
                    {c.submitRequest}
                  </Button>
                </form>
              ) : null}
              <h3>{c.changeRequests}</h3>
              {visit.changeRequests.length ? (
                visit.changeRequests.map((change) => (
                  <article className="raak-card" key={change.id}>
                    <p>
                      {c.pendingChangeType[change.type]} · {c.changeStatus[change.status]} ·{' '}
                      {c.urgency[change.urgency]}
                    </p>
                    {change.proposedStartUtc ? (
                      <p>
                        {formatDateTime(change.proposedStartUtc, locale, visit.timezoneSnapshot)}
                      </p>
                    ) : null}
                    {change.decisionReason ? (
                      <p>
                        {c.decisionReason}: {change.decisionReason}
                      </p>
                    ) : null}
                    {change.status === 'PENDING' ? (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => run(() => withdrawChange(change.id))}
                      >
                        {c.withdraw}
                      </Button>
                    ) : null}
                  </article>
                ))
              ) : (
                <p>{c.noChangeRequests}</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

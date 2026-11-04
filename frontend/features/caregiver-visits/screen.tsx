'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { PortalFrame } from '../../components/layout/portal-frame';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { StatusBadge } from '../../components/ui/status-badge';
import { listCaregiverVisits } from './api';
import type { CaregiverVisitSummary } from './contracts';
import { caregiverVisitCopy, caregiverVisitError, formatDateTime } from './copy';
import { groupVisitsByStatus, localToday, shiftDate, VISIT_SECTION_ORDER } from './policies';
import { ExecutionPanel } from './visit-execution-panel';
import '../../components/layout/visit-flow.css';
import { useWorkspaceQuery } from '../../lib/use-workspace-query';

export function CaregiverVisitsScreen({ locale }: { locale: Locale }) {
  const c = caregiverVisitCopy(locale);
  const { search, update } = useWorkspaceQuery();
  const params = new URLSearchParams(search);
  const date = params.get('date') ?? '';
  const selected = params.get('visit');
  const setDate = useCallback(
    (value: string) => update({ date: value || null, visit: null }),
    [update],
  );
  const setSelected = (value: string | null) => update({ visit: value });
  const [timezone, setTimezone] = useState('');
  const [visits, setVisits] = useState<CaregiverVisitSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const openButtons = useRef(new Map<string, HTMLButtonElement>());
  const load = useCallback(async () => {
    const data = await listCaregiverVisits(date ? { from: date, to: date } : {});
    setVisits(data.items);
    setCursor(data.nextCursor);
    setTimezone(data.timezone);
  }, [date]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void listCaregiverVisits(date ? { from: date, to: date } : {}, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setTimezone(data.timezone);
        if (!date) {
          update({ date: localToday(data.timezone) });
          return;
        }
        setVisits(data.items);
        setCursor(data.nextCursor);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(caregiverVisitError(c, e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, c, update]);
  const groups = groupVisitsByStatus(visits);
  return (
    <PortalFrame locale={locale} path={`/caregiver/visits${search}`}>
      <div className="raak-execution">
        <div className="rv-page-heading">
          <div>
            <h1>{c.myVisits}</h1>
            <p>{c.intro}</p>
          </div>
          <Link href={`/${locale}/caregiver/profile`}>{c.profile}</Link>
        </div>
        <div className="raak-actions">
          <Button variant="secondary" disabled={!date} onClick={() => setDate(shiftDate(date, -1))}>
            {c.prevDay}
          </Button>
          <Field id="visit-date" label={c.today}>
            <Input
              id="visit-date"
              name="date"
              autoComplete="off"
              dir="ltr"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Button variant="secondary" disabled={!date} onClick={() => setDate(shiftDate(date, 1))}>
            {c.nextDay}
          </Button>
          <Button variant="ghost" onClick={() => timezone && setDate(localToday(timezone))}>
            {c.today}
          </Button>
        </div>
        <p dir="ltr">{timezone}</p>
        {error ? <Feedback tone="error" title={error} /> : null}
        {loading ? (
          <Feedback title={c.loading} />
        ) : visits.length === 0 ? (
          <Feedback title={c.empty} />
        ) : null}
        {!loading
          ? VISIT_SECTION_ORDER.map((status) =>
              groups[status].length ? (
                <section key={status}>
                  <h2>{c.sections[status]}</h2>
                  <div className="raak-visit-cards">
                    {groups[status].map((visit) => (
                      <article key={visit.id} className="raak-card">
                        <StatusBadge
                          tone={
                            status === 'COMPLETED'
                              ? 'completed'
                              : status === 'IN_PROGRESS'
                                ? 'in_progress'
                                : 'scheduled'
                          }
                        >
                          {c.states[status]}
                        </StatusBadge>
                        <h3>{visit.patient.displayName}</h3>
                        <p>
                          {locale === 'ar'
                            ? visit.serviceNameSnapshot.nameAr
                            : visit.serviceNameSnapshot.nameEn}
                        </p>
                        <p>
                          {formatDateTime(visit.scheduledStartUtc, locale, visit.timezoneSnapshot)}
                        </p>
                        <Button
                          ref={(node) => {
                            if (node) openButtons.current.set(visit.id, node);
                            else openButtons.current.delete(visit.id);
                          }}
                          onClick={() => setSelected(visit.id)}
                        >
                          {c.open}
                        </Button>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null,
            )
          : null}
        {cursor ? (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const data = await listCaregiverVisits({ from: date, to: date, cursor });
                  setVisits((old) => [
                    ...new Map([...old, ...data.items].map((v) => [v.id, v])).values(),
                  ]);
                  setCursor(data.nextCursor);
                } catch (e) {
                  setError(caregiverVisitError(c, e));
                }
              })
            }
          >
            {c.nextPage}
          </Button>
        ) : null}
        {selected ? (
          <ExecutionPanel
            key={selected}
            visitId={selected}
            locale={locale}
            onClose={() => setSelected(null)}
            onChanged={load}
            returnFocus={() => openButtons.current.get(selected) ?? null}
          />
        ) : null}
      </div>
    </PortalFrame>
  );
}

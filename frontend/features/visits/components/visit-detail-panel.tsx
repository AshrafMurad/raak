'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { Field, Textarea } from '../../../components/ui/field';
import { StatusBadge } from '../../../components/ui/status-badge';
import { formatVisitDateTime, localizedVisitService, visitCopy } from '../copy';
import { useVisitDetail } from '../hooks/use-visit-detail';
import { isValidActionReason, visitActionFor, visitStatusTone } from '../policies';
import { CandidatePicker } from './candidate-picker';
import { VisitReviewPanel } from './visit-review-panel';

/** One visit's detail: summary, task snapshot, assignment history and the
 * assign/reassign workflow. The panel renders typed state and semantic
 * callbacks only — endpoint paths and payloads live in the API adapter. */
export function VisitDetailPanel({
  locale,
  visitId,
  onClose,
  onChanged,
}: {
  locale: Locale;
  visitId: string;
  onClose(): void;
  onChanged(): Promise<void>;
}) {
  const c = visitCopy(locale);
  const detail = useVisitDetail({ visitId, locale, onChanged });
  const { visit, candidates, message, tone, pending } = detail;
  const [caregiverId, setCaregiverId] = useState('');
  const [reason, setReason] = useState('');

  // Preselect the first advisory candidate when a new candidate result arrives.
  useEffect(() => {
    setCaregiverId(candidates?.items[0]?.caregiverId ?? '');
  }, [candidates]);

  if (!visit) {
    return <Feedback title={message || c.loading} tone={message ? 'error' : 'info'} />;
  }
  const action = visitActionFor(visit);

  return (
    <section className="raak-card" aria-label={c.visitDetail}>
      <div className="raak-scheduling-list-row">
        <div>
          <h2>
            {visit.patient.displayName} · {localizedVisitService(visit.serviceNameSnapshot, locale)}
          </h2>
          <p className="raak-scheduling-code raak-scheduling-meta">{visit.id}</p>
        </div>
        <StatusBadge tone={visitStatusTone(visit.status)}>{c.states[visit.status]}</StatusBadge>
        <StatusBadge tone={visitStatusTone(visit.assignmentHealth)}>
          {c.states[visit.assignmentHealth]}
        </StatusBadge>
        <Button variant="secondary" onClick={onClose}>
          {c.close}
        </Button>
      </div>
      {message ? <Feedback tone={tone} title={message} /> : null}
      <dl className="rv-detail-list">
        <div>
          <dt>{c.scheduledWindow}</dt>
          <dd>
            {formatVisitDateTime(visit.scheduledStartUtc, locale, visit.timezoneSnapshot)} –{' '}
            {formatVisitDateTime(visit.scheduledEndUtc, locale, visit.timezoneSnapshot)}
          </dd>
        </div>
        <div>
          <dt>{c.timezone}</dt>
          <dd dir="ltr">{visit.timezoneSnapshot}</dd>
        </div>
        <div>
          <dt>{c.caregiver}</dt>
          <dd>{visit.assignedCaregiver?.name ?? c.unassigned}</dd>
        </div>
        <div>
          <dt>{c.area}</dt>
          <dd className="raak-scheduling-code">{visit.areaId}</dd>
        </div>
      </dl>
      <section>
        <h3>{c.tasksSnapshot}</h3>
        {visit.tasks.length ? (
          <ul>
            {visit.tasks.map((task) => (
              <li key={task.id}>
                {task.descriptionSnapshot} · {task.isRequired ? c.required : c.optional}
                {task.outcome && task.outcome !== 'PENDING'
                  ? ` · ${c.taskOutcomes[task.outcome as keyof typeof c.taskOutcomes] ?? c.taskOutcomes.PENDING}`
                  : ''}
                {task.notDoneReason ? ` · ${task.notDoneReason}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <Feedback title={c.tasksSnapshot} />
        )}
      </section>
      <section>
        <h3>{c.assignmentHistory}</h3>
        {visit.assignmentHistory.length ? (
          <ul>
            {visit.assignmentHistory.map((item) => (
              <li key={item.id}>
                {item.oldCaregiverName ?? c.unassigned} →{' '}
                {item.newCaregiverName ?? item.newCaregiverId}
                {' · '}
                {formatVisitDateTime(item.createdAt, locale)}
                {item.reason ? ` · ${item.reason}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>{c.noHistory}</p>
        )}
      </section>
      {action ? (
        <section className="raak-card">
          <h3>{c.candidates}</h3>
          <p>{c.advisory}</p>
          <CandidatePicker
            locale={locale}
            candidates={candidates}
            caregiverId={caregiverId}
            pending={pending}
            onLoad={() => detail.findCandidates()}
            onCaregiverChange={setCaregiverId}
          />
          {action === 'reassign' ? (
            <Field id="reassign-reason" label={c.reassignReason}>
              <Textarea
                id="reassign-reason"
                required
                minLength={5}
                maxLength={300}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          ) : null}
          <Button
            disabled={
              pending ||
              !caregiverId ||
              (action === 'reassign' && !isValidActionReason(reason, true))
            }
            onClick={() =>
              action === 'assign'
                ? detail.assign(caregiverId, reason)
                : detail.reassign(caregiverId, reason)
            }
          >
            {action === 'assign' ? c.assign : c.reassign}
          </Button>
        </section>
      ) : null}
      {visit.status === 'COMPLETED' ? (
        <VisitReviewPanel
          visit={visit}
          locale={locale}
          onChanged={async () => {
            await onChanged();
            await detail.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Field, Textarea } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import {
  getCaregiverVisit,
  startVisit,
  completeVisit,
  saveVisitNote,
  markTaskDone,
  markTaskNotDone,
} from './api';
import type { CaregiverVisitDetail, CaregiverVisitTask } from './contracts';
import { caregiverVisitCopy, caregiverVisitError, formatDateTime } from './copy';
import { allRequiredTasksClassified, isValidNoteBody, isValidNotDoneReason } from './policies';

function TaskRow({
  task,
  locale,
  disabled,
  onSave,
}: {
  task: CaregiverVisitTask;
  locale: Locale;
  disabled: boolean;
  onSave(outcome: 'DONE' | 'NOT_DONE', reason: string): void;
}) {
  const c = caregiverVisitCopy(locale);
  const [reason, setReason] = useState(task.notDoneReason ?? '');
  return (
    <section className="raak-card" data-task={task.id}>
      <h3>{task.descriptionSnapshot}</h3>
      <p>
        {task.isRequired ? c.required : c.optional} · {c.taskOutcome[task.outcome]}
      </p>
      <Field id={`reason-${task.id}`} label={c.notDoneReason}>
        <Textarea
          id={`reason-${task.id}`}
          name="notDoneReason"
          autoComplete="off"
          value={reason}
          maxLength={500}
          disabled={disabled}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="raak-actions">
        <Button disabled={disabled} onClick={() => onSave('DONE', '')}>
          {c.markDone}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || !isValidNotDoneReason(reason)}
          onClick={() => onSave('NOT_DONE', reason)}
        >
          {c.markNotDone}
        </Button>
      </div>
    </section>
  );
}

export function ExecutionPanel({
  visitId,
  locale,
  onClose,
  onChanged,
}: {
  visitId: string;
  locale: Locale;
  onClose(): void;
  onChanged(): Promise<void>;
}) {
  const c = caregiverVisitCopy(locale);
  const [visit, setVisit] = useState<CaregiverVisitDetail | null>(null);
  const [opener] = useState(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success' | 'info'>('info');
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    void getCaregiverVisit(visitId)
      .then((v) => {
        if (active) {
          setVisit(v);
          setBody(v.note?.body ?? '');
        }
      })
      .catch((e) => {
        if (active) {
          setMessage(caregiverVisitError(c, e));
          setTone('error');
        }
      });
    return () => {
      active = false;
    };
  }, [visitId, c]);
  function run(command: () => Promise<unknown>) {
    start(async () => {
      setMessage('');
      try {
        await command();
      } catch (e) {
        setMessage(caregiverVisitError(c, e));
        setTone('error');
        return;
      }
      setTone('success');
      setMessage(c.saved);
      try {
        const v = await getCaregiverVisit(visitId);
        setVisit(v);
        await onChanged();
      } catch {
        setTone('info');
        setMessage(c.savedRefreshFailed);
      }
    });
  }
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
            <DialogDescription>{c.intro}</DialogDescription>
          </div>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {c.close}
          </Button>
        </header>
        <div className="rv-dialog-body">
          {message ? <Feedback title={message} tone={tone} /> : null}
          {!visit ? (
            message ? null : (
              <Feedback title={c.loading} />
            )
          ) : (
            <div className="raak-execution">
              <h2>{visit.patient.displayName}</h2>
              <p data-visit-status={visit.status}>{c.states[visit.status]}</p>
              <p>{formatDateTime(visit.scheduledStartUtc, locale, visit.timezoneSnapshot)}</p>
              <dl>
                <dt>{c.startedAt}</dt>
                <dd>
                  {visit.actualStartAt
                    ? formatDateTime(visit.actualStartAt, locale, visit.timezoneSnapshot)
                    : c.notStarted}
                </dd>
                <dt>{c.completedAt}</dt>
                <dd>
                  {visit.actualEndAt
                    ? formatDateTime(visit.actualEndAt, locale, visit.timezoneSnapshot)
                    : '—'}
                </dd>
              </dl>
              {visit.status === 'SCHEDULED' ? (
                <>
                  <p>{c.startHelp}</p>
                  <Button disabled={pending} onClick={() => run(() => startVisit(visitId))}>
                    {c.start}
                  </Button>
                </>
              ) : null}
              <h2>{c.tasks}</h2>
              {visit.tasks.map((task) => (
                <TaskRow
                  key={`${task.id}-${task.outcome}`}
                  task={task}
                  locale={locale}
                  disabled={pending || visit.status !== 'IN_PROGRESS'}
                  onSave={(outcome, reason) =>
                    run(() =>
                      outcome === 'DONE'
                        ? markTaskDone(visitId, task.id)
                        : markTaskNotDone(visitId, task.id, reason),
                    )
                  }
                />
              ))}
              <Field
                id="visit-note"
                label={visit.status === 'COMPLETED' ? c.noteFinalized : c.note}
                help={c.noteHelp}
              >
                <Textarea
                  id="visit-note"
                  name="note"
                  autoComplete="off"
                  maxLength={5000}
                  value={body}
                  disabled={pending || visit.status !== 'IN_PROGRESS'}
                  onChange={(e) => setBody(e.target.value)}
                />
              </Field>
              {visit.status === 'IN_PROGRESS' ? (
                <div className="raak-actions">
                  <Button
                    variant="secondary"
                    disabled={pending || !isValidNoteBody(body)}
                    onClick={() => run(() => saveVisitNote(visitId, body))}
                  >
                    {c.saveNote}
                  </Button>
                  <Button
                    disabled={pending || !allRequiredTasksClassified(visit)}
                    onClick={() =>
                      run(async () => {
                        if (body.trim() && body !== visit.note?.body)
                          await saveVisitNote(visitId, body);
                        await completeVisit(visitId);
                      })
                    }
                  >
                    {c.complete}
                  </Button>
                  <p>{c.completeHelp}</p>
                </div>
              ) : null}
              {visit.status === 'COMPLETED' ? (
                <p>
                  {c.review[visit.reviewStatus as keyof typeof c.review] ?? c.review.NEEDS_REVIEW}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

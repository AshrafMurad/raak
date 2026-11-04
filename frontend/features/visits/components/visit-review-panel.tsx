'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Field, Textarea } from '../../../components/ui/field';
import { Feedback } from '../../../components/ui/feedback';
import { visitCopy, visitError, formatVisitDateTime } from '../copy';
import {
  getVisitDocumentation,
  reviewVisit,
  correctVisit,
  type VisitDocumentation,
} from '../review-api';
import type { VisitDetailData } from '../contracts';
import '../../../components/layout/visit-flow.css';

export function VisitReviewPanel({
  visit,
  locale,
  onChanged,
}: {
  visit: VisitDetailData;
  locale: Locale;
  onChanged(): Promise<void>;
}) {
  const c = visitCopy(locale);
  const [documentation, setDocumentation] = useState<VisitDocumentation | null>(null);
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'success' | 'error'>('info');
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    void getVisitDocumentation(visit.id)
      .then((value) => {
        if (active) setDocumentation(value);
      })
      .catch((e) => {
        if (active) {
          setTone('error');
          setMessage(visitError(c, e));
        }
      });
    return () => {
      active = false;
    };
  }, [visit.id, visit.version, c]);
  function run(command: () => Promise<unknown>) {
    start(async () => {
      try {
        await command();
      } catch (e) {
        setTone('error');
        setMessage(visitError(c, e));
        return;
      }
      setTone('success');
      setMessage(c.saved);
      setBody('');
      setReason('');
      try {
        setDocumentation(await getVisitDocumentation(visit.id));
        await onChanged();
      } catch {
        setTone('info');
        setMessage(c.savedRefreshFailed);
      }
    });
  }
  return (
    <section className="raak-execution" aria-label={c.review.notes}>
      <h3>{c.review.notes}</h3>
      {documentation?.reviews.map((review) => (
        <article className="raak-card" key={review.id}>
          <h4>{c.review.states.REVIEWED}</h4>
          <p>{formatVisitDateTime(review.createdAt, locale, visit.timezoneSnapshot)}</p>
          {review.noteRestricted ? <p>{review.noteRestricted}</p> : null}
        </article>
      ))}
      {message ? <Feedback tone={tone} title={message} /> : null}
      <p>
        {c.review.status}:{' '}
        {c.review.states[documentation?.reviewStatus as keyof typeof c.review.states] ??
          c.review.states.NEEDS_REVIEW}
      </p>
      <dl className="rv-detail-list">
        <div>
          <dt>{c.review.actualStart}</dt>
          <dd>
            {visit.actualStartAt
              ? formatVisitDateTime(visit.actualStartAt, locale, visit.timezoneSnapshot)
              : '—'}
          </dd>
        </div>
        <div>
          <dt>{c.review.actualEnd}</dt>
          <dd>
            {visit.actualEndAt
              ? formatVisitDateTime(visit.actualEndAt, locale, visit.timezoneSnapshot)
              : '—'}
          </dd>
        </div>
      </dl>
      {documentation?.notes.length ? (
        documentation.notes.map((note) => (
          <article key={note.id} className="raak-card">
            <h4>
              {note.isAddendum ? c.review.addendum : c.review.originalNote} ·{' '}
              {note.isDraft ? c.review.draft : c.review.finalized}
            </h4>
            <p style={{ whiteSpace: 'pre-wrap' }}>{note.bodyRestricted}</p>
            {note.reason ? <p>{note.reason}</p> : null}
            <p>{formatVisitDateTime(note.createdAt, locale, visit.timezoneSnapshot)}</p>
          </article>
        ))
      ) : (
        <p>{c.review.noNotes}</p>
      )}
      {documentation?.reviewStatus !== 'REVIEWED' ? (
        <>
          <Field id="review-note" label={c.review.reviewNote}>
            <Textarea
              id="review-note"
              name="reviewNote"
              autoComplete="off"
              maxLength={1000}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </Field>
          <Button
            disabled={pending}
            onClick={() => run(() => reviewVisit(visit.id, visit.version, reviewNote))}
          >
            {c.review.markReviewed}
          </Button>
        </>
      ) : null}
      <form
        className="raak-card raak-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            correctVisit(
              visit.id,
              visit.version,
              body,
              reason,
              documentation?.notes.find((n) => !n.isAddendum)?.id ?? null,
            ),
          );
        }}
      >
        <h4>{c.review.addCorrection}</h4>
        <p>{c.review.correctionHelp}</p>
        <Field id="correction-body" label={c.review.correctionBody}>
          <Textarea
            id="correction-body"
            name="correctionBody"
            autoComplete="off"
            required
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Field id="correction-reason" label={c.review.correctionReason}>
          <Textarea
            id="correction-reason"
            name="correctionReason"
            autoComplete="off"
            required
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={pending || !body.trim() || reason.trim().length < 5}>
          {c.review.addCorrection}
        </Button>
      </form>
    </section>
  );
}

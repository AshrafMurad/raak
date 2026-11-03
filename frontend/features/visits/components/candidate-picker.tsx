'use client';

import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { Field } from '../../../components/ui/field';
import { Select } from '../../../components/ui/select';
import type { CandidateResult } from '../contracts';
import { visitCopy } from '../copy';

/** Advisory candidate lookup and picker. Eligibility remains advisory; the
 * server rechecks eligibility transactionally at assignment time. */
export function CandidatePicker({
  locale,
  candidates,
  caregiverId,
  pending,
  onLoad,
  onCaregiverChange,
}: {
  locale: Locale;
  candidates: CandidateResult | null;
  caregiverId: string;
  pending: boolean;
  onLoad(): void;
  onCaregiverChange(caregiverId: string): void;
}) {
  const c = visitCopy(locale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <>
      <Button variant="secondary" disabled={pending} onClick={onLoad}>
        {c.loadCandidates}
      </Button>
      {candidates ? (
        <>
          {candidates.items.length ? (
            <div className="raak-candidate-list">
              <Field id="visit-candidate" label={c.caregiver}>
                <Select
                  id="visit-candidate"
                  name="candidate"
                  label={c.caregiver}
                  dir={dir}
                  value={caregiverId}
                  options={candidates.items.map((candidate) => ({
                    value: candidate.caregiverId,
                    label: `${candidate.name}${candidate.isPrimary ? ` · ${c.primary}` : ''}`,
                  }))}
                  onValueChange={onCaregiverChange}
                />
              </Field>
              {candidates.items.map((candidate) => (
                <article className="raak-candidate" key={candidate.caregiverId}>
                  <strong>{candidate.name}</strong>
                  <p>
                    {candidate.isPrimary ? `${c.primary} · ` : ''}
                    {candidate.sameArea ? `${c.sameArea} · ` : ''}
                    {c.activeLoad}: {candidate.load}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <Feedback title={c.noEligible} tone="error" />
          )}
          {candidates.excluded.length ? (
            <details>
              <summary>
                {c.excludedCandidates} ({candidates.excluded.length})
              </summary>
              <ul>
                {candidates.excluded.map((candidate) => (
                  <li key={candidate.caregiverId}>
                    {candidate.name}:{' '}
                    {candidate.reasons
                      .map(
                        (reasonCode) =>
                          c.exclusions[reasonCode as keyof typeof c.exclusions] ?? reasonCode,
                      )
                      .join(', ')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </>
  );
}

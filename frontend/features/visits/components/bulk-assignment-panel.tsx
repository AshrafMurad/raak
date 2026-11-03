'use client';

import { useState } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { Field, Textarea } from '../../../components/ui/field';
import { Select } from '../../../components/ui/select';
import type { BulkAssignmentResult, CaregiverOption } from '../contracts';
import { visitCopy } from '../copy';
import { isBulkAssignReady } from '../policies';

/** Bulk assignment controls and the last stored server result. Emits one
 * semantic callback; payload construction and idempotency keys stay in the
 * API/hook layer. */
export function BulkAssignmentPanel({
  locale,
  caregivers,
  selectedCount,
  pending,
  result,
  onAssignSelected,
}: {
  locale: Locale;
  caregivers: CaregiverOption[];
  selectedCount: number;
  pending: boolean;
  result: BulkAssignmentResult | null;
  onAssignSelected(caregiverId: string, reason: string): void;
}) {
  const c = visitCopy(locale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const [caregiverId, setCaregiverId] = useState('');
  const [reason, setReason] = useState('');
  return (
    <section className="raak-card">
      <h2>{c.bulkAssignment}</h2>
      <p>{c.advisory}</p>
      <div className="raak-scheduling-grid">
        <Field id="bulk-caregiver" label={c.selectCaregiver}>
          <Select
            id="bulk-caregiver"
            name="bulkCaregiver"
            label={c.selectCaregiver}
            dir={dir}
            value={caregiverId}
            placeholder={c.selectCaregiver}
            options={caregivers.map((item) => ({
              value: item.id,
              label: item.name ?? item.id,
            }))}
            onValueChange={setCaregiverId}
          />
        </Field>
        <Field id="bulk-reason" label={c.bulkReason}>
          <Textarea
            id="bulk-reason"
            minLength={5}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
      <Button
        disabled={!isBulkAssignReady({ selectedCount, caregiverId, reason, pending })}
        onClick={() => onAssignSelected(caregiverId, reason)}
      >
        {c.assignSelected} ({selectedCount})
      </Button>
      {result ? (
        <Feedback tone={result.summary.failed ? 'error' : 'success'} title={c.bulkResult}>
          <p>
            {c.succeeded}: {result.summary.succeeded} · {c.failed}: {result.summary.failed}
          </p>
          <ul>
            {result.results.map((item) => (
              <li key={item.visitId} className="raak-scheduling-code">
                {item.visitId}: {item.ok ? c.succeeded : `${c.failed} (${item.code ?? c.error})`}
              </li>
            ))}
          </ul>
        </Feedback>
      ) : null}
    </section>
  );
}

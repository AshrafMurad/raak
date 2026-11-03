'use client';

import type { Locale } from '../../../lib/i18n';
import { carePlanCopy } from '../copy';
import type { CarePlanVersion, OptionRecord } from '../contracts';
import { planContentFromVersion } from '../mappers';
import { PlanEditor } from './plan-editor';

export function PlanDraftPanel({
  locale,
  version,
  primaryCaregiverId,
  caregivers,
  pending,
  onSave,
}: {
  locale: Locale;
  version: CarePlanVersion;
  primaryCaregiverId: string | null;
  caregivers: OptionRecord[];
  pending: boolean;
  onSave(version: number, content: ReturnType<typeof planContentFromVersion>): void;
}) {
  const c = carePlanCopy(locale);
  return (
    <section className="raak-card">
      <h3>
        {c.saveDraft} · {c.version} {version.version}
      </h3>
      <PlanEditor
        key={version.id}
        locale={locale}
        caregivers={caregivers}
        initial={planContentFromVersion(version, primaryCaregiverId)}
        submitLabel={c.saveDraft}
        disabled={pending}
        onSubmit={(content) => onSave(version.version, content)}
      />
    </section>
  );
}

export function PlanRevisionPanel({
  locale,
  version,
  primaryCaregiverId,
  caregivers,
  pending,
  onRevise,
}: {
  locale: Locale;
  version: CarePlanVersion;
  primaryCaregiverId: string | null;
  caregivers: OptionRecord[];
  pending: boolean;
  onRevise(content: ReturnType<typeof planContentFromVersion>): void;
}) {
  const c = carePlanCopy(locale);
  return (
    <section className="raak-card">
      <h3>{c.revise}</h3>
      <p>{c.revisionHint}</p>
      <PlanEditor
        key={`revise-${version.id}`}
        locale={locale}
        caregivers={caregivers}
        initial={planContentFromVersion(version, primaryCaregiverId)}
        submitLabel={c.revise}
        disabled={pending}
        onSubmit={onRevise}
      />
    </section>
  );
}

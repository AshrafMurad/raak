'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { carePlanCopy, carePlanError, localizedPlanService } from '../copy';
import {
  canReviseCarePlan,
  carePlanStatusTone,
  lifecycleActions,
  resolveSelectedPlanVersion,
} from '../policies';
import { usePlanDetail } from '../hooks/use-plan-detail';
import { usePlanCommands } from '../hooks/use-plan-commands';
import type { OptionRecord } from '../contracts';
import { PlanSummary } from './plan-summary';
import { PlanDraftPanel, PlanRevisionPanel } from './plan-draft-panel';
import { PlanLifecycleDialog, type LifecycleAction } from './plan-lifecycle-dialog';
import { PlanVersionPanel } from './plan-version-panel';

export function PlanDetail({
  locale,
  planId,
  caregivers,
  onClose,
  onChanged,
}: {
  locale: Locale;
  planId: string;
  caregivers: OptionRecord[];
  onClose(): void;
  onChanged(): Promise<void>;
}) {
  const c = carePlanCopy(locale);
  const { plan, error, loading: detailLoading, reload } = usePlanDetail(planId);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [reason, setReason] = useState('');
  const [disposition, setDisposition] = useState<'KEEP' | 'CANCEL'>('KEEP');
  const commands = usePlanCommands({ planId, locale, reload, onChanged });

  useEffect(() => {
    if (plan) setSelectedVersion((current) => current ?? plan.currentVersion);
  }, [plan]);

  if (!plan) {
    return (
      <Feedback
        title={error ? carePlanError(c, error) : commands.message || c.loading}
        tone={commands.message ? 'error' : detailLoading ? 'info' : 'error'}
      />
    );
  }

  const version = resolveSelectedPlanVersion(plan.versions, selectedVersion, plan.currentVersion);
  const currentVersion = plan.versions.find((item) => item.version === plan.currentVersion);
  const openDraft = plan.versions.find((item) => item.status === 'DRAFT');

  return (
    <section className="raak-card" aria-label={c.planDetail}>
      <div className="raak-scheduling-list-row">
        <div>
          <h2>
            {plan.patient.displayName} · {localizedPlanService(plan, locale)}
          </h2>
          <p className="raak-scheduling-meta raak-scheduling-code">{plan.id}</p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          {c.close}
        </Button>
      </div>
      <PlanSummary
        statusLabel={c.states[plan.status]}
        tone={carePlanStatusTone(plan.status)}
        currentVersion={plan.currentVersion}
        plannedVisits={plan.plannedVisits}
        scheduledVisits={plan.scheduledVisits}
        labels={{
          version: c.version,
          plannedVisits: c.plannedVisits,
          scheduledVisits: c.scheduledVisits,
        }}
      />
      {commands.message ? <Feedback title={commands.message} tone={commands.tone} /> : null}
      <PlanVersionPanel
        locale={locale}
        plan={plan}
        version={version ?? undefined}
        preview={commands.preview}
        pending={commands.pending}
        onSelectVersion={(next) => {
          setSelectedVersion(next);
          commands.clearPreview();
        }}
        onApprove={commands.approve}
        onPreview={commands.requestPreview}
        onActivate={(next) => commands.activate(next, crypto.randomUUID())}
      />
      {openDraft ? (
        <PlanDraftPanel
          locale={locale}
          version={openDraft}
          primaryCaregiverId={plan.primaryCaregiverId}
          caregivers={caregivers}
          pending={commands.pending}
          onSave={commands.saveDraft}
        />
      ) : null}
      {!openDraft && canReviseCarePlan(plan) && currentVersion ? (
        <PlanRevisionPanel
          locale={locale}
          version={currentVersion}
          primaryCaregiverId={plan.primaryCaregiverId}
          caregivers={caregivers}
          pending={commands.pending}
          onRevise={(content) => commands.revise(content, setSelectedVersion)}
        />
      ) : null}
      <div className="raak-actions">
        {lifecycleActions(plan.status).includes('pause') ? (
          <Button variant="secondary" onClick={() => setAction('pause')}>
            {c.pause}
          </Button>
        ) : null}
        {lifecycleActions(plan.status).includes('resume') ? (
          <Button variant="secondary" onClick={() => setAction('resume')}>
            {c.resume}
          </Button>
        ) : null}
        {lifecycleActions(plan.status).includes('complete') ? (
          <Button variant="secondary" onClick={() => setAction('complete')}>
            {c.complete}
          </Button>
        ) : null}
        {lifecycleActions(plan.status).includes('cancel') ? (
          <Button variant="danger" onClick={() => setAction('cancel')}>
            {c.cancel}
          </Button>
        ) : null}
      </div>
      <PlanLifecycleDialog
        locale={locale}
        action={action}
        reason={reason}
        disposition={disposition}
        pending={commands.pending}
        onReasonChange={setReason}
        onDispositionChange={setDisposition}
        onClose={() => setAction(null)}
        onConfirm={() => {
          if (!action) return;
          commands.lifecycle(action, reason, disposition, () => {
            setAction(null);
            setReason('');
            setDisposition('KEEP');
          });
        }}
      />
    </section>
  );
}

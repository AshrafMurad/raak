'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { runConfirmedCommand } from '../../../lib/confirmed-command';
import { createRequestGeneration } from '../request-generation';
import {
  activateCarePlan,
  approveCarePlan,
  cancelCarePlan,
  completeCarePlan,
  editCarePlanDraft,
  pauseCarePlan,
  previewCarePlanGeneration,
  resumeCarePlan,
  reviseCarePlan,
} from '../api';
import { carePlanCopy, carePlanError } from '../copy';
import type { GenerationPreview, PlanContent } from '../contracts';
import type { Locale } from '../../../lib/i18n';

type LifecycleAction = 'pause' | 'resume' | 'complete' | 'cancel';

export function usePlanCommands({
  planId,
  locale,
  reload,
  onChanged,
}: {
  planId: string;
  locale: Locale;
  reload(): Promise<unknown>;
  onChanged(): Promise<void>;
}) {
  const c = carePlanCopy(locale);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');
  const previewGeneration = useRef(createRequestGeneration());
  const clearPreview = () => {
    previewGeneration.current.invalidate();
    setPreview(null);
  };
  useEffect(() => {
    const requests = previewGeneration.current;
    return () => requests.invalidate();
  }, [planId]);

  function execute(task: () => Promise<void>, success = c.saved, afterSuccess?: () => void) {
    startTransition(async () => {
      try {
        const result = await runConfirmedCommand(task, [reload, onChanged]);
        setMessage(result.refreshFailed ? c.savedRefreshFailed : success);
        setTone(result.refreshFailed ? 'info' : 'success');
        afterSuccess?.();
      } catch (error) {
        setMessage(carePlanError(c, error));
        setTone('error');
      }
    });
  }

  return {
    pending,
    message,
    tone,
    preview,
    clearMessage: () => setMessage(''),
    approve: (version: number) =>
      execute(async () => {
        await approveCarePlan(planId, version);
      }),
    requestPreview: (version: number) => {
      const generation = previewGeneration.current.next();
      startTransition(async () => {
        try {
          const result = await previewCarePlanGeneration(planId, version);
          if (previewGeneration.current.isCurrent(generation)) {
            setPreview(result);
            setMessage('');
          }
        } catch (error) {
          if (previewGeneration.current.isCurrent(generation)) {
            setMessage(carePlanError(c, error));
            setTone('error');
          }
        }
      });
    },
    activate: (version: number, idempotencyKey: string) =>
      execute(async () => {
        await activateCarePlan(planId, version, idempotencyKey);
      }, c.generated),
    saveDraft: (expectedDraftVersion: number, content: PlanContent) =>
      execute(async () => {
        await editCarePlanDraft(planId, { expectedDraftVersion, ...content });
        clearPreview();
      }),
    revise: (content: PlanContent, onRevised: (version: number) => void) =>
      execute(async () => {
        const revised = await reviseCarePlan(planId, content);
        clearPreview();
        onRevised(revised.version);
      }),
    lifecycle: (
      action: LifecycleAction,
      reason: string,
      disposition: 'KEEP' | 'CANCEL',
      afterSuccess: () => void,
    ) =>
      execute(
        async () => {
          if (action === 'pause') {
            await pauseCarePlan(planId, {
              plannedVisitsAction: disposition,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            });
          } else if (action === 'resume') await resumeCarePlan(planId);
          else if (action === 'complete')
            await completeCarePlan(planId, reason.trim() ? { reason: reason.trim() } : {});
          else {
            await cancelCarePlan(planId, {
              reason: reason.trim(),
              plannedVisitsAction: disposition,
            });
          }
        },
        c.saved,
        afterSuccess,
      ),
    clearPreview,
  };
}

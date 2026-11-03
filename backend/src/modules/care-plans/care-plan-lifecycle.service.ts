/**
 * Care-plan lifecycle commands (docs 04 BR-PLAN, docs 07 Sprint 5):
 * pause/resume/complete/cancel with the future-PLANNED visit disposition
 * (KEEP preserves, CANCEL cancels only future unassigned PLANNED visits —
 * confirmed SCHEDULED appointments are never silently cancelled). Retained
 * PLANNED visits under a non-ACTIVE plan stay non-assignable through Task 2's
 * assignment policy seam (`care-plan-assignment-policy.ts`), which scheduling
 * rechecks under lock at commit time. Plan lock order, reasons and
 * audit/outbox history are unchanged from the characterized behavior.
 */
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import {
  CancelCarePlanSchema,
  CompleteCarePlanSchema,
  PauseCarePlanSchema,
} from '../../contracts/careplans';
import { CarePlanEvents } from '../../contracts/events';
import type { AuthState } from '../auth/guards';
import { agencyAction } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { lockPlan } from './care-plan.repository';
import type { CarePlanService } from './care-plan.types';

export function createCarePlanLifecycleService(
  db: DatabaseClient,
  now: () => Date,
): Pick<CarePlanService, 'pause' | 'resume' | 'complete' | 'cancel'> {
  return {
    pause: (auth: AuthState, id: string, input: z.infer<typeof PauseCarePlanSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.manage');
        const plan = await lockPlan(tx, tenantId, id);
        if (plan.status !== 'ACTIVE')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Only an active plan can be paused.');
        const cancelled = await cancelFuturePlanned(
          tx,
          tenantId,
          id,
          input.plannedVisitsAction,
          now(),
        );
        await tx.carePlan.update({
          where: { tenantId_id: { tenantId, id } },
          data: { status: 'PAUSED' },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          id,
          CarePlanEvents.PAUSED,
          'care_plan',
          {
            plannedVisitsAction: input.plannedVisitsAction,
            cancelledVisits: cancelled,
          },
          input.reason,
        );
        return { id, status: 'PAUSED', cancelledVisits: cancelled };
      }),

    resume: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.manage');
        const plan = await lockPlan(tx, tenantId, id);
        if (plan.status !== 'PAUSED')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Only a paused plan can be resumed.');
        await tx.carePlan.update({
          where: { tenantId_id: { tenantId, id } },
          data: { status: 'ACTIVE' },
        });
        await recordChange(tx, auth, tenantId, id, CarePlanEvents.RESUMED, 'care_plan');
        return { id, status: 'ACTIVE' };
      }),

    complete: (auth: AuthState, id: string, input: z.infer<typeof CompleteCarePlanSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.manage');
        const plan = await lockPlan(tx, tenantId, id);
        if (plan.status !== 'ACTIVE' && plan.status !== 'PAUSED')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Only an active or paused plan can be completed.',
          );
        const open = await tx.visit.count({
          where: {
            tenantId,
            carePlanId: id,
            status: { in: ['PLANNED', 'SCHEDULED'] },
            scheduledStartUtc: { gt: now() },
          },
        });
        if (open > 0)
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Resolve future visits before completing the plan.',
            { futureVisits: open },
          );
        await tx.carePlan.update({
          where: { tenantId_id: { tenantId, id } },
          data: { status: 'COMPLETED', closedAt: now() },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          id,
          CarePlanEvents.COMPLETED,
          'care_plan',
          {},
          input.reason,
        );
        return { id, status: 'COMPLETED' };
      }),

    cancel: (auth: AuthState, id: string, input: z.infer<typeof CancelCarePlanSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.manage');
        const plan = await lockPlan(tx, tenantId, id);
        if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Plan is already closed.');
        const cancelled = await cancelFuturePlanned(
          tx,
          tenantId,
          id,
          input.plannedVisitsAction,
          now(),
        );
        await tx.carePlan.update({
          where: { tenantId_id: { tenantId, id } },
          data: { status: 'CANCELLED', closedAt: now() },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          id,
          CarePlanEvents.CANCELLED,
          'care_plan',
          { plannedVisitsAction: input.plannedVisitsAction, cancelledVisits: cancelled },
          input.reason,
        );
        return { id, status: 'CANCELLED', cancelledVisits: cancelled };
      }),
  };
}

/**
 * Guarded cancellation of future PLANNED unassigned visits only. Confirmed
 * (SCHEDULED) appointments are never silently cancelled (BR-PLAN, ADR-0012).
 */
async function cancelFuturePlanned(
  tx: Prisma.TransactionClient,
  tenantId: string,
  planId: string,
  action: 'KEEP' | 'CANCEL',
  now: Date,
) {
  // Match the assignment lock order, including KEEP: the disposition observes
  // a stable set of future visit rows without changing confirmed appointments.
  await tx.$queryRaw`SELECT id FROM visits
    WHERE tenant_id = ${tenantId}::uuid AND care_plan_id = ${planId}::uuid
      AND status IN ('PLANNED', 'SCHEDULED') AND scheduled_start_utc > ${now}
    ORDER BY id FOR UPDATE`;
  if (action !== 'CANCEL') return 0;
  const result = await tx.visit.updateMany({
    where: {
      tenantId,
      carePlanId: planId,
      status: 'PLANNED',
      assignedCaregiverId: null,
      scheduledStartUtc: { gt: now },
    },
    data: { status: 'CANCELLED', cancelledAt: now, cancelledReason: 'Care plan disposition' },
  });
  return result.count;
}

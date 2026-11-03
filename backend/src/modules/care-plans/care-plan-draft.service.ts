/**
 * Care-plan draft and revision commands (docs 04 BR-PLAN, docs 07 Sprint 5):
 * plan creation with the Task 3 exact-request linkage guard, open-draft
 * editing and version-incrementing revision. Each command runs inside one
 * transaction that owns recurrence validation, caregiver/tenant checks,
 * version writes and audit/outbox history; approved/activated versions stay
 * immutable and lock order is unchanged from the characterized behavior.
 */
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import {
  CarePlanCreateSchema,
  CarePlanDraftEditSchema,
  CarePlanReviseSchema,
} from '../../contracts/careplans';
import { CarePlanEvents } from '../../contracts/events';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing, stale } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { expandOccurrences } from './recurrence';
import {
  findLinkedRequest,
  lockPlan,
  openDraft,
  openDraftGuard,
  serviceSnapshot,
  versionProjection,
} from './care-plan.repository';
import { mapPlanContentToSpec } from './care-plan-content';
import type { CarePlanService } from './care-plan.types';

export function createCarePlanDraftRevisionService(
  db: DatabaseClient,
): Pick<CarePlanService, 'create' | 'editDraft' | 'revise'> {
  return {
    create: (auth: AuthState, input: z.infer<typeof CarePlanCreateSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.manage');
        const patient = await tx.patient.findFirst({
          where: { tenantId, id: input.patientId, status: 'ACTIVE' },
          select: { id: true, areaId: true },
        });
        if (!patient) throw missing();
        await serviceSnapshot(tx, tenantId, input.agencyServiceId);
        if (input.serviceRequestId) {
          const request = await findLinkedRequest(tx, tenantId, input.serviceRequestId);
          // Cross-tenant or nonexistent references stay privacy-safe 404s; a
          // visible but non-matching request is a semantic mismatch (ADR-0012).
          if (!request) throw missing();
          if (
            request.status !== 'APPROVED' ||
            request.patientId !== input.patientId ||
            request.agencyServiceId !== input.agencyServiceId
          )
            throw new ApiError(
              409,
              'STATE_TRANSITION_INVALID',
              'The linked request must be approved and match this patient and service.',
            );
        }
        if (input.primaryCaregiverId) {
          const caregiver = await tx.caregiver.findFirst({
            where: { tenantId, id: input.primaryCaregiverId },
            select: { id: true },
          });
          if (!caregiver) throw missing();
        }
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        // Fail closed on span/DST errors before any write.
        expandOccurrences(mapPlanContentToSpec(input, tenant.timezone), 'preview');
        const plan = await tx.carePlan.create({
          data: {
            tenantId,
            patientId: input.patientId,
            serviceRequestId: input.serviceRequestId,
            agencyServiceId: input.agencyServiceId,
            primaryCaregiverId: input.primaryCaregiverId,
            status: 'DRAFT',
            currentVersion: 1,
          },
          select: { id: true },
        });
        const version = await tx.carePlanVersion.create({
          data: {
            tenantId,
            carePlanId: plan.id,
            version: 1,
            status: 'DRAFT',
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            weekdaysJson: input.weekdays,
            localStartTime: input.localStartTime,
            durationMin: input.durationMin,
            goalText: input.goalText,
            taskTemplatesJson: input.taskTemplates,
            clinicalInstructionsRestricted: input.clinicalInstructionsRestricted,
            timezoneSnapshot: tenant.timezone,
            dstResolution: input.dstResolution,
          },
          select: versionProjection,
        });
        await recordChange(tx, auth, tenantId, plan.id, CarePlanEvents.CREATED, 'care_plan');
        await recordChange(
          tx,
          auth,
          tenantId,
          version.id,
          CarePlanEvents.VERSION_CREATED,
          'care_plan_version',
          { planId: plan.id, version: 1 },
        );
        return { id: plan.id, status: 'DRAFT', currentVersion: 1, versions: [version] };
      }),

    editDraft: (auth: AuthState, id: string, input: z.infer<typeof CarePlanDraftEditSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.manage');
        const plan = await lockPlan(tx, tenantId, id);
        if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Plan is closed.');
        const draft = await openDraft(tx, tenantId, id);
        if (draft.version !== input.expectedDraftVersion) throw stale();
        if (input.primaryCaregiverId) {
          const caregiver = await tx.caregiver.findFirst({
            where: { tenantId, id: input.primaryCaregiverId },
            select: { id: true },
          });
          if (!caregiver) throw missing();
        }
        const timezone = draft.timezoneSnapshot;
        expandOccurrences(mapPlanContentToSpec(input, timezone), 'preview');
        const updated = await tx.carePlanVersion.update({
          where: { id: draft.id },
          data: {
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            weekdaysJson: input.weekdays,
            localStartTime: input.localStartTime,
            durationMin: input.durationMin,
            goalText: input.goalText,
            taskTemplatesJson: input.taskTemplates,
            clinicalInstructionsRestricted: input.clinicalInstructionsRestricted,
            dstResolution: input.dstResolution,
          },
          select: versionProjection,
        });
        await tx.carePlan.update({
          where: { tenantId_id: { tenantId, id } },
          data: { primaryCaregiverId: input.primaryCaregiverId },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          draft.id,
          CarePlanEvents.DRAFT_EDITED,
          'care_plan_version',
          { planId: id, version: draft.version },
        );
        return updated;
      }),

    revise: (auth: AuthState, id: string, input: z.infer<typeof CarePlanReviseSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.manage');
        const plan = await lockPlan(tx, tenantId, id);
        if (plan.status === 'DRAFT')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Edit the open draft instead of revising.',
          );
        if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Plan is closed.');
        await openDraftGuard(tx, tenantId, id);
        if (input.primaryCaregiverId) {
          const caregiver = await tx.caregiver.findFirst({
            where: { tenantId, id: input.primaryCaregiverId },
            select: { id: true },
          });
          if (!caregiver) throw missing();
        }
        const latest = plan.currentVersion;
        const timezone = (
          await tx.carePlanVersion.findFirstOrThrow({
            where: { tenantId, carePlanId: id, version: latest },
            select: { timezoneSnapshot: true },
          })
        ).timezoneSnapshot;
        expandOccurrences(mapPlanContentToSpec(input, timezone), 'preview');
        const version = await tx.carePlanVersion.create({
          data: {
            tenantId,
            carePlanId: id,
            version: latest + 1,
            status: 'DRAFT',
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            weekdaysJson: input.weekdays,
            localStartTime: input.localStartTime,
            durationMin: input.durationMin,
            goalText: input.goalText,
            taskTemplatesJson: input.taskTemplates,
            clinicalInstructionsRestricted: input.clinicalInstructionsRestricted,
            timezoneSnapshot: timezone,
            dstResolution: input.dstResolution,
          },
          select: versionProjection,
        });
        await tx.carePlan.update({
          where: { tenantId_id: { tenantId, id } },
          data: { currentVersion: latest + 1, primaryCaregiverId: input.primaryCaregiverId },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          version.id,
          CarePlanEvents.VERSION_CREATED,
          'care_plan_version',
          { planId: id, version: latest + 1 },
        );
        return version;
      }),
  };
}

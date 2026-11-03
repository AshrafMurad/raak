/**
 * Care-plan clinical approval command (docs 05 A06, docs 04 BR-PLAN): approves
 * the plan's exact current draft version only after a live authorization gate
 * and an agency-verified qualification for this exact service, valid today —
 * titles never confer clinical authority (ADR-0012). Expiry, immutable-version
 * and audit/outbox ownership stay inside the one transaction; lock order is
 * unchanged from the characterized behavior.
 */
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import { ApproveClinicalSchema } from '../../contracts/careplans';
import { CarePlanEvents } from '../../contracts/events';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing, stale } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { lockPlan, serviceSnapshot, versionProjection } from './care-plan.repository';
import type { CarePlanService } from './care-plan.types';

export function createCarePlanClinicalApprovalService(
  db: DatabaseClient,
  now: () => Date,
): Pick<CarePlanService, 'approveClinical'> {
  return {
    approveClinical: (auth: AuthState, id: string, input: z.infer<typeof ApproveClinicalSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.clinical_approve');
        const plan = await lockPlan(tx, tenantId, id);
        const version = await tx.carePlanVersion.findFirst({
          where: { tenantId, carePlanId: id, version: input.version },
        });
        if (!version) throw missing();
        const { config } = await serviceSnapshot(tx, tenantId, plan.agencyServiceId);
        if (config.clinicalClass !== 'CLINICAL')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'This service does not require clinical approval.',
          );
        // A06 capability: agency-verified qualification for this exact service,
        // valid today — titles never confer clinical authority (ADR-0012).
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: version.timezoneSnapshot,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now());
        const reviewerQualification = await tx.caregiverQualification.findFirst({
          where: {
            tenantId,
            caregiver: { staffAccountId: auth.session.principalId },
            status: 'VERIFIED',
            verifiedBy: { not: auth.session.principalId },
            verifiedAt: { not: null },
            code: { in: config.requiredQualificationCodes },
            OR: [{ validThrough: null }, { validThrough: { gte: today } }],
          },
          select: { id: true },
        });
        if (!reviewerQualification)
          throw new ApiError(
            403,
            'FORBIDDEN',
            'Clinical approval requires a current agency-verified qualification for this service.',
          );
        if (input.version !== plan.currentVersion) throw stale();
        if (version.status !== 'DRAFT')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Only the open draft version can be approved.',
          );
        const updated = await tx.carePlanVersion.update({
          where: { id: version.id },
          data: {
            status: 'APPROVED',
            approvedByStaffId: auth.session.principalId,
            approvedAt: now(),
          },
          select: versionProjection,
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          version.id,
          CarePlanEvents.CLINICAL_APPROVED,
          'care_plan_version',
          { planId: id, version: input.version },
        );
        return updated;
      }),
  };
}

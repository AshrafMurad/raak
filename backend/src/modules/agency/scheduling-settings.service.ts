/**
 * Agency scheduling-policy settings (docs 04 BR-SCH/BR-CH, docs 07): the
 * Sprint 6 slice of GET/PATCH `/agency/settings` owns only the scheduling
 * policy (travel buffer, change cutoffs, late review) with optimistic
 * `settingsVersion`. Buffer changes audit the setting and run the
 * prospective reassignment impact scan in the same transaction (BR-SCH);
 * existing appointments are flagged, never silently rewritten.
 */
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { VisitEvents } from '../../contracts/events';
import { SchedulingSettingsSchema } from '../../contracts/visits';
import type { AuthState } from '../auth/guards';
import { agencyAction, stale } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { scanCaregiverAssignments } from '../scheduling';

export function createSchedulingSettingsService(db: DatabaseClient, now: () => Date) {
  return {
    read: (auth: AuthState) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'agency.settings.read');
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        return {
          timezone: tenant.timezone,
          travelBufferMin: tenant.travelBufferMin,
          changeCancelCutoffHours: tenant.changeCancelCutoffHours,
          changeRescheduleCutoffHours: tenant.changeRescheduleCutoffHours,
          allowLateReview: tenant.allowLateReview,
          settingsVersion: tenant.settingsVersion,
        };
      }),

    update: (auth: AuthState, input: z.infer<typeof SchedulingSettingsSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'agency.settings.manage');
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { travelBufferMin: true, settingsVersion: true },
        });
        if (tenant.settingsVersion !== input.expectedVersion) throw stale();
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            travelBufferMin: input.travelBufferMin,
            changeCancelCutoffHours: input.changeCancelCutoffHours,
            changeRescheduleCutoffHours: input.changeRescheduleCutoffHours,
            allowLateReview: input.allowLateReview,
            settingsVersion: { increment: 1 },
          },
        });
        await recordChange(tx, auth, tenantId, tenantId, VisitEvents.SETTINGS_UPDATED, 'tenant', {
          travelBufferMin: input.travelBufferMin,
          changeCancelCutoffHours: input.changeCancelCutoffHours,
          changeRescheduleCutoffHours: input.changeRescheduleCutoffHours,
          allowLateReview: input.allowLateReview,
        });
        let flagged = 0;
        let healed = 0;
        if (input.travelBufferMin !== tenant.travelBufferMin) {
          // Prospective scan under the new buffer (BR-SCH): flag conflicting
          // upcoming assignments without cancelling or rewriting them.
          const caregivers = await tx.caregiver.findMany({
            where: {
              tenantId,
              assignedVisits: {
                some: { status: 'SCHEDULED', scheduledStartUtc: { gt: now() } },
              },
            },
            select: { id: true },
            orderBy: { id: 'asc' },
          });
          for (const caregiver of caregivers) {
            await tx.$queryRaw`SELECT id FROM caregivers WHERE tenant_id = ${tenantId}::uuid AND id = ${caregiver.id}::uuid FOR UPDATE`;
            const scan = await scanCaregiverAssignments(tx, {
              tenantId,
              caregiverId: caregiver.id,
              actorId: auth.session.principalId,
              now: now(),
              trigger: 'travel_buffer_update',
            });
            flagged += scan.flagged;
            healed += scan.healed;
          }
        }
        return {
          travelBufferMin: input.travelBufferMin,
          changeCancelCutoffHours: input.changeCancelCutoffHours,
          changeRescheduleCutoffHours: input.changeRescheduleCutoffHours,
          allowLateReview: input.allowLateReview,
          settingsVersion: tenant.settingsVersion + 1,
          impact: { flagged, healed },
        };
      }),
  };
}

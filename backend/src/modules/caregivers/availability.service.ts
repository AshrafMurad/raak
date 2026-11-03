import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { AvailabilitySchema, ExceptionSchema, CaregiverEvents } from '../../contracts/caregivers';
import type { AuthState } from '../auth/guards';
import { agencyAction, stale } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { caregiverRow } from './caregiver.service';
import { scanCaregiverAssignments } from '../scheduling';

export function createAvailabilityService(db: DatabaseClient, now: () => Date) {
  return {
    replace: (auth: AuthState, id: string, input: z.infer<typeof AvailabilitySchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.manage');
        const row = await caregiverRow(tx, tenantId, id);
        if (row.availabilityRevision !== input.expectedRevision) throw stale();
        await tx.availabilitySlot.deleteMany({ where: { tenantId, caregiverId: id } });
        await tx.availabilitySlot.createMany({
          data: input.slots.map((slot) => ({ tenantId, caregiverId: id, ...slot })),
        });
        await tx.caregiver.update({
          where: { tenantId_id: { tenantId, id } },
          data: { availabilityRevision: { increment: 1 } },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          id,
          CaregiverEvents.AVAILABILITY_CHANGED,
          'caregiver',
        );
        // Weekly-hours changes can invalidate confirmed assignments (F10):
        // scan inside the caregiver lock and flag, never silently reassign.
        const impact = await scanCaregiverAssignments(tx, {
          tenantId,
          caregiverId: id,
          actorId: auth.session.principalId,
          now: now(),
          trigger: 'availability_replaced',
        });
        return {
          id,
          availabilityRevision: row.availabilityRevision + 1,
          impactScan: impact,
        };
      }),
    exception: (auth: AuthState, id: string, input: z.infer<typeof ExceptionSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'caregivers.manage');
        const row = await caregiverRow(tx, tenantId, id);
        if (row.availabilityRevision !== input.expectedRevision) throw stale();
        const data = {
          type: input.type,
          startLocal: input.startLocal,
          endLocal: input.endLocal,
          reason: input.reason,
          approvedBy: auth.session.principalId,
        };
        const exception = await tx.availabilityException.upsert({
          where: {
            tenantId_caregiverId_localDate: {
              tenantId,
              caregiverId: id,
              localDate: input.localDate,
            },
          },
          create: { tenantId, caregiverId: id, localDate: input.localDate, ...data },
          update: data,
        });
        await tx.caregiver.update({
          where: { tenantId_id: { tenantId, id } },
          data: { availabilityRevision: { increment: 1 } },
        });
        await recordChange(tx, auth, tenantId, id, CaregiverEvents.EXCEPTION_CHANGED, 'caregiver');
        const impact = await scanCaregiverAssignments(tx, {
          tenantId,
          caregiverId: id,
          actorId: auth.session.principalId,
          now: now(),
          trigger: 'exception_changed',
        });
        return {
          id: exception.id,
          availabilityRevision: row.availabilityRevision + 1,
          impactScan: impact,
        };
      }),
  };
}

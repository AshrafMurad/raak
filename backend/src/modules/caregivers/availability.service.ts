import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { AvailabilitySchema, ExceptionSchema, CaregiverEvents } from '../../contracts/caregivers';
import type { AuthState } from '../auth/guards';
import { agencyAction, stale } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { caregiverRow } from './caregiver.service';

export function createAvailabilityService(db: DatabaseClient) {
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
        return { id, availabilityRevision: row.availabilityRevision + 1 };
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
        return {
          id: exception.id,
          availabilityRevision: row.availabilityRevision + 1,
          impactScanDeferredToScheduling: true,
        };
      }),
  };
}

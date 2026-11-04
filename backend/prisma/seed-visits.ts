import type { DatabaseClient } from '../src/db/client';

/** Sprint 6 synthetic visit-execution fixtures: one confirmed SCHEDULED
 * standalone visit (seeded caregiver, task snapshots) so the caregiver
 * portal and customer change flow have stable demo data. Create-only;
 * reruns never overwrite visits an operator has executed or edited. */
export async function seedVisits(db: DatabaseClient, input: { tenantA: string }) {
  const caregiver = await db.caregiver.findFirstOrThrow({
    where: { tenantId: input.tenantA, staffAccountId: { not: null } },
  });
  const service = await db.agencyService.findFirstOrThrow({
    where: { tenantId: input.tenantA, slug: 'synthetic-people-support' },
  });
  const existing = await db.visit.findFirst({
    where: { tenantId: input.tenantA, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01' },
    select: { id: true },
  });
  if (existing) return;
  await db.$transaction(async (tx) => {
    await tx.visit.create({
      data: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
        tenantId: input.tenantA,
        patientId: '44444444-4444-4444-8444-444444444441',
        agencyServiceId: service.id,
        areaId: 'central',
        assignedCaregiverId: caregiver.id,
        serviceNameSnapshot: {
          nameAr: 'خدمة أهلية اصطناعية',
          nameEn: 'Synthetic eligibility fixture',
        },
        // Tuesday 2026-12-08 09:00 Asia/Riyadh (UTC+3) — synthetic demo slot.
        scheduledStartUtc: new Date('2026-12-08T06:00:00Z'),
        scheduledEndUtc: new Date('2026-12-08T07:00:00Z'),
        timezoneSnapshot: 'Asia/Riyadh',
        status: 'SCHEDULED',
      },
    });
    await tx.visitTask.createMany({
      data: [
        {
          tenantId: input.tenantA,
          visitId: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
          order: 1,
          descriptionSnapshot: 'Synthetic companionship task (fixture only)',
          isRequired: true,
        },
        {
          tenantId: input.tenantA,
          visitId: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
          order: 2,
          descriptionSnapshot: 'Synthetic light housekeeping task (fixture only)',
          isRequired: false,
        },
      ],
    });
  });
}

import type { DatabaseClient } from '../src/db/client';

/** Sprint 5 synthetic scheduling fixtures: a recurring service, an activated
 * care plan and three PLANNED unassigned visits. Create-only; reruns never
 * overwrite visits an operator has assigned or edited locally. */
export async function seedScheduling(
  db: DatabaseClient,
  input: { tenantA: string; reviewerId: string },
) {
  const caregiver = await db.caregiver.findFirstOrThrow({
    where: { tenantId: input.tenantA, staffAccountId: { not: null } },
  });
  const service = await db.agencyService.upsert({
    where: {
      tenantId_slug: { tenantId: input.tenantA, slug: 'synthetic-recurring-support' },
    },
    update: {},
    create: {
      id: '99999999-9999-4999-8999-999999999992',
      tenantId: input.tenantA,
      slug: 'synthetic-recurring-support',
      config: {
        nameAr: 'زيارات دورية اصطناعية',
        nameEn: 'Synthetic recurring support',
        summaryAr: 'قالب دوري تجريبي',
        summaryEn: 'Synthetic recurring template',
        descriptionAr: 'بيانات اصطناعية لخطة رعاية وزيارات مخططة فقط.',
        descriptionEn: 'Synthetic care-plan and planned-visit fixture only.',
        durationMin: 60,
        clinicalClass: 'NON_CLINICAL',
        requiredQualificationCodes: ['SYNTHETIC_SUPPORT'],
        serviceAreaIds: ['central'],
        allowStandalone: false,
        allowRecurring: true,
        pricingType: 'CUSTOM_QUOTE',
        priceMinor: null,
        pricingUnit: null,
      },
    },
  });
  await db.caregiverServiceAuthorization.upsert({
    where: {
      tenantId_caregiverId_agencyServiceId: {
        tenantId: input.tenantA,
        caregiverId: caregiver.id,
        agencyServiceId: service.id,
      },
    },
    update: {},
    create: {
      tenantId: input.tenantA,
      caregiverId: caregiver.id,
      agencyServiceId: service.id,
      authorizedBy: input.reviewerId,
      authorizedAt: new Date('2026-11-02T00:00:00Z'),
    },
  });
  for (let weekday = 0; weekday < 7; weekday++)
    await db.availabilitySlot.upsert({
      where: {
        id: `88888888-8888-4888-8888-8888888888${String(weekday + 2).padStart(2, '0')}`,
      },
      update: {},
      create: {
        id: `88888888-8888-4888-8888-8888888888${String(weekday + 2).padStart(2, '0')}`,
        tenantId: input.tenantA,
        caregiverId: caregiver.id,
        weekday,
        localStartTime: '08:00',
        localEndTime: '18:00',
      },
    });
  const plan = await db.carePlan.upsert({
    where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' },
    update: {},
    create: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      tenantId: input.tenantA,
      patientId: '44444444-4444-4444-8444-444444444441',
      agencyServiceId: service.id,
      status: 'ACTIVE',
      currentVersion: 1,
      primaryCaregiverId: caregiver.id,
      startedAt: new Date('2026-11-02T00:00:00Z'),
    },
  });
  const version = await db.carePlanVersion.upsert({
    where: {
      tenantId_carePlanId_version: {
        tenantId: input.tenantA,
        carePlanId: plan.id,
        version: 1,
      },
    },
    update: {},
    create: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      tenantId: input.tenantA,
      carePlanId: plan.id,
      version: 1,
      status: 'ACTIVATED',
      validFrom: '2026-12-01',
      validUntil: '2026-12-31',
      weekdaysJson: [1],
      localStartTime: '09:00',
      durationMin: 60,
      goalText: 'Synthetic recurring home support (fixture only).',
      taskTemplatesJson: [
        { description: 'Synthetic companionship task', isRequired: true },
        { description: 'Synthetic light housekeeping task', isRequired: false },
      ],
      timezoneSnapshot: 'Asia/Riyadh',
      dstResolution: 'REJECT',
      activatedAt: new Date('2026-11-02T00:00:00Z'),
    },
  });
  // Mondays 09:00 Asia/Riyadh = 06:00 UTC. 2026-12-14 overlaps the seeded
  // synthetic leave exception on purpose: it demonstrates candidate exclusion.
  const occurrences = [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      key: 'seed-2026-12-07',
      utc: '2026-12-07T06:00:00Z',
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
      key: 'seed-2026-12-14',
      utc: '2026-12-14T06:00:00Z',
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
      key: 'seed-2026-12-21',
      utc: '2026-12-21T06:00:00Z',
    },
  ];
  for (const occurrence of occurrences) {
    const existing = await db.visit.findFirst({
      where: { tenantId: input.tenantA, occurrenceKey: occurrence.key },
      select: { id: true },
    });
    if (existing) continue;
    await db.visit.create({
      data: {
        id: occurrence.id,
        tenantId: input.tenantA,
        patientId: plan.patientId,
        agencyServiceId: service.id,
        carePlanId: plan.id,
        planVersionId: version.id,
        occurrenceKey: occurrence.key,
        areaId: 'central',
        serviceNameSnapshot: {
          nameAr: 'زيارات دورية اصطناعية',
          nameEn: 'Synthetic recurring support',
        },
        scheduledStartUtc: new Date(occurrence.utc),
        scheduledEndUtc: new Date(
          new Date(occurrence.utc).getTime() + version.durationMin * 60_000,
        ),
        timezoneSnapshot: 'Asia/Riyadh',
        status: 'PLANNED',
      },
    });
  }
}

import type { DatabaseClient } from '../src/db/client';

/** Stable, create-only synthetic fixtures. Reruns never restore revoked access
 * or overwrite profiles an owner has edited during local exploration. */
export async function seedPeople(
  db: DatabaseClient,
  input: { tenantA: string; tenantB: string; reviewerId: string; passwordHash: string },
) {
  const customer = await db.customerAccount.findFirstOrThrow({
    where: { tenantId: input.tenantA, emailNormalized: 'customer.afiya@example.invalid' },
  });
  const patients = [
    {
      id: '44444444-4444-4444-8444-444444444441',
      tenantId: input.tenantA,
      displayName: 'سلمى التجريبية — Synthetic Salma',
    },
    {
      id: '44444444-4444-4444-8444-444444444442',
      tenantId: input.tenantA,
      displayName: 'أحمد التجريبي — Synthetic Ahmad',
    },
    {
      id: '44444444-4444-4444-8444-444444444443',
      tenantId: input.tenantA,
      displayName: 'مريض غير مفوّض — Synthetic unrelated',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: input.tenantB,
      displayName: 'سلمى التجريبية — Synthetic Salma',
    },
  ];
  await db.$transaction(async (tx) => {
    await tx.customerAccount.upsert({
      where: {
        tenantId_emailNormalized: {
          tenantId: input.tenantB,
          emailNormalized: 'customer.afiya@example.invalid',
        },
      },
      update: {},
      create: {
        tenantId: input.tenantB,
        emailNormalized: 'customer.afiya@example.invalid',
        passwordHash: input.passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date('2026-11-02T00:00:00Z'),
      },
    });
    for (const patient of patients)
      await tx.patient.upsert({
        where: { id: patient.id },
        update: {},
        create: {
          ...patient,
          normalizedName: patient.displayName.toLowerCase(),
          areaId: 'central',
          notesRestricted: 'Synthetic fixture only.',
        },
      });
    for (const [index, patient] of patients.slice(0, 3).entries())
      await tx.patientAccess.upsert({
        where: { id: `55555555-5555-4555-8555-55555555555${index + 1}` },
        update: {},
        create: {
          id: `55555555-5555-4555-8555-55555555555${index + 1}`,
          tenantId: input.tenantA,
          patientId: patient.id,
          customerAccountId: customer.id,
          scopes: ['VIEW_BASIC', 'VIEW_DOCUMENTS'],
          authorizationType: 'AGENCY_VERIFIED_AUTHORITY',
          verifiedByStaffId: input.reviewerId,
          verifiedAt: new Date('2026-11-02T00:00:00Z'),
          ...(index === 2
            ? { status: 'REVOKED', revokedAt: new Date('2026-11-02T01:00:00Z') }
            : {}),
        },
      });
    const staff = await tx.staffAccount.upsert({
      where: {
        tenantId_emailNormalized: {
          tenantId: input.tenantA,
          emailNormalized: 'caregiver.afiya@example.invalid',
        },
      },
      update: {},
      create: {
        tenantId: input.tenantA,
        emailNormalized: 'caregiver.afiya@example.invalid',
        passwordHash: input.passwordHash,
        status: 'ACTIVE',
        role: 'CAREGIVER',
        emailVerifiedAt: new Date('2026-11-02T00:00:00Z'),
      },
    });
    const caregiver = await tx.caregiver.upsert({
      where: { staffAccountId: staff.id },
      update: {},
      create: {
        id: '66666666-6666-4666-8666-666666666661',
        tenantId: input.tenantA,
        staffAccountId: staff.id,
        name: 'مقدم رعاية تجريبي — Synthetic caregiver',
        professionalCategory: 'SYNTHETIC_SUPPORT',
        operationalStatus: 'ACTIVE',
        serviceAreasJson: ['central'],
      },
    });
    await tx.caregiverQualification.upsert({
      where: { id: '77777777-7777-4777-8777-777777777771' },
      update: {},
      create: {
        id: '77777777-7777-4777-8777-777777777771',
        tenantId: input.tenantA,
        caregiverId: caregiver.id,
        code: 'SYNTHETIC_SUPPORT',
        licenseIssuer: 'Synthetic issuer — not a real license',
        licenseNumberRestricted: 'SYNTHETIC-ONLY',
        status: 'VERIFIED',
        verifiedBy: input.reviewerId,
        verifiedAt: new Date('2026-11-02T00:00:00Z'),
        validThrough: '2027-12-31',
      },
    });
    await tx.availabilitySlot.upsert({
      where: { id: '88888888-8888-4888-8888-888888888881' },
      update: {},
      create: {
        id: '88888888-8888-4888-8888-888888888881',
        tenantId: input.tenantA,
        caregiverId: caregiver.id,
        weekday: 1,
        localStartTime: '08:00',
        localEndTime: '16:00',
      },
    });
    const service = await tx.agencyService.upsert({
      where: { tenantId_slug: { tenantId: input.tenantA, slug: 'synthetic-people-support' } },
      update: {},
      create: {
        id: '99999999-9999-4999-8999-999999999991',
        tenantId: input.tenantA,
        slug: 'synthetic-people-support',
        config: {
          nameAr: 'خدمة أهلية اصطناعية',
          nameEn: 'Synthetic eligibility fixture',
          summaryAr: 'للتجربة فقط',
          summaryEn: 'Synthetic only',
          descriptionAr: 'بيانات اصطناعية لفحص أسس الأهلية دون حجز موعد',
          descriptionEn: 'Synthetic foundation checks; no appointment is created.',
          durationMin: 60,
          clinicalClass: 'NON_CLINICAL',
          requiredQualificationCodes: ['SYNTHETIC_SUPPORT'],
          serviceAreaIds: ['central'],
          allowStandalone: true,
          allowRecurring: false,
          pricingType: 'CUSTOM_QUOTE',
          priceMinor: null,
          pricingUnit: null,
        },
      },
    });
    await tx.caregiverServiceAuthorization.upsert({
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
    await tx.availabilityException.upsert({
      where: {
        tenantId_caregiverId_localDate: {
          tenantId: input.tenantA,
          caregiverId: caregiver.id,
          localDate: '2026-12-14',
        },
      },
      update: {},
      create: {
        tenantId: input.tenantA,
        caregiverId: caregiver.id,
        localDate: '2026-12-14',
        type: 'UNAVAILABLE',
        reason: 'Synthetic leave fixture',
        approvedBy: input.reviewerId,
      },
    });
  });
}

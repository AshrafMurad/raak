import { expect, it } from 'vitest';
import { ServiceConfigSchema, GuestSubmissionSchema } from '../../src/contracts/catalog';

export const syntheticService = {
  nameAr: 'خدمة تجريبية',
  nameEn: 'Synthetic service',
  summaryAr: 'وصف مختصر',
  summaryEn: 'Short description',
  descriptionAr: 'خدمة للتجربة فقط',
  descriptionEn: 'Synthetic demonstration only',
  durationMin: 60,
  clinicalClass: 'NON_CLINICAL',
  requiredQualificationCodes: [],
  serviceAreaIds: ['central'],
  allowStandalone: true,
  allowRecurring: false,
  pricingType: 'FIXED',
  priceMinor: 15000,
  pricingUnit: 'VISIT',
};
it('requires fixed price and unit and refuses mass assignment', () => {
  expect(ServiceConfigSchema.safeParse(syntheticService).success).toBe(true);
  expect(ServiceConfigSchema.safeParse({ ...syntheticService, priceMinor: null }).success).toBe(
    false,
  );
  expect(ServiceConfigSchema.safeParse({ ...syntheticService, tenantId: 'other' }).success).toBe(
    false,
  );
  expect(
    ServiceConfigSchema.safeParse({ ...syntheticService, clinicalClass: 'CLINICAL' }).success,
  ).toBe(false);
});
it('requires privacy consent and keeps anonymous intake minimal', () => {
  const data = {
    serviceId: '11111111-1111-4111-8111-111111111111',
    serviceVersion: 1,
    locale: 'ar',
    requesterName: 'اسم تجريبي',
    requesterEmail: 'synthetic@example.invalid',
    beneficiaryName: 'اسم آخر',
    relationship: 'SELF',
    areaId: 'central',
    preferredDate: '2026-12-01',
    preferredPeriod: 'MORNING',
    notes: '',
    privacyAccepted: true,
    privacyVersion: '2026-11-01',
    priceAcknowledged: true,
    website: '',
  };
  expect(GuestSubmissionSchema.safeParse(data).success).toBe(true);
  expect(GuestSubmissionSchema.safeParse({ ...data, privacyAccepted: false }).success).toBe(false);
  expect(GuestSubmissionSchema.safeParse({ ...data, diagnosis: 'forbidden' }).success).toBe(false);
});

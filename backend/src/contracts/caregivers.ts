import { z } from 'zod';
export const CaregiverEvents = {
  CREATED: 'caregiver.created',
  UPDATED: 'caregiver.updated',
  QUALIFICATION_SUBMITTED: 'caregiver.qualification_submitted',
  QUALIFICATION_REVIEWED: 'caregiver.qualification_reviewed',
  SERVICES_AUTHORIZED: 'caregiver.services_authorized',
  AVAILABILITY_CHANGED: 'caregiver.availability_changed',
  EXCEPTION_CHANGED: 'caregiver.exception_changed',
} as const;
export const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Invalid calendar date');
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const version = z.number().int().positive();
export const CaregiverOperationalSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  professionalCategory: z.string().trim().min(2).max(64),
  operationalStatus: z.enum(['ACTIVE', 'INACTIVE']),
  serviceAreas: z.array(z.string().min(1).max(64)).max(50),
});
export const EditCaregiverSchema = CaregiverOperationalSchema.extend({ expectedVersion: version });
export const QualificationSchema = z.strictObject({
  code: z.string().regex(/^[A-Z0-9_-]{2,64}$/),
  licenseIssuer: z.string().trim().min(2).max(120),
  licenseNumberRestricted: z.string().trim().min(1).max(100),
  validThrough: LocalDateSchema.nullable(),
  documentId: z.uuid().optional(),
});
export const VerifyQualificationSchema = z
  .strictObject({
    expectedVersion: version,
    decision: z.enum(['VERIFIED', 'REJECTED']),
    reason: z.string().trim().min(5).max(300).optional(),
  })
  .refine(
    (v) => v.decision !== 'REJECTED' || !!v.reason,
    'A rejection or verification-withdrawal reason is required',
  );
export const ServiceAuthorizationSchema = z.strictObject({
  expectedVersion: version,
  serviceIds: z
    .array(z.uuid())
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const AvailabilitySlotSchema = z
  .strictObject({
    weekday: z.number().int().min(0).max(6),
    localStartTime: clock,
    localEndTime: clock,
    effectiveFrom: LocalDateSchema.nullable().default(null),
    effectiveTo: LocalDateSchema.nullable().default(null),
  })
  .refine(
    (s) =>
      s.localStartTime < s.localEndTime &&
      (!s.effectiveFrom || !s.effectiveTo || s.effectiveFrom <= s.effectiveTo),
    'Invalid interval',
  );
export const AvailabilitySchema = z
  .strictObject({
    expectedRevision: version,
    slots: z.array(AvailabilitySlotSchema).max(100),
  })
  .superRefine(({ slots }, ctx) => {
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i]!,
          b = slots[j]!;
        if (
          a.weekday === b.weekday &&
          a.localStartTime < b.localEndTime &&
          b.localStartTime < a.localEndTime &&
          (a.effectiveFrom ?? '0000-01-01') <= (b.effectiveTo ?? '9999-12-31') &&
          (b.effectiveFrom ?? '0000-01-01') <= (a.effectiveTo ?? '9999-12-31')
        )
          ctx.addIssue({
            code: 'custom',
            path: ['slots', j],
            message: 'Overlapping availability periods',
          });
      }
  });
export const ExceptionSchema = z
  .strictObject({
    expectedRevision: version,
    localDate: LocalDateSchema,
    type: z.enum(['UNAVAILABLE', 'OVERRIDE_HOURS']),
    startLocal: clock.nullable().default(null),
    endLocal: clock.nullable().default(null),
    reason: z.string().trim().min(5).max(300),
  })
  .refine(
    (v) =>
      v.type === 'UNAVAILABLE'
        ? v.startLocal === null && v.endLocal === null
        : v.startLocal !== null && v.endLocal !== null && v.startLocal < v.endLocal,
    'Invalid dated exception',
  );
export const EligibilitySchema = z
  .strictObject({
    serviceId: z.uuid(),
    localDate: LocalDateSchema,
    startLocal: clock,
    endLocal: clock,
  })
  .refine((v) => v.startLocal < v.endLocal, 'Invalid interval');

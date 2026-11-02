import { z } from 'zod';

const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const RegisterCustomerSchema = z.strictObject({
  email,
  password: z.string().min(10).max(128),
  locale: z.enum(['ar', 'en']).default('ar'),
});
export const CustomerTokenSchema = z.strictObject({ token: z.string().min(20).max(200) });
export const ResendCustomerSchema = RegisterCustomerSchema.omit({ password: true });
export const ClaimLinkSchema = z.strictObject({
  reference: z.string().min(5).max(100),
  locale: z.enum(['ar', 'en']).default('ar'),
});
export const PatientScopes = [
  'VIEW_BASIC',
  'SUBMIT_REQUEST',
  'VIEW_VISITS',
  'MANAGE_VISITS',
  'VIEW_CARE_PLAN_SUMMARY',
  'VIEW_DOCUMENTS',
] as const;
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Invalid calendar date');
export const PatientProfileSchema = z.strictObject({
  displayName: z.string().trim().min(2).max(120),
  dateOfBirth: localDate.nullable().default(null),
  contact: z.string().trim().max(254).default(''),
  areaId: z.string().trim().min(1).max(64),
  addressRestricted: z.string().trim().max(500).default(''),
  notesRestricted: z.string().trim().max(500).default(''),
});
const reviews = z
  .array(
    z.strictObject({
      candidateId: z.uuid(),
      reason: z.string().trim().min(5).max(300),
    }),
  )
  .max(100)
  .default([]);
export const CreatePatientSchema = z.strictObject({
  profile: PatientProfileSchema,
  duplicateReviews: reviews,
});
export const EditPatientSchema = z.strictObject({
  profile: PatientProfileSchema,
  expectedVersion: z.number().int().positive(),
});
export const CreateRequestPatientSchema = CreatePatientSchema.extend({
  expectedVersion: z.number().int().positive(),
});
export const LinkPatientSchema = z.strictObject({
  patientId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(5).max(300),
});
export const GrantSchema = z.strictObject({
  customerAccountId: z.uuid(),
  scopes: z
    .array(z.enum(PatientScopes))
    .min(1)
    .max(6)
    .refine((v) => new Set(v).size === v.length),
  authorizationType: z.enum([
    'PATIENT_CONSENT',
    'LEGAL_REPRESENTATIVE',
    'AGENCY_VERIFIED_AUTHORITY',
  ]),
  evidenceDocumentId: z.uuid().optional(),
  expiresAt: z.iso.datetime().optional(),
});
export const RevokeGrantSchema = z.strictObject({ reason: z.string().trim().min(5).max(300) });
export const PeopleEvents = {
  VERIFICATION_EMAIL: 'email.customer_verification',
  CLAIM_EMAIL: 'email.customer_claim',
  VERIFIED: 'customer.verified',
  CLAIMED: 'request.claimed',
  PATIENT_CREATED: 'patient.created',
  PATIENT_UPDATED: 'patient.updated',
  PATIENT_LINKED: 'patient.linked',
  GRANT_ISSUED: 'patient_access.issued',
  GRANT_REVOKED: 'patient_access.revoked',
} as const;

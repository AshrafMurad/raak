/**
 * Sprint 1 identity/control-plane DTOs (docs 05, 07). Strict objects: unknown
 * fields are rejected so callers can never mass-assign tenantId, role, status
 * or verification flags (docs 05 rule 4). Email normalization happens in the
 * service layer via `normalizeEmail`.
 */
import { z } from 'zod';

/** Lowercase kebab-case slugs; reserved words are rejected at the DTO layer. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = [
  'www',
  'api',
  'app',
  'admin',
  'platform',
  'staging',
  'portal',
  'raak',
] as const;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
const email = z.email();
const opaqueToken = z.string().min(20).max(200);

/** Roles an invitation may carry; AGENCY_OWNER exists only via registration. */
export const INVITABLE_STAFF_ROLES = ['AGENCY_ADMIN', 'CARE_COORDINATOR', 'CAREGIVER'] as const;

export const RegisterAgencySchema = z
  .strictObject({
    slug: z
      .string()
      .min(2)
      .max(63)
      .regex(SLUG_PATTERN)
      .refine((value) => !RESERVED_SLUGS.includes(value as (typeof RESERVED_SLUGS)[number]), {
        message: 'Slug is reserved',
      }),
    legalName: z.string().min(2).max(200),
    displayName: z.string().min(1).max(120),
    timezone: z.string().min(3).max(64),
    currency: z.string().regex(/^[A-Z]{3}$/),
    supportEmail: email,
    ownerEmail: email,
    ownerPassword: password,
  })
  .readonly();
export type RegisterAgencyDto = z.infer<typeof RegisterAgencySchema>;

export const LoginSchema = z.strictObject({ email: email, password: z.string().min(1).max(PASSWORD_MAX) }).readonly();
export type LoginDto = z.infer<typeof LoginSchema>;

export const VerifyEmailSchema = z.strictObject({ token: opaqueToken }).readonly();
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;

export const ForgotPasswordSchema = z.strictObject({ email: email }).readonly();
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z
  .strictObject({ token: opaqueToken, newPassword: password })
  .readonly();
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

export const CaregiverProfileSchema = z
  .strictObject({
    name: z.string().min(2).max(120),
    professionalCategory: z.string().min(2).max(64),
  })
  .readonly();
export type CaregiverProfileDto = z.infer<typeof CaregiverProfileSchema>;

export const CreateInvitationSchema = z
  .strictObject({
    email: email,
    role: z.enum(INVITABLE_STAFF_ROLES),
    caregiverProfile: CaregiverProfileSchema.optional(),
  })
  .readonly();
export type CreateInvitationDto = z.infer<typeof CreateInvitationSchema>;

export const AcceptInvitationSchema = z
  .strictObject({ token: opaqueToken, password: password })
  .readonly();
export type AcceptInvitationDto = z.infer<typeof AcceptInvitationSchema>;

/** Tenant must be ACTIVE before this normalization is trustable. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// --- Response projections (docs 07: safe fields only) ---

export const AuthMeSchema = z
  .strictObject({
    principalType: z.enum(['PLATFORM_OPERATOR', 'AGENCY_STAFF', 'AGENCY_CUSTOMER']),
    email: z.string(),
    role: z.string().optional(),
    tenant: z
      .strictObject({
        tenantId: z.string(),
        slug: z.string(),
        status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED']),
      })
      .optional(),
  })
  .readonly();
export type AuthMeDto = z.infer<typeof AuthMeSchema>;

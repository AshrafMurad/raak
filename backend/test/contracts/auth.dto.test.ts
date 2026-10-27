/**
 * Contract tests: Sprint 1 auth/platform DTOs (docs 05, 07). Strict objects —
 * unknown fields are rejected (mass-assignment prevention, docs 05 rule 4).
 */
import { describe, expect, it } from 'vitest';
import {
  AcceptInvitationSchema,
  CreateInvitationSchema,
  LoginSchema,
  RegisterAgencySchema,
  ResetPasswordSchema,
  ForgotPasswordSchema,
  VerifyEmailSchema,
  RESERVED_SLUGS,
  SLUG_PATTERN,
} from '../../src/contracts/auth';
import { ActivateTenantSchema, SuspendTenantSchema } from '../../src/contracts/platform';

const validRegister = {
  slug: 'afiya-care',
  legalName: 'Afiya Home Care (synthetic)',
  displayName: 'عافية للرعاية المنزلية',
  timezone: 'Asia/Riyadh',
  currency: 'SAR',
  supportEmail: 'support@afiya.example.invalid',
  ownerEmail: 'owner@afiya.example.invalid',
  ownerPassword: 'Synthetic-Pass-1!',
};

describe('RegisterAgencySchema', () => {
  it('accepts a valid registration payload', () => {
    expect(RegisterAgencySchema.parse(validRegister)).toEqual(validRegister);
  });

  it('rejects unknown extra fields', () => {
    expect(
      RegisterAgencySchema.safeParse({ ...validRegister, tenantId: '11111111-1111-4111-8111-111111111111' })
        .success,
    ).toBe(false);
  });

  it.each([
    ['uppercase', 'Afiya'],
    ['leading hyphen', '-afiya'],
    ['trailing hyphen', 'afiya-'],
    ['double hyphen', 'afiya--care'],
    ['spaces', 'afiya care'],
    ['empty', ''],
  ])('rejects a %s slug', (_label, slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(false);
    expect(RegisterAgencySchema.safeParse({ ...validRegister, slug }).success).toBe(false);
  });

  it('rejects reserved slugs', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(RegisterAgencySchema.safeParse({ ...validRegister, slug }).success).toBe(false);
    }
  });

  it('requires a 3-letter uppercase currency and a 10..128 char owner password', () => {
    expect(RegisterAgencySchema.safeParse({ ...validRegister, currency: 'sar' }).success).toBe(false);
    expect(RegisterAgencySchema.safeParse({ ...validRegister, currency: 'SARA' }).success).toBe(false);
    expect(RegisterAgencySchema.safeParse({ ...validRegister, ownerPassword: 'short1!' }).success).toBe(false);
    expect(
      RegisterAgencySchema.safeParse({ ...validRegister, ownerPassword: 'x'.repeat(129) }).success,
    ).toBe(false);
  });
});

describe('simple auth schemas', () => {
  it('LoginSchema rejects unknown fields and bad emails', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.invalid', password: 'Synthetic-1!' }).success).toBe(true);
    expect(LoginSchema.safeParse({ email: 'a@b.invalid', password: 'x', role: 'AGENCY_OWNER' }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: 'not-an-email', password: 'Synthetic-1!' }).success).toBe(false);
  });

  it('token schemas require an opaque non-trivial string', () => {
    const token = 'A'.repeat(43);
    expect(VerifyEmailSchema.safeParse({ token }).success).toBe(true);
    expect(VerifyEmailSchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(ResetPasswordSchema.safeParse({ token, newPassword: 'short' }).success).toBe(false);
    expect(ResetPasswordSchema.safeParse({ token, newPassword: 'Synthetic-1!' }).success).toBe(true);
    expect(ForgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false);
  });
});

describe('CreateInvitationSchema', () => {
  it('accepts admin/coordinator/caregiver roles with an optional caregiver profile', () => {
    for (const role of ['AGENCY_ADMIN', 'CARE_COORDINATOR', 'CAREGIVER'] as const) {
      expect(
        CreateInvitationSchema.safeParse({ email: 'new@example.invalid', role }).success,
      ).toBe(true);
    }
    expect(
      CreateInvitationSchema.safeParse({
        email: 'nurse@example.invalid',
        role: 'CAREGIVER',
        caregiverProfile: { name: 'سلمى أحمد', professionalCategory: 'NURSE' },
      }).success,
    ).toBe(true);
  });

  it('rejects AGENCY_OWNER invitations, bad roles and profile without name', () => {
    expect(
      CreateInvitationSchema.safeParse({ email: 'x@example.invalid', role: 'AGENCY_OWNER' }).success,
    ).toBe(false);
    expect(CreateInvitationSchema.safeParse({ email: 'x@example.invalid', role: 'SUPERUSER' }).success).toBe(false);
    expect(
      CreateInvitationSchema.safeParse({
        email: 'x@example.invalid',
        role: 'CAREGIVER',
        caregiverProfile: { professionalCategory: 'NURSE' },
      }).success,
    ).toBe(false);
  });

  it('AcceptInvitationSchema requires token and password', () => {
    expect(
      AcceptInvitationSchema.safeParse({ token: 'T'.repeat(43), password: 'Synthetic-1!' }).success,
    ).toBe(true);
    expect(AcceptInvitationSchema.safeParse({ token: 'T'.repeat(43) }).success).toBe(false);
  });
});

describe('platform action schemas', () => {
  it('suspend requires a reason of at least 3 characters', () => {
    expect(SuspendTenantSchema.safeParse({ reason: 'Policy violation' }).success).toBe(true);
    expect(SuspendTenantSchema.safeParse({ reason: 'ab' }).success).toBe(false);
    expect(SuspendTenantSchema.safeParse({}).success).toBe(false);
  });

  it('activate reason is optional but bounded', () => {
    expect(ActivateTenantSchema.safeParse({}).success).toBe(true);
    expect(ActivateTenantSchema.safeParse({ reason: 'KYC complete' }).success).toBe(true);
    expect(ActivateTenantSchema.safeParse({ reason: 'r'.repeat(501) }).success).toBe(false);
  });
});

/**
 * Platform control-plane response contracts (docs 07). Aggregate counts and
 * metadata only — no patient data, no agency content (docs 05 PlatformOperator).
 */
import { z } from 'zod';

export const SuspendTenantSchema = z
  .strictObject({ reason: z.string().min(3).max(500) })
  .readonly();
export type SuspendTenantDto = z.infer<typeof SuspendTenantSchema>;

export const ActivateTenantSchema = z
  .strictObject({ reason: z.string().max(500).optional() })
  .readonly();
export type ActivateTenantDto = z.infer<typeof ActivateTenantSchema>;

const PlatformTenantSummaryObject = z.strictObject({
  tenantId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED']),
  counts: z.strictObject({
    owners: z.number().int().nonnegative(),
    staff: z.number().int().nonnegative(),
    customers: z.number().int().nonnegative(),
  }),
});

export const PlatformTenantSummarySchema = PlatformTenantSummaryObject.readonly();
export type PlatformTenantSummaryDto = z.infer<typeof PlatformTenantSummarySchema>;

export const PlatformTenantDetailSchema = PlatformTenantSummaryObject.extend({
  legalName: z.string(),
  timezone: z.string(),
  currency: z.string(),
  supportEmail: z.string(),
  createdAt: z.string().datetime(),
}).readonly();
export type PlatformTenantDetailDto = z.infer<typeof PlatformTenantDetailSchema>;

export const PlatformAuditEntrySchema = z
  .strictObject({
    id: z.string(),
    tenantId: z.string().nullable(),
    action: z.string(),
    subjectType: z.string(),
    subjectId: z.string().nullable(),
    reason: z.string().nullable(),
    at: z.string().datetime(),
  })
  .readonly();
export type PlatformAuditEntryDto = z.infer<typeof PlatformAuditEntrySchema>;

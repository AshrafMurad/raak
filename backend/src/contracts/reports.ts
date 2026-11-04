/**
 * Sprint 7 Session 4 — operational reports and agency audit views
 * (docs 07 "Notifications, documents, reports"). Query DTOs are strict: any
 * unknown parameter — including a crafted client `tenantId` (I02) — is
 * rejected. Tenancy is always server-resolved; filters carry only dates,
 * canonical status codes and opaque in-tenant identifiers.
 */
import { z } from 'zod';
import { LocalDateSchema } from './caregivers';

export const REQUEST_REPORT_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_CUSTOMER',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export const VISIT_REPORT_STATUSES = [
  'PLANNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'MISSED',
] as const;

/** Reports may be narrowed to one status; totals then reconcile inside it. */
export const RequestsReportQuerySchema = z.strictObject({
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  status: z.enum(REQUEST_REPORT_STATUSES).optional(),
  serviceId: z.uuid().optional(),
});
export type RequestsReportQuery = z.infer<typeof RequestsReportQuerySchema>;

export const VisitsReportQuerySchema = z.strictObject({
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  status: z.enum(VISIT_REPORT_STATUSES).optional(),
  serviceId: z.uuid().optional(),
});
export type VisitsReportQuery = z.infer<typeof VisitsReportQuerySchema>;

/** Caregiver load covers assigned visits only; PLANNED is never assigned. */
export const CaregiversReportQuerySchema = VisitsReportQuerySchema;
export type CaregiversReportQuery = VisitsReportQuery;

/** Agency audit view: cursor pagination only, no content filters in V1. */
export const AgencyAuditQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z
    .string()
    .max(100)
    .refine((value) => {
      const [at, id, extra] = value.split('~');
      return !extra && z.iso.datetime().safeParse(at).success && z.uuid().safeParse(id).success;
    })
    .optional(),
});
export type AgencyAuditQuery = z.infer<typeof AgencyAuditQuerySchema>;

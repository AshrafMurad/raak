/** Sprint 6 contracts — visit execution and customer change requests (docs 04
 * BR-VST/BR-CHG, docs 06/07). English status codes are canonical; UI labels
 * live in the frontend feature namespaces. Canonical visit/change outbox
 * events live in `contracts/events.ts`. */
import { z } from 'zod';
import { LocalDateSchema, LocalClockSchema } from './caregivers';

const version = z.number().int().positive();

/** Caregiver-facing visit list window: inclusive agency-local dates. */
export const CaregiverVisitQuerySchema = z.strictObject({
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  cursor: z.uuid().optional(),
});
export type CaregiverVisitQuery = z.infer<typeof CaregiverVisitQuerySchema>;

/** Task outcome: DONE, or NOT_DONE with a mandatory reason (U13). */
export const VisitTaskUpdateSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('DONE') }),
  z.strictObject({
    outcome: z.literal('NOT_DONE'),
    reason: z.string().trim().min(3).max(500),
  }),
]);
export type VisitTaskUpdateInput = z.infer<typeof VisitTaskUpdateSchema>;

/** Draft note body saved by the assigned caregiver until completion. */
export const VisitNoteDraftSchema = z.strictObject({
  body: z.string().trim().min(1).max(5000),
});
export type VisitNoteDraftInput = z.infer<typeof VisitNoteDraftSchema>;

export const CompleteVisitSchema = z.strictObject({});
export const ReviewVisitSchema = z.strictObject({
  expectedVersion: version,
  note: z.string().trim().min(1).max(1000).optional(),
});
export const VisitCorrectionSchema = z.strictObject({
  expectedVersion: version,
  parentNoteId: z.uuid().nullable().default(null),
  body: z.string().trim().min(1).max(5000),
  reason: z.string().trim().min(5).max(500),
});
export type VisitCorrectionInput = z.infer<typeof VisitCorrectionSchema>;

/** Customer change request submission (single occurrence, docs 04 BR-CHG).
 * RESCHEDULE proposes a new local date + clock in the agency timezone; the
 * server resolves it to a UTC instant (DST gaps rejected) and preserves the
 * original duration. Cutoff classification is always server-calculated. */
export const ChangeRequestCreateSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('CANCEL'),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.strictObject({
    type: z.literal('RESCHEDULE'),
    proposedDate: LocalDateSchema,
    proposedTime: LocalClockSchema,
    reason: z.string().trim().min(10).max(1000),
  }),
]);
export type ChangeRequestCreateInput = z.infer<typeof ChangeRequestCreateSchema>;

export const ChangeRequestWithdrawSchema = z.strictObject({});
export const ChangeRequestRejectSchema = z.strictObject({
  reason: z.string().trim().min(5).max(500),
});
export const ChangeRequestApproveSchema = z.strictObject({});

/** Agency change-request queue filters (docs 07). */
export const ChangeRequestQueueQuerySchema = z.strictObject({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  urgency: z.enum(['NORMAL', 'LATE']).optional(),
  cursor: z.uuid().optional(),
});
export type ChangeRequestQueueQuery = z.infer<typeof ChangeRequestQueueQuerySchema>;

/** Customer-facing visit list window: inclusive agency-local dates. */
export const CustomerVisitQuerySchema = z.strictObject({
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  cursor: z.uuid().optional(),
});
export type CustomerVisitQuery = z.infer<typeof CustomerVisitQuerySchema>;

/** Scheduling policy settings (docs 04 BR-SCH/BR-CHG). The settings version
 * starts at 0 (like branding), so non-negative rather than positive. */
export const SchedulingSettingsSchema = z.strictObject({
  expectedVersion: z.number().int().min(0),
  travelBufferMin: z.number().int().min(0).max(120),
  changeCancelCutoffHours: z.number().int().min(0).max(168),
  changeRescheduleCutoffHours: z.number().int().min(0).max(168),
  allowLateReview: z.boolean(),
});
export type SchedulingSettingsInput = z.infer<typeof SchedulingSettingsSchema>;

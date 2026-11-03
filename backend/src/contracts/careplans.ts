/** Sprint 5 contracts — care plans, recurrence, visits and assignment (docs 04
 * BR-PLAN/BR-SCH/BR-VST, docs 06/07). English status codes are canonical; UI
 * labels live in the frontend feature namespace. Canonical care-plan and
 * scheduling outbox events live in `contracts/events.ts`. */
import { z } from 'zod';
import { LocalDateSchema, LocalClockSchema } from './caregivers';

const version = z.number().int().positive();

/** Recurrence span rule (docs 04 BR-PLAN): inclusive local calendar days. */
export const MAX_PLAN_SPAN_DAYS = 60;

export const TaskTemplateSchema = z.strictObject({
  description: z.string().trim().min(1).max(300),
  isRequired: z.boolean(),
});

const planContent = {
  validFrom: LocalDateSchema,
  validUntil: LocalDateSchema,
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'Duplicate weekday'),
  localStartTime: LocalClockSchema,
  durationMin: z.number().int().min(15).max(720),
  goalText: z.string().trim().min(1).max(500).nullable().default(null),
  taskTemplates: z.array(TaskTemplateSchema).max(30).default([]),
  clinicalInstructionsRestricted: z.string().trim().min(1).max(3000).nullable().default(null),
  dstResolution: z.enum(['REJECT', 'EARLIEST', 'LATEST']).default('REJECT'),
};

/** Shared cross-field shape checks. The 60-day span and DST contract are
 * enforced by the recurrence engine so API callers receive the documented
 * PLAN_DURATION_EXCEEDED / RECURRENCE_TIME_INVALID codes instead of generic
 * validation errors. */
function planContentRefine(v: { validFrom: string; validUntil: string }, ctx: z.RefinementCtx) {
  if (v.validFrom > v.validUntil)
    ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'End date precedes start date' });
}

const createBodyFields = {
  agencyServiceId: z.uuid(),
  serviceRequestId: z.uuid().nullable().default(null),
  primaryCaregiverId: z.uuid().nullable().default(null),
  ...planContent,
};
/** HTTP body for the patient-scoped create route (patientId comes from the path). */
export const CarePlanCreateBodySchema = z
  .strictObject(createBodyFields)
  .superRefine(planContentRefine);
export const CarePlanCreateSchema = z
  .strictObject({ patientId: z.uuid(), ...createBodyFields })
  .superRefine(planContentRefine);
export const CarePlanDraftEditSchema = z
  .strictObject({
    expectedDraftVersion: version,
    primaryCaregiverId: z.uuid().nullable().default(null),
    ...planContent,
  })
  .superRefine(planContentRefine);
export const CarePlanReviseSchema = z
  .strictObject({
    primaryCaregiverId: z.uuid().nullable().default(null),
    ...planContent,
  })
  .superRefine(planContentRefine);
export const ApproveClinicalSchema = z.strictObject({ version });
export const ActivateCarePlanSchema = z.strictObject({ version });
export const PauseCarePlanSchema = z
  .strictObject({
    reason: z.string().trim().min(5).max(300).optional(),
    plannedVisitsAction: z.enum(['KEEP', 'CANCEL']),
  })
  .refine((v) => v.plannedVisitsAction !== 'CANCEL' || !!v.reason, {
    message: 'A reason is required when cancelling planned visits',
    path: ['reason'],
  });
export const ResumeCarePlanSchema = z.strictObject({});
export const CompleteCarePlanSchema = z.strictObject({
  reason: z.string().trim().min(5).max(300).optional(),
});
export const CancelCarePlanSchema = z
  .strictObject({
    reason: z.string().trim().min(5).max(300),
    plannedVisitsAction: z.enum(['KEEP', 'CANCEL']),
  })
  .refine((v) => v.plannedVisitsAction !== 'CANCEL' || v.reason.length >= 5, {
    message: 'A reason is required when cancelling planned visits',
    path: ['reason'],
  });

export const VisitListQuerySchema = z.strictObject({
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
  status: z
    .enum(['PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED'])
    .optional(),
  assignmentHealth: z.enum(['OK', 'NEEDS_REASSIGNMENT']).optional(),
  carePlanId: z.uuid().optional(),
  patientId: z.uuid().optional(),
  caregiverId: z.uuid().optional(),
  cursor: z.uuid().optional(),
});

export const CandidateQuerySchema = z.strictObject({});

export const AssignVisitSchema = z.strictObject({
  caregiverId: z.uuid(),
  expectedVisitVersion: version,
  reason: z.string().trim().min(5).max(300).optional(),
});
export const ReassignVisitSchema = z.strictObject({
  caregiverId: z.uuid(),
  expectedVisitVersion: version,
  reason: z.string().trim().min(5).max(300),
});
export const BulkAssignSchema = z.strictObject({
  assignments: z
    .array(
      z.strictObject({
        visitId: z.uuid(),
        caregiverId: z.uuid(),
        expectedVisitVersion: version,
      }),
    )
    .min(1)
    .max(100)
    // ADR-0012 decision 10: array order is semantic and each visit commits
    // independently, so a repeated visitId has no defined meaning. Rejection
    // happens here, before any reservation or per-visit work begins.
    .refine((items) => new Set(items.map((item) => item.visitId)).size === items.length, {
      message: 'Each visit may appear at most once in a bulk assignment',
    }),
  reason: z.string().trim().min(5).max(300).optional(),
});

export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;
export type CarePlanCreateInput = z.infer<typeof CarePlanCreateSchema>;
export type CarePlanDraftEditInput = z.infer<typeof CarePlanDraftEditSchema>;
export type CarePlanReviseInput = z.infer<typeof CarePlanReviseSchema>;
export type VisitListQuery = z.infer<typeof VisitListQuerySchema>;
export type AssignVisitInput = z.infer<typeof AssignVisitSchema>;
export type ReassignVisitInput = z.infer<typeof ReassignVisitSchema>;
export type BulkAssignInput = z.infer<typeof BulkAssignSchema>;

/** Exclusion reason codes surfaced by the candidate engine (safe, no PHI). */
export const CANDIDATE_EXCLUSION_REASONS = [
  'ACCOUNT_INACTIVE',
  'SERVICE_NOT_AUTHORIZED',
  'QUALIFICATION_INVALID',
  'AREA_NOT_COVERED',
  'OUTSIDE_AVAILABILITY',
  'SCHEDULE_CONFLICT',
] as const;
export type CandidateExclusionReason = (typeof CANDIDATE_EXCLUSION_REASONS)[number];

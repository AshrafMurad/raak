/**
 * Care-plan module types (docs 04 BR-PLAN, docs 07 Sprint 5): the explicit
 * controller-facing `CarePlanService` interface plus the shared row and
 * serialized-projection types consumed by the service, repository and content
 * modules. Nothing here executes; response shapes must stay exactly as the
 * API contract documents them.
 */
import type { z } from 'zod';
import type { Prisma } from '../../db/generated/prisma/client';
import type {
  ActivateCarePlanSchema,
  ApproveClinicalSchema,
  CarePlanCreateSchema,
  CarePlanDraftEditSchema,
  CarePlanReviseSchema,
  CancelCarePlanSchema,
  CompleteCarePlanSchema,
  PauseCarePlanSchema,
} from '../../contracts/careplans';
import type { AuthState } from '../auth/guards';

/** Version row subset consumed by activation/preview content mapping. */
export type VersionRow = {
  id: string;
  version: number;
  status: string;
  validFrom: string;
  validUntil: string;
  weekdaysJson: Prisma.JsonValue;
  localStartTime: string;
  durationMin: number;
  goalText: string | null;
  taskTemplatesJson: Prisma.JsonValue;
  clinicalInstructionsRestricted: string | null;
  timezoneSnapshot: string;
  dstResolution: string;
};

/** Serialized care-plan version (docs 07); also the storage select shape. */
export interface VersionProjection {
  id: string;
  version: number;
  status: string;
  validFrom: string;
  validUntil: string;
  weekdaysJson: Prisma.JsonValue;
  localStartTime: string;
  durationMin: number;
  goalText: string | null;
  taskTemplatesJson: Prisma.JsonValue;
  clinicalInstructionsRestricted: string | null;
  timezoneSnapshot: string;
  dstResolution: string;
  approvedByStaffId: string | null;
  approvedAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
}

export interface CarePlanListItem {
  id: string;
  status: string;
  currentVersion: number;
  primaryCaregiverId: string | null;
  startedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  patient: { id: string; displayName: string };
  serviceId: string;
  serviceNameAr: string;
  serviceNameEn: string;
  plannedVisits: number;
}

export interface CarePlanDetail {
  id: string;
  status: string;
  currentVersion: number;
  primaryCaregiverId: string | null;
  startedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  patient: { id: string; displayName: string; areaId: string };
  serviceId: string;
  serviceNameAr: string;
  serviceNameEn: string;
  clinicalClass: string;
  requiredQualificationCodes: string[];
  plannedVisits: number;
  scheduledVisits: number;
  versions: VersionProjection[];
}

export interface CreateCarePlanResult {
  id: string;
  status: string;
  currentVersion: number;
  versions: VersionProjection[];
}

export interface GenerationPreviewOccurrence {
  localDate: string;
  weekday: number;
  startUtc: Date;
  endUtc: Date;
}

export interface GenerationPreview {
  planId: string;
  version: number;
  versionStatus: string;
  clinicalApprovalRequired: boolean;
  spanDays: number;
  occurrenceCount: number;
  occurrences: GenerationPreviewOccurrence[];
  wouldCancelCount: number;
  wouldCancel: Array<{ visitId: string; localDate: string }>;
}

/** Activation/idempotent replay summary stored in the idempotency key row. */
export interface ActivationSummary {
  planId: string;
  version: number;
  status: string;
  generatedVisits: number;
  cancelledVisits: number;
  replay: boolean;
}

export interface PlanTransitionResult {
  id: string;
  status: string;
  cancelledVisits?: number;
}

/**
 * The twelve controller-facing care-plan workflows (docs 07). The controller
 * composes `createCarePlanService(db, now)` and nothing else; transaction,
 * authorization and history invariants stay inside the implementation.
 */
export interface CarePlanService {
  list(
    auth: AuthState,
    filter: { patientId?: string; status?: string; cursor?: string },
  ): Promise<{ items: CarePlanListItem[]; nextCursor: string | null }>;
  detail(auth: AuthState, id: string): Promise<CarePlanDetail>;
  create(
    auth: AuthState,
    input: z.infer<typeof CarePlanCreateSchema>,
  ): Promise<CreateCarePlanResult>;
  editDraft(
    auth: AuthState,
    id: string,
    input: z.infer<typeof CarePlanDraftEditSchema>,
  ): Promise<VersionProjection>;
  approveClinical(
    auth: AuthState,
    id: string,
    input: z.infer<typeof ApproveClinicalSchema>,
  ): Promise<VersionProjection>;
  preview(auth: AuthState, id: string, versionNumber?: number): Promise<GenerationPreview>;
  activate(
    auth: AuthState,
    id: string,
    input: z.infer<typeof ActivateCarePlanSchema>,
    idempotencyKey: string,
  ): Promise<ActivationSummary>;
  revise(
    auth: AuthState,
    id: string,
    input: z.infer<typeof CarePlanReviseSchema>,
  ): Promise<VersionProjection>;
  pause(
    auth: AuthState,
    id: string,
    input: z.infer<typeof PauseCarePlanSchema>,
  ): Promise<PlanTransitionResult>;
  resume(auth: AuthState, id: string): Promise<PlanTransitionResult>;
  complete(
    auth: AuthState,
    id: string,
    input: z.infer<typeof CompleteCarePlanSchema>,
  ): Promise<PlanTransitionResult>;
  cancel(
    auth: AuthState,
    id: string,
    input: z.infer<typeof CancelCarePlanSchema>,
  ): Promise<PlanTransitionResult>;
}

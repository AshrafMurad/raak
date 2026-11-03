/**
 * Care-plan facade (docs 04 BR-PLAN, docs 07 Sprint 5): the stable
 * controller-facing composition of the care-plan queries and command-family
 * modules. Immutable version history, exact-version clinical approval (A06
 * capability check), idempotent activation with recurrence generation,
 * amendment impact handling and the pause/resume/complete/cancel lifecycle
 * each live in their cohesive workflow module; every write still runs inside
 * one transaction with audit/outbox and approved/activated versions remain
 * immutable. This module owns no Prisma workflow implementation.
 */
import type { DatabaseClient } from '../../db/client';
import { createCarePlanQueries } from './care-plan.queries';
import { createCarePlanDraftRevisionService } from './care-plan-draft.service';
import { createCarePlanClinicalApprovalService } from './care-plan-clinical-approval.service';
import { createCarePlanActivationService } from './care-plan-activation.service';
import { createCarePlanLifecycleService } from './care-plan-lifecycle.service';
import type { CarePlanService } from './care-plan.types';

export function createCarePlanService(db: DatabaseClient, now: () => Date): CarePlanService {
  const queries = createCarePlanQueries(db);
  const drafts = createCarePlanDraftRevisionService(db);
  const approval = createCarePlanClinicalApprovalService(db, now);
  const activation = createCarePlanActivationService(db, now);
  const lifecycle = createCarePlanLifecycleService(db, now);
  return {
    list: queries.list,
    detail: queries.detail,
    preview: queries.preview,
    create: drafts.create,
    editDraft: drafts.editDraft,
    revise: drafts.revise,
    approveClinical: approval.approveClinical,
    activate: activation.activate,
    pause: lifecycle.pause,
    resume: lifecycle.resume,
    complete: lifecycle.complete,
    cancel: lifecycle.cancel,
  };
}

/**
 * Care-plan scoped loaders, locks and projections (docs 04 BR-PLAN). Every
 * function is tenant-scoped by its `tenantId` argument and receives the
 * owning workflow transaction; there is deliberately no generic CRUD surface.
 * Lock order and privacy-safe misses are unchanged from the characterized
 * Sprint 5 behavior this module was extracted from.
 */
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import { ServiceConfigSchema } from '../../contracts/catalog';
import { missing } from '../common/agency-action';

/** Serialized version select shared by every version read/write projection. */
export const versionProjection = {
  id: true,
  version: true,
  status: true,
  validFrom: true,
  validUntil: true,
  weekdaysJson: true,
  localStartTime: true,
  durationMin: true,
  goalText: true,
  taskTemplatesJson: true,
  clinicalInstructionsRestricted: true,
  timezoneSnapshot: true,
  dstResolution: true,
  approvedByStaffId: true,
  approvedAt: true,
  activatedAt: true,
  createdAt: true,
} as const;

/** Plan row lock: SELECT ... FOR UPDATE precedes every dependent read/write. */
export async function lockPlan(tx: Prisma.TransactionClient, tenantId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM care_plans WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  const plan = await tx.carePlan.findFirst({ where: { tenantId, id } });
  if (!plan) throw missing();
  return plan;
}

/** Enabled-service snapshot with parsed config; recurring-capable only. */
export async function serviceSnapshot(
  tx: Prisma.TransactionClient,
  tenantId: string,
  serviceId: string,
) {
  const service = await tx.agencyService.findFirst({
    where: { tenantId, id: serviceId, isEnabled: true },
  });
  if (!service) throw missing();
  const config = ServiceConfigSchema.parse(service.config);
  if (!config.allowRecurring)
    throw new ApiError(422, 'VALIDATION_FAILED', 'Service does not allow recurring care plans.');
  return { service, config };
}

/** The plan's open DRAFT version; 409 when draft workflows have none. */
export async function openDraft(tx: Prisma.TransactionClient, tenantId: string, planId: string) {
  const draft = await tx.carePlanVersion.findFirst({
    where: { tenantId, carePlanId: planId, status: 'DRAFT' },
  });
  if (!draft)
    throw new ApiError(
      409,
      'STATE_TRANSITION_INVALID',
      'No open draft version; use revise to create one.',
    );
  return draft;
}

/** Revise precondition: no open DRAFT version may exist. */
export async function openDraftGuard(
  tx: Prisma.TransactionClient,
  tenantId: string,
  planId: string,
) {
  const draft = await tx.carePlanVersion.findFirst({
    where: { tenantId, carePlanId: planId, status: 'DRAFT' },
    select: { id: true },
  });
  if (draft)
    throw new ApiError(
      409,
      'STATE_TRANSITION_INVALID',
      'An open draft version already exists; edit or activate it first.',
    );
}

/**
 * Exact linkage loader (ADR-0012 decision 9): tenant-scoped request lookup by
 * id; the caller decides between the privacy-safe 404 miss and the semantic
 * mismatch 409 so no request content leaks through this module.
 */
export async function findLinkedRequest(
  tx: Prisma.TransactionClient,
  tenantId: string,
  serviceRequestId: string,
) {
  return tx.serviceRequest.findFirst({
    where: { tenantId, id: serviceRequestId },
    select: { status: true, patientId: true, agencyServiceId: true },
  });
}

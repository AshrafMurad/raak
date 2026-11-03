/**
 * Parent-plan assignment policy (ADR-0012 decisions 6/8): candidate lookup and
 * new assignment are permitted only while the parent care plan is ACTIVE;
 * retained PLANNED visits under DRAFT/PAUSED/COMPLETED/CANCELLED plans are not
 * newly assignable and rejections stay privacy-safe. Plan-backed assignment
 * writers lock tenant -> care plan -> visit -> caregiver; this module owns the
 * care-plan step so scheduling cannot bypass the locked recheck.
 */
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import { missing } from '../common/agency-action';

export function isCarePlanAssignable(status: string): boolean {
  return status === 'ACTIVE';
}

/**
 * Locks the tenant-scoped parent plan of a visit and rechecks assignability at
 * the writer's linearization point. Throws without plan or patient content.
 */
export async function lockAssignableCarePlanForVisit(
  tx: Prisma.TransactionClient,
  tenantId: string,
  carePlanId: string,
): Promise<void> {
  const status = await lockCarePlanForVisit(tx, tenantId, carePlanId);
  if (!isCarePlanAssignable(status))
    throw new ApiError(
      409,
      'STATE_TRANSITION_INVALID',
      'This visit is not assignable in its care plan state.',
    );
}

/** Confirmed visits retained by KEEP may be maintained without creating new visits. */
export async function lockCarePlanForVisit(
  tx: Prisma.TransactionClient,
  tenantId: string,
  carePlanId: string,
): Promise<string> {
  await tx.$queryRaw`SELECT id FROM care_plans WHERE tenant_id = ${tenantId}::uuid AND id = ${carePlanId}::uuid FOR UPDATE`;
  const plan = await tx.carePlan.findFirst({
    where: { tenantId, id: carePlanId },
    select: { status: true },
  });
  if (!plan) throw missing();
  return plan.status;
}

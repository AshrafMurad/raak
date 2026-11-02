import type { Prisma } from '../../db/generated/prisma/client';
import type { AuthState } from '../auth/guards';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';

/** Borrow the workflow transaction; never calls a provider. */
export async function recordChange(
  tx: Prisma.TransactionClient,
  auth: AuthState,
  tenantId: string,
  id: string,
  action: string,
  subjectType: string,
  metadata: Prisma.InputJsonValue = {},
  reason?: string,
) {
  await appendAudit(tx, {
    tenantId,
    actorType: auth.session.principalType,
    actorId: auth.session.principalId,
    action,
    subjectType,
    subjectId: id,
    metadata,
    reason,
  });
  await enqueueOutbox(tx, { tenantId, eventType: action, aggregateId: id, payloadMinimal: {} });
}

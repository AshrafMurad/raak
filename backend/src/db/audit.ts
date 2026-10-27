import type { Prisma } from './generated/prisma/client';

/**
 * Audit append (docs 06 AUDIT_EVENT): must run inside the SAME transaction as
 * the state change it records. Append-only — nothing deletes audit rows.
 */
export interface AuditEventInput {
  tenantId?: string | undefined;
  actorType?: 'PLATFORM_OPERATOR' | 'AGENCY_STAFF' | 'AGENCY_CUSTOMER' | undefined;
  actorId?: string | undefined;
  action: string;
  subjectType: string;
  subjectId?: string | undefined;
  reason?: string | undefined;
  metadata?: Prisma.InputJsonValue;
}

export async function appendAudit(tx: Prisma.TransactionClient, input: AuditEventInput) {
  return tx.auditEvent.create({
    data: {
      ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
      ...(input.actorType !== undefined ? { actorType: input.actorType } : {}),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      action: input.action,
      subjectType: input.subjectType,
      ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      metadataJson: input.metadata ?? {},
    },
  });
}

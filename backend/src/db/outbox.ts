import type { Prisma } from './generated/prisma/client';

/**
 * Outbox append stub (docs 08): must be called with the SAME transaction client
 * as the business state change, so the event commits atomically or not at all.
 * Dispatch (poller -> BullMQ) arrives in a later sprint; Sprint 0 ships the
 * table + typed append path only.
 */
export interface OutboxEventInput {
  tenantId?: string | undefined;
  eventType: string;
  aggregateId: string;
  payloadMinimal: Prisma.InputJsonObject;
}

export async function enqueueOutbox(tx: Prisma.TransactionClient, input: OutboxEventInput) {
  return tx.outboxEvent.create({
    data: {
      ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
      eventType: input.eventType,
      aggregateId: input.aggregateId,
      payloadMinimal: input.payloadMinimal,
    },
  });
}

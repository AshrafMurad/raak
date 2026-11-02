import type { Prisma } from '../../db/generated/prisma/client';

/** Borrow the workflow transaction so notification references commit with the action. */
export async function notifyCoordinators(
  tx: Prisma.TransactionClient,
  tenantId: string,
  requestId: string,
  eventType: 'QUOTE_RESPONSE' | 'QUOTE_REVISION_REQUESTED',
) {
  const recipients = await tx.staffAccount.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      role: { in: ['AGENCY_OWNER', 'AGENCY_ADMIN', 'CARE_COORDINATOR'] },
    },
    select: { id: true },
  });
  if (recipients.length === 0) return;
  await tx.requestNotification.createMany({
    data: recipients.map((s) => ({ tenantId, requestId, staffId: s.id, eventType })),
    skipDuplicates: true,
  });
}

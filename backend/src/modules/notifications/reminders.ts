import type { Prisma } from '../../db/generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { NotificationEvents } from '../../contracts/notifications';

/** Caller holds the tenant/visit writer locks. No external calls. History is retained. */
export async function replaceVisitReminders(tx: Prisma.TransactionClient, tenantId: string, visitId: string, now: Date) {
  const visit = await tx.visit.findFirst({ where: { tenantId, id: visitId }, select: { status: true, scheduledStartUtc: true } });
  if (!visit) return;
  const old = await tx.visitReminder.findMany({ where: { tenantId, visitId }, select: { id: true } });
  const ids = old.map((r) => r.id);
  if (ids.length) {
    await tx.outboxEvent.updateMany({ where: { tenantId, id: { in: ids }, processedAt: null }, data: { processedAt: now } });
    await tx.notificationDelivery.updateMany({ where: { tenantId, eventId: { in: ids }, status: { in: ['PENDING', 'SENDING'] } },
      data: { status: 'SKIPPED', leaseUntil: null, executionToken: null, lastErrorCode: 'REMINDER_SUPERSEDED' } });
  }
  const current = await tx.visit.update({ where: { tenantId_id: { tenantId, id: visitId } },
    data: { reminderRevision: { increment: 1 } }, select: { reminderRevision: true } });
  if (visit.status !== 'SCHEDULED') return;
  const policies = await tx.notificationPolicy.findMany({ where: { tenantId, eventType: 'VISIT_REMINDER' } });
  for (const channel of ['IN_APP', 'EMAIL'] as const) {
    const policy = policies.find((p) => p.channel === channel);
    if (policy?.enabled === false) continue;
    for (const offsetMin of policy?.reminderOffsetMin ? [policy.reminderOffsetMin] : [1440, 120]) {
      const dueAt = new Date(visit.scheduledStartUtc.getTime() - offsetMin * 60000);
      if (dueAt <= now) continue;
      const id = randomUUID();
      await tx.visitReminder.create({ data: { id, tenantId, visitId, revision: current.reminderRevision, channel, offsetMin, dueAt, scheduledStartUtc: visit.scheduledStartUtc } });
      await tx.outboxEvent.create({ data: { id, tenantId, aggregateId: id, eventType: NotificationEvents.VISIT_REMINDER, payloadMinimal: {}, createdAt: dueAt } });
    }
  }
}

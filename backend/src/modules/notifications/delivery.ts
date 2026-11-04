import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import type { NotificationEvent } from '../../contracts/notifications';
import type { EmailSender } from './request-email';
import { resolveAudience } from './audience';
import { channelEnabled } from './policy';

export type NotificationRenderer = (eventType: NotificationEvent) => { subject: string; text: string } | null;

/** No production business renderer is registered until Session 3. Missing dependencies
 * leave work durable without consuming attempts. All external calls follow the transaction. */
export async function deliverNotificationEmail(deps: {
  db: DatabaseClient; tenantId: string; deliveryId: string; now(): Date;
  render?: NotificationRenderer; send?: EmailSender;
}) {
  const { db, tenantId, deliveryId, now } = deps;
  const work = await db.$transaction(async (tx) => {
    const tenant = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
    if (tenant[0]?.status !== 'ACTIVE') return null;
    const delivery = await tx.notificationDelivery.findFirst({ where: { tenantId, id: deliveryId, status: { in: ['PENDING', 'SENDING'] } } });
    if (!delivery || delivery.retryAt > now() || (delivery.leaseUntil && delivery.leaseUntil >= now())) return null;
    if (delivery.attempts >= 5) {
      await tx.notificationDelivery.updateMany({ where: { tenantId, id: deliveryId, executionToken: delivery.executionToken },
        data: { status: 'FAILED', leaseUntil: null, executionToken: null, lastErrorCode: 'LEASE_EXHAUSTED' } }); return null;
    }
    const content = deps.render?.(delivery.eventType as NotificationEvent);
    if (!content || !deps.send) {
      await tx.notificationDelivery.updateMany({ where: { tenantId, id: deliveryId, executionToken: delivery.executionToken },
        data: { status: 'PENDING', executionToken: null, leaseUntil: null,
          retryAt: new Date(now().getTime() + 60000),
          lastErrorCode: !content ? 'TEMPLATE_NOT_CONFIGURED' : 'EMAIL_NOT_CONFIGURED' } }); return null;
    }
    const event = await tx.outboxEvent.findFirst({ where: { tenantId, id: delivery.eventId } });
    const audience = event ? await resolveAudience(tx, { tenantId, aggregateId: event.aggregateId, eventType: event.eventType }, now()) : null;
    const recipient = audience?.recipients.find((r) => r.principalType === delivery.principalType && r.principalId === delivery.recipientPrincipalId);
    const enabled = audience && recipient && await channelEnabled(tx, { tenantId, principalType: recipient.principalType,
      principalId: recipient.principalId, eventType: audience.eventType, channel: 'EMAIL' });
    if (!recipient || !enabled || audience?.eventType !== delivery.eventType) {
      await tx.notificationDelivery.updateMany({ where: { tenantId, id: deliveryId }, data: {
        status: 'SKIPPED', executionToken: null, leaseUntil: null, lastErrorCode: 'RECIPIENT_UNAVAILABLE' } }); return null;
    }
    const executionToken = randomUUID();
    const claim = await tx.notificationDelivery.updateMany({ where: { tenantId, id: deliveryId, executionToken: delivery.executionToken,
      attempts: delivery.attempts, status: delivery.status }, data: { status: 'SENDING', executionToken,
      leaseUntil: new Date(now().getTime() + 120000), attempts: { increment: 1 }, lastErrorCode: null } });
    return claim.count === 1 ? { executionToken, content, recipient, attempts: delivery.attempts + 1 } : null;
  });
  if (!work) return;
  try {
    // Fresh authorization after claiming, immediately before external I/O.
    const valid = await db.$transaction(async (tx) => {
      const event = await tx.outboxEvent.findFirst({ where: { tenantId, notificationDeliveries: { some: { id: deliveryId, executionToken: work.executionToken } } } });
      const audience = event ? await resolveAudience(tx, { tenantId, eventType: event.eventType, aggregateId: event.aggregateId }, now()) : null;
      return audience?.recipients.some((r) => r.principalId === work.recipient.principalId && r.principalType === work.recipient.principalType && r.email === work.recipient.email)
        && await channelEnabled(tx, { tenantId, principalType: work.recipient.principalType, principalId: work.recipient.principalId,
          eventType: audience.eventType, channel: 'EMAIL' });
    });
    if (!valid) {
      await db.notificationDelivery.updateMany({ where: { tenantId, id: deliveryId, executionToken: work.executionToken },
        data: { status: 'PENDING', executionToken: null, leaseUntil: null, retryAt: new Date(now().getTime() + 60000), lastErrorCode: 'RECIPIENT_UNAVAILABLE' } });
      return;
    }
    await deps.send!({ to: work.recipient.email, ...work.content, idempotencyKey: deliveryId });
    await db.notificationDelivery.updateMany({ where: { tenantId, id: deliveryId, executionToken: work.executionToken, status: 'SENDING' },
      data: { status: 'SENT', leaseUntil: null, executionToken: null, lastErrorCode: null } });
  } catch {
    await db.notificationDelivery.updateMany({ where: { tenantId, id: deliveryId, executionToken: work.executionToken, status: 'SENDING' },
      data: { status: work.attempts >= 5 ? 'FAILED' : 'PENDING', leaseUntil: null, executionToken: null,
        retryAt: new Date(now().getTime() + 1000 * 2 ** work.attempts), lastErrorCode: 'DELIVERY_FAILED' } });
  }
}

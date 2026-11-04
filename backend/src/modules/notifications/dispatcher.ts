import type { DatabaseClient } from '../../db/client';
import { DISPATCH_EVENT_KINDS, resolveAudience } from './audience';
import { channelEnabled } from './policy';

/** Caller supplies only an outbox ID; tenant authority comes from the persisted event. */
export async function dispatchNotificationEvent(db: DatabaseClient, eventId: string, now: () => Date) {
  const hint = await db.outboxEvent.findFirst({ where: { id: eventId, processedAt: null, eventType: { in: [...DISPATCH_EVENT_KINDS] } }, select: { tenantId: true } });
  if (!hint?.tenantId) return;
  const tenantId = hint.tenantId;
  await db.$transaction(async (tx) => {
    const tenants = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
    if (tenants[0]?.status !== 'ACTIVE') return;
    await tx.$queryRaw`SELECT id FROM outbox_events WHERE tenant_id = ${tenantId}::uuid AND id = ${eventId}::uuid FOR UPDATE`;
    const event = await tx.outboxEvent.findFirst({ where: { tenantId, id: eventId, processedAt: null } });
    if (!event || event.createdAt > now()) return;
    const audience = await resolveAudience(tx, { tenantId, aggregateId: event.aggregateId, eventType: event.eventType }, now());
    if (!audience) return; // missing/unsupported aggregates remain durable for inspection
    for (const recipient of audience.recipients) {
      const input = { tenantId, principalType: recipient.principalType, principalId: recipient.principalId, eventType: audience.eventType };
      if (recipient.principalType !== 'VERIFIED_GUEST' && audience.channel !== 'EMAIL' && await channelEnabled(tx, { ...input, channel: 'IN_APP' }))
        await tx.notification.createMany({ skipDuplicates: true, data: [{ tenantId, eventId, principalType: recipient.principalType,
          recipientPrincipalId: recipient.principalId, eventType: audience.eventType, entityType: audience.entityType, entityId: audience.entityId }] });
      if (audience.channel !== 'IN_APP' && await channelEnabled(tx, { ...input, channel: 'EMAIL' }))
        await tx.notificationDelivery.createMany({ skipDuplicates: true, data: [{ tenantId, eventId,
          principalType: recipient.principalType, recipientPrincipalId: recipient.principalId, eventType: audience.eventType,
          retryAt: now(), lastErrorCode: 'TEMPLATE_NOT_CONFIGURED' }] });
    }
    if (!audience.blocked)
      await tx.outboxEvent.updateMany({ where: { tenantId, id: eventId, processedAt: null }, data: { processedAt: now() } });
  });
}

import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { channelPolicy, NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, NotificationEvents,
  type NotificationPolicyPatchSchema, type DeliveryQuerySchema } from '../../contracts/notifications';
import type { AuthState } from '../auth/guards';
import { agencyAction, stale } from '../common/agency-action';
import { recordChange } from '../common/record-change';

export function createNotificationService(db: DatabaseClient) {
  return {
    read: (auth: AuthState) => db.$transaction(async (tx) => {
      const tenantId = await agencyAction(tx, auth, 'notifications.policy.read');
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { notificationSettingsVersion: true } });
      const rows = await tx.notificationPolicy.findMany({ where: { tenantId } });
      return { version: tenant.notificationSettingsVersion, policies: NOTIFICATION_EVENTS.flatMap((eventType) =>
        NOTIFICATION_CHANNELS.map((channel) => {
          const cell = channelPolicy(eventType, channel);
          const row = rows.find((r) => r.eventType === eventType && r.channel === channel);
          return { eventType, channel, enabled: cell.configurable ? row?.enabled ?? cell.enabled : cell.enabled,
            configurable: cell.configurable, reminderOffsetMin: row?.reminderOffsetMin ?? null };
        })) };
    }),
    update: (auth: AuthState, input: z.infer<typeof NotificationPolicyPatchSchema>) => db.$transaction(async (tx) => {
      const tenantId = await agencyAction(tx, auth, 'notifications.policy.manage');
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { notificationSettingsVersion: true } });
      if (input.expectedVersion !== tenant.notificationSettingsVersion) throw stale();
      for (const cell of input.policies) await tx.notificationPolicy.upsert({
        where: { tenantId_eventType_channel: { tenantId, eventType: cell.eventType, channel: cell.channel } },
        create: { tenantId, ...cell, updatedBy: auth.session.principalId },
        update: { enabled: cell.enabled, reminderOffsetMin: cell.reminderOffsetMin ?? null, updatedBy: auth.session.principalId },
      });
      await tx.tenant.update({ where: { id: tenantId }, data: { notificationSettingsVersion: { increment: 1 } } });
      await recordChange(tx, auth, tenantId, tenantId, NotificationEvents.POLICY_UPDATED, 'tenant');
      return { version: tenant.notificationSettingsVersion + 1 };
    }),
    deliveries: (auth: AuthState, input: z.infer<typeof DeliveryQuerySchema>) => db.$transaction(async (tx) => {
      const tenantId = await agencyAction(tx, auth, 'notifications.deliveries.read');
      const items = await tx.notificationDelivery.findMany({ where: { tenantId,
        ...(input.status ? { status: input.status } : {}), ...(input.cursor ? { id: { lt: input.cursor } } : {}) },
        orderBy: { id: 'desc' }, take: input.limit + 1,
        select: { id: true, eventType: true, channel: true, status: true, attempts: true, retryAt: true, lastErrorCode: true, createdAt: true } });
      const more = items.length > input.limit; if (more) items.pop();
      const unresolved = await tx.outboxEvent.findMany({ where: { tenantId, processedAt: null,
        eventType: { in: ['visit.change_approved', 'visit.confirmed', 'visit.notification_changed', 'request.info_needed', 'quote.sent', 'quote.revision_sent'] }, ...(input.cursor ? { id: { lt: input.cursor } } : {}) },
        orderBy: { id: 'desc' }, take: input.limit + 1, select: { id: true, eventType: true, createdAt: true } });
      const blockedMore = unresolved.length > input.limit; if (blockedMore) unresolved.pop();
      return { items, nextCursor: more ? items.at(-1)?.id ?? null : null,
        blockedEvents: unresolved.map((e) => ({ ...e, code: 'RECIPIENT_RESOLUTION_PENDING' })),
        blockedNextCursor: blockedMore ? unresolved.at(-1)?.id ?? null : null };
    }),
  };
}

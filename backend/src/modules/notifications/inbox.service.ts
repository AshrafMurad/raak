import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  channelPolicy,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NotificationEvents,
  type InboxQuerySchema,
  type NotificationPreferencePatchSchema,
} from '../../contracts/notifications';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { customerAction } from '../common/customer-action';
import type { Prisma } from '../../db/generated/prisma/client';
import { notificationTarget } from './notification-target';
import { recordChange } from '../common/record-change';

async function selfScope(tx: Prisma.TransactionClient, auth: AuthState) {
  const tenantId =
    auth.session.principalType === 'AGENCY_CUSTOMER'
      ? (await customerAction(tx, auth, 'notifications.receive', () => new Date())).tenantId
      : await agencyAction(tx, auth, 'notifications.receive');
  return {
    tenantId,
    principalType: auth.session.principalType,
    recipientPrincipalId: auth.session.principalId,
  };
}

export function createInboxService(db: DatabaseClient) {
  return {
    list: (auth: AuthState, input: z.infer<typeof InboxQuerySchema>) =>
      db.$transaction(async (tx) => {
        const scope = await selfScope(tx, auth);
        const [at, id] = input.cursor?.split('~') ?? [];
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: scope.tenantId },
          select: { timezone: true },
        });
        const items = await tx.notification.findMany({
          where: {
            ...scope,
            ...(input.unreadOnly === 'true' ? { readAt: null } : {}),
            ...(at && id
              ? {
                  OR: [
                    { createdAt: { lt: new Date(at) } },
                    { createdAt: new Date(at), id: { lt: id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: input.limit + 1,
          select: { id: true, eventType: true, readAt: true, createdAt: true },
        });
        const more = items.length > input.limit;
        if (more) items.pop();
        const last = items.at(-1);
        return {
          items,
          timezone: tenant.timezone,
          nextCursor: more && last ? `${last.createdAt.toISOString()}~${last.id}` : null,
        };
      }),
    count: (auth: AuthState) =>
      db.$transaction(async (tx) => {
        const scope = await selfScope(tx, auth);
        return { count: await tx.notification.count({ where: { ...scope, readAt: null } }) };
      }),
    read: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const scope = await selfScope(tx, auth);
        await tx.notification.updateMany({
          where: { ...scope, id, readAt: null },
          data: { readAt: new Date() },
        });
        const row = await tx.notification.findFirst({
          where: { ...scope, id },
          select: { id: true, readAt: true },
        });
        if (!row) throw missing();
        return row;
      }),
    target: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const scope = await selfScope(tx, auth);
        const row = await tx.notification.findFirst({
          where: { ...scope, id },
          select: { tenantId: true, entityType: true, entityId: true },
        });
        if (!row) throw missing();
        return { path: await notificationTarget(tx, auth, row) };
      }),
    preferences: (auth: AuthState) =>
      db.$transaction(async (tx) => {
        const scope = await selfScope(tx, auth);
        const rows = await tx.notificationPreference.findMany({
          where: {
            tenantId: scope.tenantId,
            principalType: scope.principalType,
            principalId: scope.recipientPrincipalId,
          },
        });
        const policies = await tx.notificationPolicy.findMany({
          where: { tenantId: scope.tenantId },
        });
        return {
          preferences: NOTIFICATION_EVENTS.flatMap((eventType) =>
            NOTIFICATION_CHANNELS.flatMap((channel) => {
              if (!channelPolicy(eventType, channel).configurable) return [];
              return [
                {
                  eventType,
                  channel,
                  optedOut:
                    rows.find((r) => r.eventType === eventType && r.channel === channel)
                      ?.optedOut ?? false,
                  tenantEnabled:
                    policies.find((p) => p.eventType === eventType && p.channel === channel)
                      ?.enabled ?? true,
                },
              ];
            }),
          ),
        };
      }),
    updatePreferences: (
      auth: AuthState,
      input: z.infer<typeof NotificationPreferencePatchSchema>,
    ) =>
      db.$transaction(async (tx) => {
        const scope = await selfScope(tx, auth);
        const key = {
          tenantId: scope.tenantId,
          principalType: scope.principalType,
          principalId: scope.recipientPrincipalId,
        };
        for (const cell of input.preferences)
          await tx.notificationPreference.upsert({
            where: {
              tenantId_principalType_principalId_eventType_channel: {
                ...key,
                eventType: cell.eventType,
                channel: cell.channel,
              },
            },
            create: { ...key, ...cell },
            update: { optedOut: cell.optedOut },
          });
        await recordChange(
          tx,
          auth,
          scope.tenantId,
          scope.recipientPrincipalId,
          NotificationEvents.PREFERENCES_UPDATED,
          'principal',
        );
        return { ok: true };
      }),
  };
}

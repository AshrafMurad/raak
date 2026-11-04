import type { Prisma } from '../../db/generated/prisma/client';
import { channelPolicy, type NotificationChannel, type NotificationEvent } from '../../contracts/notifications';

export async function channelEnabled(tx: Prisma.TransactionClient, input: {
  tenantId: string; principalType: 'AGENCY_STAFF' | 'AGENCY_CUSTOMER'; principalId: string;
  eventType: NotificationEvent; channel: NotificationChannel;
}) {
  const cell = channelPolicy(input.eventType, input.channel);
  if (!cell.configurable) return cell.enabled;
  const { tenantId, eventType, channel, principalType, principalId } = input;
  const override = await tx.notificationPolicy.findUnique({ where: { tenantId_eventType_channel: { tenantId, eventType, channel } } });
  if (override?.enabled === false) return false;
  const preference = await tx.notificationPreference.findUnique({ where: {
    tenantId_principalType_principalId_eventType_channel: { tenantId, principalType, principalId, eventType, channel },
  } });
  return !preference?.optedOut;
}

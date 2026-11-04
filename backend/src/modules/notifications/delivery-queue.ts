import type { Queue } from 'bullmq';

/** Retained failed infrastructure jobs must not strand durable delivery rows. */
export async function enqueueNotificationDelivery(queue: Queue, tenantId: string, deliveryId: string) {
  const existing = await queue.getJob(deliveryId);
  if (existing) {
    if (await existing.isFailed()) await existing.retry('failed');
    return;
  }
  await queue.add('notification-email', { tenantId, deliveryId }, { jobId: deliveryId, attempts: 5,
    backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: 100 });
}

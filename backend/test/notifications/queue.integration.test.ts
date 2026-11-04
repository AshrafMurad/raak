import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { enqueueNotificationDelivery } from '../../src/modules/notifications/delivery-queue';

it('recovers failed general-queue jobs without duplicating the stable delivery key', async () => {
  const connection = new IORedis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6380', { maxRetriesPerRequest: null });
  const name = `synthetic-notifications-${randomUUID()}`;
  const queue = new Queue(name, { connection });
  let failing = true; let sent = 0;
  const worker = new Worker(name, async () => { if (failing) throw new Error('SYNTHETIC_FAILURE'); sent++; }, { connection });
  try {
    const deliveryId = randomUUID(); const tenantId = randomUUID();
    await queue.add('synthetic', { tenantId, deliveryId }, { jobId: deliveryId, attempts: 1 });
    await expect.poll(async () => (await queue.getJob(deliveryId))?.isFailed()).toBe(true);
    failing = false;
    await enqueueNotificationDelivery(queue, tenantId, deliveryId);
    await expect.poll(() => sent).toBe(1);
    await enqueueNotificationDelivery(queue, tenantId, deliveryId);
    expect(sent).toBe(1);
  } finally { await worker.close(); await queue.obliterate({ force: true }); await queue.close(); await connection.quit(); }
});

import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { enqueueRequestEmail } from '../../src/modules/notifications/request-email-queue';

it('recovers a retained failed BullMQ job with the same stable event key', async () => {
  const connection = new IORedis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6380', {
    maxRetriesPerRequest: null,
  });
  const name = `synthetic-sprint2-${randomUUID()}`;
  const queue = new Queue(name, { connection });
  let fail = true;
  let sent = 0;
  const worker = new Worker(
    name,
    async () => {
      if (fail) throw new Error('SYNTHETIC_DB_UNAVAILABLE');
      sent++;
    },
    { connection },
  );
  try {
    const eventId = randomUUID();
    await queue.add(
      'request-email',
      { eventId },
      { jobId: eventId, attempts: 1, removeOnFail: false },
    );
    await expect.poll(async () => (await queue.getJob(eventId))?.isFailed()).toBe(true);
    fail = false;
    await enqueueRequestEmail(queue, eventId);
    await expect.poll(() => sent).toBe(1);
    await enqueueRequestEmail(queue, eventId);
    expect(sent).toBe(1);
  } finally {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
  }
});

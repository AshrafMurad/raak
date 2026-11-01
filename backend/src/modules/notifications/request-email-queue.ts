import type { Queue } from 'bullmq';
/** A durable outbox event must not be stranded behind a retained failed job.
 * Provider idempotency stays event-based through all infrastructure retries. */
export async function enqueueRequestEmail(queue: Queue, eventId: string) {
  const existing = await queue.getJob(eventId);
  if (existing) {
    if (await existing.isFailed()) await existing.retry('failed');
    return;
  }
  await queue.add(
    'request-email',
    { eventId },
    {
      jobId: eventId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

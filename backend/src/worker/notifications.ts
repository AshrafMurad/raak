import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { DatabaseClient } from '../db/client';
import { DISPATCH_EVENT_KINDS } from '../modules/notifications/audience';
import { dispatchNotificationEvent } from '../modules/notifications/dispatcher';
import { deliverNotificationEmail, type NotificationRenderer } from '../modules/notifications/delivery';
import { enqueueNotificationDelivery } from '../modules/notifications/delivery-queue';
import type { EmailSender } from '../modules/notifications/request-email';
import { QUEUES } from './queues';

/** Dispatcher runs even without email credentials. Renderers are supplied only by
 * their owning slice; no generic business-email fallback silently sends mail. */
export function startNotifications(deps: {
  db: DatabaseClient; connection: ConnectionOptions; now(): Date;
  render?: NotificationRenderer; send?: EmailSender; onError(): void;
}) {
  const queue = new Queue(QUEUES.NOTIFICATION_EMAIL, { connection: deps.connection });
  const worker = new Worker<{ tenantId: string; deliveryId: string }>(QUEUES.NOTIFICATION_EMAIL,
    async (job) => { await deliverNotificationEmail({ db: deps.db, now: deps.now, ...job.data,
      ...(deps.render ? { render: deps.render } : {}), ...(deps.send ? { send: deps.send } : {}) }); },
    { connection: deps.connection });
  worker.on('error', deps.onError);
  queue.on('error', deps.onError);
  let running: Promise<void> | null = null;
  let stopped = false;
  let cursor: string | undefined;
  let deliveryCursor: string | undefined;
  async function tick() {
    const events = await deps.db.outboxEvent.findMany({ where: { processedAt: null,
      eventType: { in: [...DISPATCH_EVENT_KINDS] }, tenantId: { not: null }, createdAt: { lte: deps.now() },
      ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 100, select: { id: true, tenantId: true } });
    cursor = events.at(-1)?.id;
    // Failed/suspended aggregates do not prevent later events in the batch.
    for (const event of events) {
      try { await dispatchNotificationEvent(deps.db, event.id, deps.now); } catch { deps.onError(); }
    }
    // Run durable dependency checks too: missing provider/template updates safe
    // metadata and defers a minute without consuming a delivery attempt.
    const deliveries = await deps.db.notificationDelivery.findMany({ where: {
      status: { in: ['PENDING', 'SENDING'] }, retryAt: { lte: deps.now() },
      ...(deliveryCursor ? { id: { gt: deliveryCursor } } : {}),
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: deps.now() } }],
    }, orderBy: { id: 'asc' }, take: 100, select: { id: true, tenantId: true } });
    deliveryCursor = deliveries.at(-1)?.id;
    for (const delivery of deliveries) await enqueueNotificationDelivery(queue, delivery.tenantId, delivery.id);
  }
  const poll = () => {
    if (stopped || running) return;
    running = tick().catch(deps.onError).finally(() => { running = null; });
  };
  const timer = setInterval(poll, 5000);
  poll();
  return { close: async () => {
    stopped = true; clearInterval(timer); await running; await worker.close(); await queue.close();
  } };
}

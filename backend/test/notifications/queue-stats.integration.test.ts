import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { getPrisma } from '../../src/db/client';
import { collectQueueStats } from '../../src/worker/queue-stats';
import { QueueHealthSnapshotSchema, type QueueHealthSnapshot } from '../../src/contracts';

const db = getPrisma();
const slug = `qstats-${randomUUID().slice(0, 8)}`;
const now = () => new Date();
let tenantId: string;
let eventId: string;

beforeAll(async () => {
  const tenant = await db.tenant.create({ data: { slug, legalName: 'Synthetic Queue Stats', displayName: 'Synthetic',
    status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: 'support@example.invalid' } });
  tenantId = tenant.id;
  const event = await db.outboxEvent.create({ data: { tenantId, eventType: 'VISIT_NEEDS_REVIEW',
    aggregateId: tenantId, payloadMinimal: {}, createdAt: new Date(Date.now() - 60_000) } });
  eventId = event.id;
  await db.emailDelivery.create({ data: { tenantId, eventId, status: 'PENDING' } });
  await db.notificationDelivery.create({ data: { tenantId, eventId, principalType: 'AGENCY_STAFF',
    recipientPrincipalId: tenantId, eventType: 'VISIT_NEEDS_REVIEW', channel: 'EMAIL', status: 'PENDING',
    createdAt: new Date(Date.now() - 45_000) } });
});

afterAll(async () => {
  if (!tenantId) return;
  await db.emailDelivery.deleteMany({ where: { tenantId } });
  await db.notificationDelivery.deleteMany({ where: { tenantId } });
  await db.outboxEvent.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
});

it('collects aggregate counts-only queue statistics from real tables', async () => {
  const snapshot: QueueHealthSnapshot = await collectQueueStats({
    db,
    now,
    queueCounts: async () => [
      { name: 'raak-request-email', counts: { waiting: 2, active: 0, completed: 7, failed: 1, delayed: 0 } },
    ],
  });
  expect(() => QueueHealthSnapshotSchema.parse(snapshot)).not.toThrow();
  expect(snapshot.data.status).toBe('ok');
  expect(snapshot.data.service).toBe('worker');
  expect(snapshot.data.queues.emailDeliveries.pending).toBeGreaterThanOrEqual(1);
  expect(snapshot.data.queues.notificationDeliveries.pending).toBeGreaterThanOrEqual(1);
  expect(snapshot.data.queues.outbox.unprocessed).toBeGreaterThanOrEqual(1);
  expect(snapshot.data.queues.emailDeliveries.oldestPendingSeconds).toBeGreaterThanOrEqual(30);
  expect(snapshot.data.queues.notificationDeliveries.oldestPendingSeconds).toBeGreaterThanOrEqual(30);
  expect(snapshot.data.queues.outbox.oldestUnprocessedSeconds).toBeGreaterThanOrEqual(30);
  expect(snapshot.data.queues.bullmq['raak-request-email']).toEqual({
    waiting: 2, active: 0, completed: 7, failed: 1, delayed: 0,
  });
  const serialized = JSON.stringify(snapshot);
  expect(serialized).not.toContain(slug);
  expect(serialized).not.toContain(eventId);
});

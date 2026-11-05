import type { DatabaseClient } from '../db/client';
import type { QueueDepthCounts, QueueHealthSnapshot } from '../contracts';

export interface QueueCountEntry {
  name: string;
  counts: Record<string, number>;
}

export interface QueueStatsDeps {
  db: DatabaseClient;
  queueCounts(): Promise<QueueCountEntry[]>;
  now(): Date;
}

function secondsSince(from: Date | null, now: Date): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
}

function depthCounts(grouped: Array<{ status: string; _count: { _all: number } }>): QueueDepthCounts {
  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  return {
    pending: byStatus.get('PENDING') ?? 0,
    sending: byStatus.get('SENDING') ?? 0,
    failed: byStatus.get('FAILED') ?? 0,
  };
}

/**
 * Aggregate, counts-only snapshot of durable delivery backlogs and BullMQ job
 * counts for the worker monitoring hook (docs 08). No tenant, recipient or
 * payload identifiers are included; concurrent workers may observe slightly
 * different totals for the same instant.
 */
export async function collectQueueStats(deps: QueueStatsDeps): Promise<QueueHealthSnapshot> {
  const now = deps.now();
  const [emailGroups, notificationGroups, emailOldest, notificationOldest, outboxAgg, bullmq] =
    await Promise.all([
      deps.db.emailDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
      deps.db.notificationDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
      deps.db.outboxEvent.aggregate({
        _min: { createdAt: true },
        where: { deliveries: { some: { status: 'PENDING' } } },
      }),
      deps.db.notificationDelivery.aggregate({
        _min: { createdAt: true },
        where: { status: 'PENDING' },
      }),
      deps.db.outboxEvent.aggregate({
        _count: { _all: true },
        _min: { createdAt: true },
        where: { processedAt: null },
      }),
      deps.queueCounts(),
    ]);
  return {
    data: {
      status: 'ok',
      service: 'worker',
      queues: {
        emailDeliveries: {
          ...depthCounts(emailGroups),
          oldestPendingSeconds: secondsSince(emailOldest._min.createdAt, now),
        },
        notificationDeliveries: {
          ...depthCounts(notificationGroups),
          oldestPendingSeconds: secondsSince(notificationOldest._min.createdAt, now),
        },
        outbox: {
          unprocessed: outboxAgg._count._all,
          oldestUnprocessedSeconds: secondsSince(outboxAgg._min.createdAt, now),
        },
        bullmq: Object.fromEntries(bullmq.map((entry) => [entry.name, entry.counts])),
      },
      time: now.toISOString(),
    },
  };
}

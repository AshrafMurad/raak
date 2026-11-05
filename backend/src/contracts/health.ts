import { z } from 'zod';

/** Health endpoints (docs 08 — liveness and readiness for api/web/worker). */
export const ComponentStatusSchema = z.enum(['UP', 'DOWN', 'DEGRADED']);
export type ComponentStatus = z.infer<typeof ComponentStatusSchema>;

export const HealthLiveSchema = z.object({
  data: z.object({
    status: z.literal('ok'),
    service: z.string(),
    time: z.string().datetime(),
  }),
});
export type HealthLive = z.infer<typeof HealthLiveSchema>;

export const HealthReadySchema = z.object({
  data: z.object({
    status: z.enum(['ready', 'not_ready']),
    service: z.string(),
    components: z.record(z.string(), ComponentStatusSchema),
    time: z.string().datetime(),
  }),
});
export type HealthReady = z.infer<typeof HealthReadySchema>;

/** Aggregate delivery/backlog counts for the worker monitoring hook (docs 08). Counts only — no tenant or PHI fields. */
export const QueueDepthCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  sending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type QueueDepthCounts = z.infer<typeof QueueDepthCountsSchema>;

export const QueueHealthSnapshotSchema = z.object({
  data: z.object({
    status: z.literal('ok'),
    service: z.literal('worker'),
    queues: z.object({
      emailDeliveries: QueueDepthCountsSchema.extend({
        oldestPendingSeconds: z.number().int().nonnegative(),
      }),
      notificationDeliveries: QueueDepthCountsSchema.extend({
        oldestPendingSeconds: z.number().int().nonnegative(),
      }),
      outbox: z.object({
        unprocessed: z.number().int().nonnegative(),
        oldestUnprocessedSeconds: z.number().int().nonnegative(),
      }),
      bullmq: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())),
    }),
    time: z.string().datetime(),
  }),
});
export type QueueHealthSnapshot = z.infer<typeof QueueHealthSnapshotSchema>;

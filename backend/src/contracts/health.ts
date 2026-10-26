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

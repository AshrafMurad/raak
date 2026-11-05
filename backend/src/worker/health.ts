import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HealthLive, HealthReady, QueueHealthSnapshot } from '../contracts';

export interface WorkerHealthDeps {
  /** Redis connectivity probe; must resolve 'PONG' or reject. */
  ping(): Promise<string>;
  now(): Date;
  /** Optional aggregate queue-depth/failed-job collector for GET /health/queues. */
  queues?(): Promise<QueueHealthSnapshot>;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Liveness + readiness + queue-monitoring HTTP handler for the worker process (docs 08). */
export function workerHealthHandler(deps: WorkerHealthDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? '/';
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 404, { error: { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found.' } });
      return;
    }
    if (url === '/health/live') {
      const body: HealthLive = {
        data: { status: 'ok', service: 'worker', time: deps.now().toISOString() },
      };
      send(res, 200, body);
      return;
    }
    if (url === '/health/ready') {
      const redisUp = await deps
        .ping()
        .then((pong) => pong === 'PONG')
        .catch(() => false);
      const body: HealthReady = {
        data: {
          status: redisUp ? 'ready' : 'not_ready',
          service: 'worker',
          components: { redis: redisUp ? ('UP' as const) : ('DOWN' as const) },
          time: deps.now().toISOString(),
        },
      };
      send(res, redisUp ? 200 : 503, body);
      return;
    }
    if (url === '/health/queues') {
      if (!deps.queues) {
        send(res, 404, { error: { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found.' } });
        return;
      }
      const snapshot = await deps.queues().catch(() => null);
      if (!snapshot) {
        send(res, 503, {
          error: { code: 'QUEUE_STATS_UNAVAILABLE', message: 'Queue statistics are unavailable.' },
        });
        return;
      }
      send(res, 200, snapshot);
      return;
    }
    send(res, 404, { error: { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found.' } });
  };
}

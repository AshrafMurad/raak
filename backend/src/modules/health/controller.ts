import { Router, type Request, type Response } from 'express';
import type { HealthLive, HealthReady } from '../../contracts';
import type { HealthService } from './service';

export interface HealthControllerDeps {
  health: HealthService;
  now(): Date;
}

export function createHealthRouter(deps: HealthControllerDeps): Router {
  const router = Router();

  // Liveness: process is up; no dependency checks.
  router.get('/health/live', (_req: Request, res: Response) => {
    const body: HealthLive = {
      data: { status: 'ok', service: 'api', time: deps.now().toISOString() },
    };
    res.json(body);
  });

  // Readiness: database must be UP to serve traffic (Redis is not required by
  // the api process in Sprint 0; docs 08 allows core DB ops without Redis).
  router.get('/health/ready', async (_req: Request, res: Response) => {
    const dbUp = await deps.health.checkDatabase();
    const body: HealthReady = {
      data: {
        status: dbUp ? 'ready' : 'not_ready',
        service: 'api',
        components: { db: dbUp ? ('UP' as const) : ('DOWN' as const) },
        time: deps.now().toISOString(),
      },
    };
    res.status(dbUp ? 200 : 503).json(body);
  });

  return router;
}

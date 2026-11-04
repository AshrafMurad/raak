/**
 * Public agency registration route (docs 07 /agencies/register): tenant +
 * owner + verification email in one transaction; heavily rate limited.
 */
import { Router } from 'express';
import { RegisterAgencySchema, SchedulingSettingsSchema } from '../../contracts';
import type { DatabaseClient } from '../../db/client';
import { createAgencyService } from './agency.service';
import { createSchedulingSettingsService } from './scheduling-settings.service';
import { createRateLimiter } from '../auth/rate-limit';
import { asyncHandler, parseBody } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import type { RateLimits } from '../auth/auth.controller';

export interface AgencyControllerDeps {
  db: DatabaseClient;
  now(): Date;
  buildLink(kind: 'owner_verification', token: string): string;
  rateLimits?: Partial<RateLimits>;
  rateLimiter?: ReturnType<typeof createRateLimiter>;
}

export function createAgencyRouter(deps: AgencyControllerDeps): Router {
  const router = Router();
  const service = createAgencyService({ db: deps.db, now: deps.now, buildLink: deps.buildLink });
  const settings = createSchedulingSettingsService(deps.db, deps.now);
  const limiter = deps.rateLimiter ?? createRateLimiter();
  const registerPerHour = deps.rateLimits?.registerPerHour ?? 5;

  router.use('/agency/settings', requireSession(deps.db), requireCsrf(), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get(
    '/agency/settings',
    requirePermission('agency.settings.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await settings.read(req.auth!) });
    }),
  );
  router.patch(
    '/agency/settings',
    requirePermission('agency.settings.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await settings.update(req.auth!, parseBody(SchedulingSettingsSchema, req)),
      });
    }),
  );

  router.post(
    '/agencies/register',
    limiter({
      name: 'register',
      key: (req) => req.ip ?? 'unknown',
      limit: registerPerHour,
      windowMs: 60 * 60_000,
    }),
    asyncHandler(async (req, res) => {
      const dto = parseBody(RegisterAgencySchema, req);
      const result = await service.register(dto);
      res.status(201).json({ data: result });
    }),
  );

  return router;
}

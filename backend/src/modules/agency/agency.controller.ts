/**
 * Public agency registration route (docs 07 /agencies/register): tenant +
 * owner + verification email in one transaction; heavily rate limited.
 */
import { Router } from 'express';
import { RegisterAgencySchema } from '../../contracts';
import type { DatabaseClient } from '../../db/client';
import { createAgencyService } from './agency.service';
import { createRateLimiter } from '../auth/rate-limit';
import { asyncHandler, parseBody } from '../common/http';
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
  const limiter = deps.rateLimiter ?? createRateLimiter();
  const registerPerHour = deps.rateLimits?.registerPerHour ?? 5;

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

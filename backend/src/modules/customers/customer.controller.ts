import { Router, type Response } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import {
  ClaimLinkSchema,
  CustomerTokenSchema,
  RegisterCustomerSchema,
  ResendCustomerSchema,
} from '../../contracts/people';
import { asyncHandler, parseBody, portalOriginGuard } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import type { AcceptedRealm } from '../auth/host-resolver';
import { createRateLimiter } from '../auth/rate-limit';
import { createCustomerService } from './customer.service';

export function createCustomerRouter(
  db: DatabaseClient,
  now: () => Date,
  encryptionKey: string | undefined,
  origins: readonly string[],
) {
  const router = Router();
  const service = createCustomerService(db, now, encryptionKey);
  const tenant = (res: Response) => {
    const realm = res.locals.realm as AcceptedRealm;
    if (realm.kind !== 'AGENCY')
      throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
    return realm.tenant.tenantId;
  };
  const limit = createRateLimiter()({
    name: 'customer-onboarding',
    key: (req) => `${req.get('host')}:${req.ip}`,
    limit: 20,
    windowMs: 3600_000,
  });
  router.use('/portal/accounts', portalOriginGuard(origins), limit);
  router.post(
    '/portal/accounts/register',
    asyncHandler(async (req, res) => {
      await service.register(tenant(res), parseBody(RegisterCustomerSchema, req));
      res.status(202).json({ data: { acknowledged: true } });
    }),
  );
  router.post(
    '/portal/accounts/verify-email',
    asyncHandler(async (req, res) => {
      await service.verify(tenant(res), parseBody(CustomerTokenSchema, req).token);
      res.json({ data: { ok: true } });
    }),
  );
  router.post(
    '/portal/accounts/resend-verification',
    asyncHandler(async (req, res) => {
      const dto = parseBody(ResendCustomerSchema, req);
      await service.resend(tenant(res), dto.email, dto.locale);
      res.status(202).json({ data: { acknowledged: true } });
    }),
  );
  router.post(
    '/portal/accounts/claim-link',
    requireSession(db),
    requireCsrf(),
    requirePermission('customers.claim'),
    asyncHandler(async (req, res) => {
      const dto = parseBody(ClaimLinkSchema, req);
      await service.claimLink(req.auth!, dto.reference, dto.locale);
      res.status(202).json({ data: { acknowledged: true } });
    }),
  );
  router.post(
    '/portal/my/requests/:id/claim',
    portalOriginGuard(origins),
    limit,
    requireSession(db),
    requireCsrf(),
    requirePermission('customers.claim'),
    asyncHandler(async (req, res) => {
      const id = z.uuid().safeParse(req.params.id);
      if (!id.success) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
      res.json({
        data: await service.claim(req.auth!, id.data, parseBody(CustomerTokenSchema, req).token),
      });
    }),
  );
  return router;
}

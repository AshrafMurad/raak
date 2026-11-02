import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  AccessLinkSchema,
  ConsumeGuestSchema,
  GuestSubmissionSchema,
  VersionSchema,
} from '../../contracts/catalog';
import {
  RequestInfoSchema,
  RequestRespondSchema,
  RequestApproveSchema,
  RequestRejectSchema,
  RequestWithdrawSchema,
} from '../../contracts/quotes';
import { ApiError } from '../../api-error';
import { requireSession, requireCsrf, requirePermission } from '../auth/guards';
import type { AcceptedRealm } from '../auth/host-resolver';
import { createRateLimiter } from '../auth/rate-limit';
import { asyncHandler, parseBody, portalOriginGuard } from '../common/http';
import { missing } from '../catalog/catalog.repository';
import { createRequestingService } from './requesting.service';

export function createRequestingRouter(
  db: DatabaseClient,
  now: () => Date,
  encryptionKey?: string,
  allowedOrigins: readonly string[] = [],
) {
  const router = Router();
  const service = createRequestingService(db, now, encryptionKey);
  const limiter = createRateLimiter(now);
  const limit = limiter({
    name: 'guest',
    key: (req) => `${req.get('host')}:${req.ip}`,
    limit: 30,
    windowMs: 15 * 60_000,
  });
  const originGuard = portalOriginGuard(allowedOrigins);
  router.use(['/portal/requests', '/portal/my/requests', '/portal/my/quotes'], originGuard);
  const tenant = (realm: AcceptedRealm) => {
    if (realm.kind !== 'AGENCY') throw missing();
    return realm.tenant.tenantId;
  };
  const uuid = (id: unknown) => {
    const p = z.uuid().safeParse(id);
    if (!p.success) throw missing();
    return p.data;
  };
  router.post(
    '/portal/requests',
    limit,
    asyncHandler(async (req, res) => {
      const key = z
        .string()
        .regex(/^[A-Za-z0-9_-]{16,128}$/)
        .safeParse(req.get('Idempotency-Key'));
      if (!key.success) throw new ApiError(422, 'VALIDATION_FAILED', 'Submission key required.');
      res.status(201).json({
        data: await service.submit(
          tenant(res.locals.realm as AcceptedRealm),
          parseBody(GuestSubmissionSchema, req),
          key.data,
        ),
      });
    }),
  );
  router.post(
    '/portal/requests/access-link',
    limit,
    asyncHandler(async (req, res) => {
      await service.accessLink(
        tenant(res.locals.realm as AcceptedRealm),
        parseBody(AccessLinkSchema, req),
      );
      res.status(202).json({ data: { acknowledged: true } });
    }),
  );
  router.post(
    '/portal/requests/access-link/consume',
    limit,
    asyncHandler(async (req, res) => {
      const result = await service.consume(
        tenant(res.locals.realm as AcceptedRealm),
        parseBody(ConsumeGuestSchema, req).token,
      );
      res.cookie('raak_guest', result.sessionToken, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 30 * 60_000,
      });
      res.json({ data: { requestId: result.requestId } });
    }),
  );
  router.get(
    ['/portal/my/requests', '/portal/my/requests/:id'],
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.portalRead(
          tenant(res.locals.realm as AcceptedRealm),
          req,
          req.params.id ? uuid(req.params.id) : undefined,
        ),
      });
    }),
  );
  const guards = [requireSession(db), requireCsrf(), requirePermission('requests.review')];
  router.get(
    '/agency/requests',
    ...guards,
    asyncHandler(async (req, res) => {
      const cursor = req.query.cursor ? uuid(req.query.cursor) : undefined;
      const status = req.query.status
        ? z
            .enum([
              'SUBMITTED',
              'UNDER_REVIEW',
              'AWAITING_CUSTOMER',
              'APPROVED',
              'REJECTED',
              'WITHDRAWN',
            ])
            .safeParse(req.query.status)
        : undefined;
      if (status && !status.success)
        throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid filter.');
      res.json({ data: await service.queue(req.auth!, cursor, status?.data) });
    }),
  );
  router.get(
    '/agency/requests/:id',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({ data: await service.detail(req.auth!, uuid(req.params.id)) });
    }),
  );
  router.post(
    '/agency/requests/:id/start-review',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.startReview(
          req.auth!,
          uuid(req.params.id),
          parseBody(VersionSchema, req).expectedVersion,
        ),
      });
    }),
  );
  router.post(
    '/agency/requests/:id/request-info',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.requestInfo(
          req.auth!,
          uuid(req.params.id),
          parseBody(RequestInfoSchema, req),
        ),
      });
    }),
  );
  router.post(
    '/agency/requests/:id/approve',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.approve(
          req.auth!,
          uuid(req.params.id),
          parseBody(RequestApproveSchema, req),
        ),
      });
    }),
  );
  router.post(
    '/agency/requests/:id/reject',
    ...guards,
    asyncHandler(async (req, res) => {
      const body = parseBody(RequestRejectSchema, req);
      res.json({
        data: await service.reject(
          req.auth!,
          uuid(req.params.id),
          body.expectedVersion,
          body.reason,
        ),
      });
    }),
  );
  router.post(
    '/portal/my/requests/:id/respond',
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.respond(
          tenant(res.locals.realm as AcceptedRealm),
          req,
          uuid(req.params.id),
          parseBody(RequestRespondSchema, req).note,
        ),
      });
    }),
  );
  router.post(
    '/portal/my/requests/:id/withdraw',
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.withdraw(
          tenant(res.locals.realm as AcceptedRealm),
          req,
          uuid(req.params.id),
          parseBody(RequestWithdrawSchema, req).reason,
        ),
      });
    }),
  );
  router.get(
    '/notifications',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({ data: await service.notifications(req.auth!) });
    }),
  );
  return router;
}

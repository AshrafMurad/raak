import { Router, type Request } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  ChangeRequestApproveSchema,
  ChangeRequestCreateSchema,
  ChangeRequestQueueQuerySchema,
  ChangeRequestRejectSchema,
  ChangeRequestWithdrawSchema,
  CustomerVisitQuerySchema,
} from '../../contracts/visits';
import { asyncHandler, idempotencyKey, parseBody } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import { missing } from '../common/agency-action';
import { createChangeRequestService } from './change-request.service';

export function createChangeRequestRouter(db: DatabaseClient, now: () => Date) {
  const router = Router();
  const service = createChangeRequestService(db, now);
  const id = (req: Request) => {
    const value = z.uuid().safeParse(req.params.id);
    if (!value.success) throw missing();
    return value.data;
  };
  router.use(
    ['/portal/my/visits', '/portal/my/visit-change-requests', '/agency/visit-change-requests'],
    requireSession(db),
    requireCsrf(),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  router.get(
    '/portal/my/visits',
    requirePermission('visits.customer_change'),
    asyncHandler(async (req, res) => {
      const query = CustomerVisitQuerySchema.safeParse(req.query);
      if (!query.success) throw missing();
      res.json({ data: await service.customerVisits(req.auth!, query.data) });
    }),
  );
  router.get(
    '/portal/my/visits/:id',
    requirePermission('visits.customer_change'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.customerVisitDetail(req.auth!, id(req)) });
    }),
  );
  router.post(
    '/portal/my/visits/:id/change-requests',
    requirePermission('visits.customer_change'),
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await service.submit(req.auth!, id(req), parseBody(ChangeRequestCreateSchema, req)),
      });
    }),
  );
  router.post(
    '/portal/my/visit-change-requests/:id/withdraw',
    requirePermission('visits.customer_change'),
    asyncHandler(async (req, res) => {
      parseBody(ChangeRequestWithdrawSchema, req);
      res.json({ data: await service.withdraw(req.auth!, id(req)) });
    }),
  );
  router.get(
    '/agency/visit-change-requests',
    requirePermission('scheduling.manage'),
    asyncHandler(async (req, res) => {
      const query = ChangeRequestQueueQuerySchema.safeParse(req.query);
      if (!query.success) throw missing();
      res.json({ data: await service.queue(req.auth!, query.data) });
    }),
  );
  router.post(
    '/agency/visit-change-requests/:id/approve',
    requirePermission('scheduling.manage'),
    asyncHandler(async (req, res) => {
      parseBody(ChangeRequestApproveSchema, req);
      res.json({
        data: await service.approve(req.auth!, id(req), idempotencyKey(req)),
      });
    }),
  );
  router.post(
    '/agency/visit-change-requests/:id/reject',
    requirePermission('scheduling.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.reject(
          req.auth!,
          id(req),
          parseBody(ChangeRequestRejectSchema, req).reason,
          idempotencyKey(req),
        ),
      });
    }),
  );
  return router;
}

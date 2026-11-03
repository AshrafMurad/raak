import { Router, type Request } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  ActivateCarePlanSchema,
  ApproveClinicalSchema,
  CarePlanCreateBodySchema,
  CarePlanDraftEditSchema,
  CarePlanReviseSchema,
  CancelCarePlanSchema,
  CompleteCarePlanSchema,
  PauseCarePlanSchema,
} from '../../contracts/careplans';
import { asyncHandler, idempotencyKey, parseBody } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import { missing } from '../common/agency-action';
import { createCarePlanService } from './care-plan.service';
import type { CarePlanService } from './care-plan.types';

const statusFilter = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional();

export function createCarePlanRouter(db: DatabaseClient, now: () => Date) {
  const router = Router();
  const service: CarePlanService = createCarePlanService(db, now);
  const id = (req: Request) => {
    const value = z.uuid().safeParse(req.params.id);
    if (!value.success) throw missing();
    return value.data;
  };
  router.use(
    ['/agency/care-plans', '/agency/patients'],
    requireSession(db),
    requireCsrf(),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  router.get(
    '/agency/care-plans',
    requirePermission('careplans.read'),
    asyncHandler(async (req, res) => {
      const query = z
        .strictObject({
          patientId: z.uuid().optional(),
          status: statusFilter,
          cursor: z.uuid().optional(),
        })
        .safeParse(req.query);
      if (!query.success) throw missing();
      res.json({ data: await service.list(req.auth!, query.data) });
    }),
  );
  router.post(
    '/agency/patients/:patientId/care-plans',
    requirePermission('careplans.manage'),
    asyncHandler(async (req, res) => {
      const patientId = z.uuid().safeParse(req.params.patientId);
      if (!patientId.success) throw missing();
      const body = parseBody(CarePlanCreateBodySchema, req);
      res.status(201).json({
        data: await service.create(req.auth!, { ...body, patientId: patientId.data }),
      });
    }),
  );
  router.get(
    '/agency/care-plans/:id',
    requirePermission('careplans.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.detail(req.auth!, id(req)) });
    }),
  );
  router.patch(
    '/agency/care-plans/:id/draft',
    requirePermission('careplans.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.editDraft(req.auth!, id(req), parseBody(CarePlanDraftEditSchema, req)),
      });
    }),
  );
  router.post(
    '/agency/care-plans/:id/approve-clinical',
    requirePermission('careplans.clinical_approve'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.approveClinical(
          req.auth!,
          id(req),
          parseBody(ApproveClinicalSchema, req),
        ),
      });
    }),
  );
  router.get(
    '/agency/care-plans/:id/generation-preview',
    requirePermission('careplans.read'),
    asyncHandler(async (req, res) => {
      const version = z.coerce.number().int().positive().optional().safeParse(req.query.version);
      if (!version.success) throw missing();
      res.json({ data: await service.preview(req.auth!, id(req), version.data) });
    }),
  );
  router.post(
    '/agency/care-plans/:id/activate',
    requirePermission('careplans.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.activate(
          req.auth!,
          id(req),
          parseBody(ActivateCarePlanSchema, req),
          idempotencyKey(req),
        ),
      });
    }),
  );
  router.post(
    '/agency/care-plans/:id/revise',
    requirePermission('careplans.manage'),
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await service.revise(req.auth!, id(req), parseBody(CarePlanReviseSchema, req)),
      });
    }),
  );
  router.post(
    '/agency/care-plans/:id/pause',
    requirePermission('careplans.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.pause(req.auth!, id(req), parseBody(PauseCarePlanSchema, req)),
      });
    }),
  );
  router.post(
    '/agency/care-plans/:id/resume',
    requirePermission('careplans.manage'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.resume(req.auth!, id(req)) });
    }),
  );
  router.post(
    '/agency/care-plans/:id/complete',
    requirePermission('careplans.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.complete(req.auth!, id(req), parseBody(CompleteCarePlanSchema, req)),
      });
    }),
  );
  router.post(
    '/agency/care-plans/:id/cancel',
    requirePermission('careplans.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.cancel(req.auth!, id(req), parseBody(CancelCarePlanSchema, req)),
      });
    }),
  );
  return router;
}

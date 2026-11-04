import { Router, type Request } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  CaregiverVisitQuerySchema,
  CompleteVisitSchema,
  ReviewVisitSchema,
  VisitCorrectionSchema,
  VisitNoteDraftSchema,
  VisitTaskUpdateSchema,
} from '../../contracts/visits';
import { asyncHandler, idempotencyKey, parseBody } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import { missing } from '../common/agency-action';
import { createVisitExecutionService } from './visit-execution.service';
import { createVisitReviewService } from './visit-review.service';

export function createVisitsRouter(db: DatabaseClient, now: () => Date) {
  const router = Router();
  const execution = createVisitExecutionService(db, now);
  const review = createVisitReviewService(db, now);
  const id = (req: Request) => {
    const value = z.uuid().safeParse(req.params.id);
    if (!value.success) throw missing();
    return value.data;
  };
  const taskId = (req: Request) => {
    const value = z.uuid().safeParse(req.params.taskId);
    if (!value.success) throw missing();
    return value.data;
  };
  router.use(
    ['/caregiver/my/visits', '/agency/visits'],
    requireSession(db),
    requireCsrf(),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  router.get(
    '/caregiver/my/visits',
    requirePermission('visits.self_execute'),
    asyncHandler(async (req, res) => {
      const query = CaregiverVisitQuerySchema.safeParse(req.query);
      if (!query.success) throw missing();
      res.json({ data: await execution.list(req.auth!, query.data) });
    }),
  );
  router.get(
    '/caregiver/my/visits/:id',
    requirePermission('visits.self_execute'),
    asyncHandler(async (req, res) => {
      res.json({ data: await execution.detail(req.auth!, id(req)) });
    }),
  );
  router.post(
    '/caregiver/my/visits/:id/start',
    requirePermission('visits.self_execute'),
    asyncHandler(async (req, res) => {
      parseBody(z.strictObject({}), req);
      res.json({ data: await execution.start(req.auth!, id(req)) });
    }),
  );
  router.put(
    '/caregiver/my/visits/:id/tasks/:taskId',
    requirePermission('visits.self_execute'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await execution.updateTask(
          req.auth!,
          id(req),
          taskId(req),
          parseBody(VisitTaskUpdateSchema, req),
        ),
      });
    }),
  );
  router.put(
    '/caregiver/my/visits/:id/note',
    requirePermission('visits.self_execute'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await execution.saveNote(req.auth!, id(req), parseBody(VisitNoteDraftSchema, req)),
      });
    }),
  );
  router.post(
    '/caregiver/my/visits/:id/complete',
    requirePermission('visits.self_execute'),
    asyncHandler(async (req, res) => {
      parseBody(CompleteVisitSchema, req);
      res.json({
        data: await execution.complete(req.auth!, id(req), idempotencyKey(req)),
      });
    }),
  );
  router.get(
    '/agency/visits/:id/notes',
    requirePermission('visits.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await review.detail(req.auth!, id(req)) });
    }),
  );
  router.post(
    '/agency/visits/:id/review',
    requirePermission('visits.review'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await review.review(req.auth!, id(req), parseBody(ReviewVisitSchema, req)),
      });
    }),
  );
  router.post(
    '/agency/visits/:id/corrections',
    requirePermission('visits.review'),
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await review.correction(req.auth!, id(req), parseBody(VisitCorrectionSchema, req)),
      });
    }),
  );
  return router;
}

import { Router, type Request } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  AssignVisitSchema,
  BulkAssignSchema,
  ReassignVisitSchema,
  VisitListQuerySchema,
} from '../../contracts/careplans';
import { asyncHandler, idempotencyKey, parseBody } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import { missing } from '../common/agency-action';
import { createAssignmentService } from './assignment.service';
import { createCandidateService } from './candidate.service';
import { createVisitQueries } from './visit.queries';

export function createSchedulingRouter(db: DatabaseClient, now: () => Date) {
  const router = Router();
  const assignment = createAssignmentService(db, now);
  const visits = createVisitQueries(db);
  const candidates = createCandidateService(db);
  const id = (req: Request) => {
    const value = z.uuid().safeParse(req.params.id);
    if (!value.success) throw missing();
    return value.data;
  };
  router.use(['/agency/visits'], requireSession(db), requireCsrf(), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get(
    '/agency/visits',
    requirePermission('visits.read'),
    asyncHandler(async (req, res) => {
      const query = VisitListQuerySchema.safeParse(req.query);
      if (!query.success) throw missing();
      res.json({ data: await visits.visitList(req.auth!, query.data) });
    }),
  );
  router.post(
    '/agency/visits/bulk-assign',
    requirePermission('scheduling.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await assignment.bulkAssign(
          req.auth!,
          parseBody(BulkAssignSchema, req),
          idempotencyKey(req),
        ),
      });
    }),
  );
  router.get(
    '/agency/visits/:id',
    requirePermission('visits.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await visits.visitDetail(req.auth!, id(req)) });
    }),
  );
  router.post(
    '/agency/visits/:id/candidates',
    requirePermission('scheduling.manage'),
    asyncHandler(async (req, res) => {
      parseBody(z.strictObject({}), req);
      res.json({ data: await candidates.candidates(req.auth!, id(req)) });
    }),
  );
  router.post(
    '/agency/visits/:id/assign',
    requirePermission('scheduling.manage'),
    asyncHandler(async (req, res) => {
      const body = parseBody(AssignVisitSchema, req);
      res.json({
        data: await assignment.assign(
          req.auth!,
          { ...body, visitId: id(req) },
          idempotencyKey(req),
        ),
      });
    }),
  );
  router.post(
    '/agency/visits/:id/reassign',
    requirePermission('scheduling.manage'),
    asyncHandler(async (req, res) => {
      const body = parseBody(ReassignVisitSchema, req);
      res.json({
        data: await assignment.reassign(req.auth!, { ...body, visitId: id(req) }),
      });
    }),
  );
  return router;
}

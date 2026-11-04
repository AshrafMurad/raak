/**
 * Reports and agency audit routes (docs 07 Session 4). GET-only: every route
 * sits behind host-realm + session + central authorize and re-checks policy at
 * the service boundary; responses are no-store. Query DTOs are strict, so
 * crafted cross-tenant parameters fail validation instead of widening scope.
 */
import { Router } from 'express';
import { ApiError } from '../../api-error';
import type { DatabaseClient } from '../../db/client';
import {
  AgencyAuditQuerySchema,
  CaregiversReportQuerySchema,
  RequestsReportQuerySchema,
  VisitsReportQuerySchema,
} from '../../contracts/reports';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import { asyncHandler } from '../common/http';
import { createAuditService } from './audit.service';
import { createReportsService } from './reports.service';

export function createReportingRouter(db: DatabaseClient) {
  const router = Router();
  const reports = createReportsService(db);
  const audit = createAuditService(db);
  router.use(
    [
      '/agency/reports/requests',
      '/agency/reports/visits',
      '/agency/reports/caregivers',
      '/agency/audit',
    ],
    requireSession(db),
    requireCsrf(),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  router.get(
    '/agency/reports/requests',
    requirePermission('reports.read'),
    asyncHandler(async (req, res) => {
      const query = RequestsReportQuerySchema.safeParse(req.query);
      if (!query.success) throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid report filters.');
      res.json({ data: await reports.requests(req.auth!, query.data) });
    }),
  );
  router.get(
    '/agency/reports/visits',
    requirePermission('reports.read'),
    asyncHandler(async (req, res) => {
      const query = VisitsReportQuerySchema.safeParse(req.query);
      if (!query.success) throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid report filters.');
      res.json({ data: await reports.visits(req.auth!, query.data) });
    }),
  );
  router.get(
    '/agency/reports/caregivers',
    requirePermission('reports.read'),
    asyncHandler(async (req, res) => {
      const query = CaregiversReportQuerySchema.safeParse(req.query);
      if (!query.success) throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid report filters.');
      res.json({ data: await reports.caregivers(req.auth!, query.data) });
    }),
  );
  router.get(
    '/agency/audit',
    requirePermission('agency.audit.read'),
    asyncHandler(async (req, res) => {
      const query = AgencyAuditQuerySchema.safeParse(req.query);
      if (!query.success) throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid audit filters.');
      res.json({ data: await audit.list(req.auth!, query.data) });
    }),
  );
  return router;
}

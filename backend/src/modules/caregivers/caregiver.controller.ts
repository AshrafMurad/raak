import { Router, type Request } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  AvailabilitySchema,
  CaregiverOperationalSchema,
  EditCaregiverSchema,
  EligibilitySchema,
  ExceptionSchema,
  QualificationSchema,
  ServiceAuthorizationSchema,
  VerifyQualificationSchema,
} from '../../contracts/caregivers';
import { asyncHandler, parseBody } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import { missing } from '../common/agency-action';
import { createCaregiverService } from './caregiver.service';
import { createAvailabilityService } from './availability.service';

export function createCaregiverRouter(db: DatabaseClient, now: () => Date) {
  const router = Router();
  const service = createCaregiverService(db, now);
  const availability = createAvailabilityService(db, now);
  const id = (req: Request) => {
    const value = z.uuid().safeParse(req.params.id);
    if (!value.success) throw missing();
    return value.data;
  };
  router.use(
    ['/agency/caregivers', '/agency/qualifications', '/caregiver/my/profile'],
    requireSession(db),
    requireCsrf(),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  router.get(
    '/agency/caregivers',
    requirePermission('caregivers.read'),
    asyncHandler(async (req, res) => {
      const cursor = z.uuid().optional().safeParse(req.query.cursor);
      if (!cursor.success) throw missing();
      res.json({ data: await service.list(req.auth!, cursor.data) });
    }),
  );
  router.post(
    '/agency/caregivers',
    requirePermission('caregivers.manage'),
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await service.create(req.auth!, parseBody(CaregiverOperationalSchema, req)),
      });
    }),
  );
  router.get(
    '/agency/caregivers/:id',
    requirePermission('caregivers.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.detail(req.auth!, id(req)) });
    }),
  );
  router.get(
    '/caregiver/my/profile',
    requirePermission('caregivers.self_read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.detail(req.auth!) });
    }),
  );
  router.patch(
    '/agency/caregivers/:id',
    requirePermission('caregivers.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.edit(req.auth!, id(req), parseBody(EditCaregiverSchema, req)),
      });
    }),
  );
  router.post(
    '/agency/caregivers/:id/qualifications',
    requirePermission('caregivers.manage'),
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await service.qualification(req.auth!, id(req), parseBody(QualificationSchema, req)),
      });
    }),
  );
  router.post(
    '/agency/qualifications/:id/verify',
    requirePermission('caregivers.verify'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.verify(req.auth!, id(req), parseBody(VerifyQualificationSchema, req)),
      });
    }),
  );
  router.put(
    '/agency/caregivers/:id/service-authorizations',
    requirePermission('caregivers.verify'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.authorizeServices(
          req.auth!,
          id(req),
          parseBody(ServiceAuthorizationSchema, req),
        ),
      });
    }),
  );
  router.put(
    '/agency/caregivers/:id/availability',
    requirePermission('caregivers.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await availability.replace(req.auth!, id(req), parseBody(AvailabilitySchema, req)),
      });
    }),
  );
  router.post(
    '/agency/caregivers/:id/exceptions',
    requirePermission('caregivers.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await availability.exception(req.auth!, id(req), parseBody(ExceptionSchema, req)),
      });
    }),
  );
  router.post(
    '/agency/caregivers/:id/eligibility',
    requirePermission('caregivers.read'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.eligibility(req.auth!, id(req), parseBody(EligibilitySchema, req)),
      });
    }),
  );
  return router;
}

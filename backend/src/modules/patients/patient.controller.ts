import { Router, type Request } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  CreatePatientSchema,
  CreateRequestPatientSchema,
  EditPatientSchema,
  GrantSchema,
  LinkPatientSchema,
  PatientProfileSchema,
  RevokeGrantSchema,
} from '../../contracts/people';
import { asyncHandler, parseBody } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import { missing } from '../common/agency-action';
import { createPatientService } from './patient.service';
import { createPatientAccessService } from './patient-access.service';

export function createPatientRouter(db: DatabaseClient, now: () => Date) {
  const router = Router();
  const service = createPatientService(db, now);
  const access = createPatientAccessService(db, now);
  const id = (req: Request) => {
    const parsed = z.uuid().safeParse(req.params.id);
    if (!parsed.success) throw missing();
    return parsed.data;
  };
  const cursor = (req: Request) => {
    const parsed = z.uuid().optional().safeParse(req.query.cursor);
    if (!parsed.success) throw missing();
    return parsed.data;
  };
  router.use(
    ['/agency/patients', '/agency/patient-access', '/portal/my/patients'],
    requireSession(db),
    requireCsrf(),
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  router.get(
    '/agency/patients',
    requirePermission('patients.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.list(req.auth!, cursor(req)) });
    }),
  );
  router.post(
    '/agency/patients/duplicates/check',
    requirePermission('patients.manage'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.duplicates(req.auth!, parseBody(PatientProfileSchema, req)) });
    }),
  );
  router.post(
    '/agency/patients',
    requirePermission('patients.manage'),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json({ data: await service.create(req.auth!, parseBody(CreatePatientSchema, req)) });
    }),
  );
  router.get(
    '/agency/patients/:id',
    requirePermission('patients.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.detail(req.auth!, id(req)) });
    }),
  );
  router.patch(
    '/agency/patients/:id',
    requirePermission('patients.manage'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.edit(req.auth!, id(req), parseBody(EditPatientSchema, req)) });
    }),
  );
  router.post(
    '/agency/requests/:id/create-patient',
    requireSession(db),
    requireCsrf(),
    requirePermission('patients.manage'),
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await service.createFromRequest(
          req.auth!,
          id(req),
          parseBody(CreateRequestPatientSchema, req),
        ),
      });
    }),
  );
  router.post(
    '/agency/requests/:id/link-patient',
    requireSession(db),
    requireCsrf(),
    requirePermission('patients.manage'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.link(req.auth!, id(req), parseBody(LinkPatientSchema, req)) });
    }),
  );
  router.get(
    '/agency/patients/:id/access-grants',
    requirePermission('patients.grants'),
    asyncHandler(async (req, res) => {
      res.json({ data: await access.list(req.auth!, id(req)) });
    }),
  );
  router.post(
    '/agency/customers/lookup',
    requireSession(db),
    requireCsrf(),
    requirePermission('patients.grants'),
    asyncHandler(async (req, res) => {
      const dto = parseBody(
        z.strictObject({
          email: z
            .email()
            .max(254)
            .transform((s) => s.toLowerCase()),
        }),
        req,
      );
      res.json({ data: await access.lookupCustomer(req.auth!, dto.email) });
    }),
  );
  router.post(
    '/agency/patients/:id/access-grants',
    requirePermission('patients.grants'),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json({ data: await access.issue(req.auth!, id(req), parseBody(GrantSchema, req)) });
    }),
  );
  router.post(
    '/agency/patient-access/:id/revoke',
    requirePermission('patients.grants'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await access.revoke(req.auth!, id(req), parseBody(RevokeGrantSchema, req).reason),
      });
    }),
  );
  router.get(
    '/portal/my/patients',
    requirePermission('patients.granted_read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await access.portal(req.auth!, undefined, cursor(req)) });
    }),
  );
  router.get(
    '/portal/my/patients/:id',
    requirePermission('patients.granted_read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await access.portal(req.auth!, id(req)) });
    }),
  );
  return router;
}

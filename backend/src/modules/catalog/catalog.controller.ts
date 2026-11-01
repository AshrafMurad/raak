import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  CreateServiceSchema,
  EditServiceSchema,
  EditBrandingSchema,
  VersionSchema,
} from '../../contracts/catalog';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import { asyncHandler, parseBody } from '../common/http';
import { createCatalogService } from './catalog.service';
import type { AcceptedRealm } from '../auth/host-resolver';
import { missing } from './catalog.repository';
import { ApiError } from '../../api-error';

export function createCatalogRouter(db: DatabaseClient) {
  const router = Router();
  const service = createCatalogService(db);
  const privateRoute = (action: Parameters<typeof requirePermission>[0]) => [
    requireSession(db),
    requireCsrf(),
    requirePermission(action),
  ];
  const id = (value: unknown) => {
    const parsed = z.uuid().safeParse(value);
    if (!parsed.success) throw missing();
    return parsed.data;
  };
  const page = (query: unknown) => {
    const p = z
      .object({
        cursor: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(query);
    if (!p.success) throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid pagination.');
    return p.data;
  };
  router.get(
    '/catalog/platform-templates',
    ...privateRoute('catalog.read'),
    asyncHandler(async (req, res) => {
      const p = page(req.query);
      res.json({ data: await service.templates(req.auth!, p.cursor, p.limit) });
    }),
  );
  router.get(
    '/agency/services',
    ...privateRoute('catalog.read'),
    asyncHandler(async (req, res) => {
      const p = page(req.query);
      res.json({ data: await service.list(req.auth!, p.cursor, p.limit) });
    }),
  );
  router.post(
    '/agency/services',
    ...privateRoute('catalog.draft'),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json({ data: await service.create(req.auth!, parseBody(CreateServiceSchema, req)) });
    }),
  );
  router.get(
    '/agency/services/:id',
    ...privateRoute('catalog.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.detail(req.auth!, id(req.params.id)) });
    }),
  );
  router.patch(
    '/agency/services/:id',
    ...privateRoute('catalog.draft'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.edit(req.auth!, id(req.params.id), parseBody(EditServiceSchema, req)),
      });
    }),
  );
  for (const [path, published] of [
    ['publish', true],
    ['unpublish', false],
  ] as const)
    router.post(
      `/agency/services/:id/${path}`,
      ...privateRoute('catalog.publish'),
      asyncHandler(async (req, res) => {
        res.json({
          data: await service.publish(
            req.auth!,
            id(req.params.id),
            parseBody(VersionSchema, req).expectedVersion,
            published,
          ),
        });
      }),
    );
  router.get(
    '/agency/branding',
    ...privateRoute('branding.manage'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.branding(req.auth!) });
    }),
  );
  router.patch(
    '/agency/branding',
    ...privateRoute('branding.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.updateBranding(req.auth!, parseBody(EditBrandingSchema, req)),
      });
    }),
  );
  router.get(
    ['/portal/services', '/portal/services/:slug'],
    asyncHandler(async (req, res) => {
      const realm = res.locals.realm as AcceptedRealm;
      if (realm.kind !== 'AGENCY') throw missing();
      const p = page(req.query);
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        data: await service.portal(
          realm.tenant.tenantId,
          typeof req.params.slug === 'string' ? req.params.slug : undefined,
          p.cursor,
          p.limit,
        ),
      });
    }),
  );
  return router;
}

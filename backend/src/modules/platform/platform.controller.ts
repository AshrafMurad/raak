/**
 * Platform-only tenant lifecycle routes (docs 07). The platform-host gate is
 * separate from session and permission checks so these endpoints are hidden
 * on agency hosts rather than merely role-denied.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { ActivateTenantSchema, SuspendTenantSchema } from '../../contracts';
import { errorEnvelope } from '../../contracts';
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import { asyncHandler, parseBody } from '../common/http';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import type { HostRealm } from '../auth/host-resolver';
import { createPlatformService } from './platform.service';

export interface PlatformControllerDeps {
  db: DatabaseClient;
  now(): Date;
}

const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.uuid().optional(),
  status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED']).optional(),
});

const idParamsSchema = z.strictObject({ tenantId: z.uuid() });

function requirePlatformRealm(req: Request, res: Response, next: NextFunction): void {
  const realm = res.locals.realm as HostRealm | undefined;
  if (realm?.kind !== 'PLATFORM') {
    res.status(404).json(
      errorEnvelope('RESOURCE_NOT_FOUND', 'Resource not found.', {
        requestId: res.locals.requestId as string | undefined,
      }),
    );
    return;
  }
  next();
}

function parseParams(req: Request): { tenantId: string } {
  const parsed = idParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    // Route identifiers are privacy boundaries: malformed and absent ids share
    // the same response as inaccessible resources.
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  return parsed.data;
}

export function createPlatformRouter(deps: PlatformControllerDeps): Router {
  const router = Router();
  const service = createPlatformService({ db: deps.db, now: deps.now });
  const readGuards = [
    requirePlatformRealm,
    requireSession(deps.db),
    requirePermission('platform.tenants.read'),
  ];

  router.get(
    '/platform/tenants',
    ...readGuards,
    asyncHandler(async (req, res) => {
      const query = listQuerySchema.safeParse(req.query);
      if (!query.success) {
        res.status(422).json(
          errorEnvelope('VALIDATION_FAILED', 'Query parameters failed validation.', {
            requestId: res.locals.requestId as string | undefined,
          }),
        );
        return;
      }
      res.json({ data: await service.listTenants(query.data) });
    }),
  );

  router.get(
    '/platform/tenants/:tenantId',
    ...readGuards,
    asyncHandler(async (req, res) => {
      const parsed = idParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        res.status(404).json(
          errorEnvelope('RESOURCE_NOT_FOUND', 'Resource not found.', {
            requestId: res.locals.requestId as string | undefined,
          }),
        );
        return;
      }
      res.json({ data: await service.getTenant(parsed.data.tenantId) });
    }),
  );

  router.post(
    '/platform/tenants/:tenantId/activate',
    requirePlatformRealm,
    requireSession(deps.db),
    requireCsrf(),
    requirePermission('platform.tenants.activate'),
    asyncHandler(async (req, res) => {
      const params = parseParams(req);
      const dto = parseBody(ActivateTenantSchema, req);
      res.json({ data: await service.activateTenant(req.auth!, params.tenantId, dto.reason) });
    }),
  );

  router.post(
    '/platform/tenants/:tenantId/suspend',
    requirePlatformRealm,
    requireSession(deps.db),
    requireCsrf(),
    requirePermission('platform.tenants.suspend'),
    asyncHandler(async (req, res) => {
      const params = parseParams(req);
      const dto = parseBody(SuspendTenantSchema, req);
      res.json({ data: await service.suspendTenant(req.auth!, params.tenantId, dto.reason) });
    }),
  );

  router.get(
    '/platform/audit',
    requirePlatformRealm,
    requireSession(deps.db),
    requirePermission('platform.audit.read'),
    asyncHandler(async (req, res) => {
      const query = listQuerySchema.omit({ status: true }).safeParse(req.query);
      if (!query.success) {
        res.status(422).json(
          errorEnvelope('VALIDATION_FAILED', 'Query parameters failed validation.', {
            requestId: res.locals.requestId as string | undefined,
          }),
        );
        return;
      }
      res.json({ data: await service.listAudit(query.data) });
    }),
  );

  return router;
}

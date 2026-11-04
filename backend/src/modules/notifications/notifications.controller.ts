import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import {
  DeliveryQuerySchema,
  NotificationPolicyPatchSchema,
  InboxQuerySchema,
  NotificationReadSchema,
  NotificationPreferencePatchSchema,
} from '../../contracts/notifications';
import { requireSession, requireCsrf, requirePermission } from '../auth/guards';
import { asyncHandler, parseBody } from '../common/http';
import { createNotificationService } from './notifications.service';
import { createInboxService } from './inbox.service';

function uuid(value: unknown) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  return parsed.data;
}

export function createNotificationRouter(db: DatabaseClient) {
  const router = Router();
  const service = createNotificationService(db);
  const inbox = createInboxService(db);
  for (const path of [
    '/agency/notification-policies',
    '/agency/notification-deliveries',
    '/notifications',
  ])
    router.use(path, requireSession(db), requireCsrf(), (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    });
  router.get(
    '/notifications',
    requirePermission('notifications.receive'),
    asyncHandler(async (req, res) => {
      const parsed = InboxQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid inbox filters.');
      res.json({ data: await inbox.list(req.auth!, parsed.data) });
    }),
  );
  router.get(
    '/notifications/unread-count',
    requirePermission('notifications.receive'),
    asyncHandler(async (req, res) => {
      res.json({ data: await inbox.count(req.auth!) });
    }),
  );
  router.get(
    '/notifications/preferences',
    requirePermission('notifications.receive'),
    asyncHandler(async (req, res) => {
      res.json({ data: await inbox.preferences(req.auth!) });
    }),
  );
  router.patch(
    '/notifications/preferences',
    requirePermission('notifications.receive'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await inbox.updatePreferences(
          req.auth!,
          parseBody(NotificationPreferencePatchSchema, req),
        ),
      });
    }),
  );
  router.post(
    '/notifications/:id/read',
    requirePermission('notifications.receive'),
    asyncHandler(async (req, res) => {
      parseBody(NotificationReadSchema, req);
      res.json({ data: await inbox.read(req.auth!, uuid(req.params.id)) });
    }),
  );
  router.get(
    '/notifications/:id/target',
    requirePermission('notifications.receive'),
    asyncHandler(async (req, res) => {
      res.json({ data: await inbox.target(req.auth!, uuid(req.params.id)) });
    }),
  );
  router.get(
    '/agency/notification-policies',
    requirePermission('notifications.policy.read'),
    asyncHandler(async (req, res) => {
      res.json({ data: await service.read(req.auth!) });
    }),
  );
  router.patch(
    '/agency/notification-policies',
    requirePermission('notifications.policy.manage'),
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.update(req.auth!, parseBody(NotificationPolicyPatchSchema, req)),
      });
    }),
  );
  router.get(
    '/agency/notification-deliveries',
    requirePermission('notifications.deliveries.read'),
    asyncHandler(async (req, res) => {
      const parsed = DeliveryQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid delivery filters.');
      res.json({ data: await service.deliveries(req.auth!, parsed.data) });
    }),
  );
  return router;
}

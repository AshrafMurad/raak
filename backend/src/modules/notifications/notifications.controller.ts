import { Router } from 'express';
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import { DeliveryQuerySchema, NotificationPolicyPatchSchema } from '../../contracts/notifications';
import { requireSession, requireCsrf, requirePermission } from '../auth/guards';
import { asyncHandler, parseBody } from '../common/http';
import { createNotificationService } from './notifications.service';

export function createNotificationRouter(db: DatabaseClient) {
  const router = Router();
  const service = createNotificationService(db);
  for (const path of ['/agency/notification-policies', '/agency/notification-deliveries'])
    router.use(path, requireSession(db), requireCsrf(), (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/agency/notification-policies', requirePermission('notifications.policy.read'), asyncHandler(async (req, res) => {
    res.json({ data: await service.read(req.auth!) });
  }));
  router.patch('/agency/notification-policies', requirePermission('notifications.policy.manage'), asyncHandler(async (req, res) => {
    res.json({ data: await service.update(req.auth!, parseBody(NotificationPolicyPatchSchema, req)) });
  }));
  router.get('/agency/notification-deliveries', requirePermission('notifications.deliveries.read'), asyncHandler(async (req, res) => {
    const parsed = DeliveryQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError(422, 'VALIDATION_FAILED', 'Invalid delivery filters.');
    res.json({ data: await service.deliveries(req.auth!, parsed.data) });
  }));
  return router;
}

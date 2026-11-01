/**
 * Staff invitation routes (docs 07): create is Owner/Admin (permission gate +
 * CSRF); accept is a public rate-limited token consumption that must be sent
 * from the invitation's tenant host (I06) — the server-resolved host realm is
 * passed into the service for binding validation.
 */
import { Router } from 'express';
import { CreateInvitationSchema, AcceptInvitationSchema } from '../../contracts';
import type { DatabaseClient } from '../../db/client';
import { createStaffService } from './staff.service';
import { requireCsrf, requirePermission, requireSession } from '../auth/guards';
import type { AcceptedRealm } from '../auth/host-resolver';
import { createRateLimiter } from '../auth/rate-limit';
import { asyncHandler, parseBody } from '../common/http';
import type { RateLimits } from '../auth/auth.controller';

export interface StaffControllerDeps {
  db: DatabaseClient;
  now(): Date;
  buildLink(kind: 'staff_invitation', token: string, context: { slug: string }): string;
  rateLimits?: Partial<RateLimits>;
}

export function createStaffRouter(deps: StaffControllerDeps): Router {
  const router = Router();
  const service = createStaffService({ db: deps.db, now: deps.now, buildLink: deps.buildLink });
  const limiter = createRateLimiter();
  const acceptPerHour = deps.rateLimits?.invitationAcceptPerHour ?? 30;

  router.post(
    '/staff/invitations',
    requireSession(deps.db),
    requireCsrf(),
    requirePermission('staff.invitations.create'),
    asyncHandler(async (req, res) => {
      const dto = parseBody(CreateInvitationSchema, req);
      const result = await service.createInvitation(req.auth!, dto);
      res.status(201).json({ data: result });
    }),
  );

  router.post(
    '/staff/invitations/accept',
    limiter({
      name: 'invitation-accept',
      key: (req) => req.ip ?? 'unknown',
      limit: acceptPerHour,
      windowMs: 60 * 60_000,
    }),
    asyncHandler(async (req, res) => {
      const dto = parseBody(AcceptInvitationSchema, req);
      const realm = res.locals.realm as AcceptedRealm;
      await service.acceptInvitation(dto, realm);
      res.json({ data: { ok: true } });
    }),
  );

  return router;
}

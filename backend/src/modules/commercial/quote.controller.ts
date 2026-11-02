import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import {
  QuoteDraftSchema,
  QuoteDraftEditSchema,
  QuoteSendSchema,
  QuoteActionSchema,
  QuoteRevisionRequestSchema,
  RevisionDeclineSchema,
  RevisionReplacementSchema,
} from '../../contracts/quotes';
import { requireSession, requireCsrf, requirePermission } from '../auth/guards';
import type { AcceptedRealm } from '../auth/host-resolver';
import { asyncHandler, parseBody, idempotencyKey, portalOriginGuard } from '../common/http';
import { missing } from '../catalog/catalog.repository';
import { createQuoteService } from './quote.service';

export function createQuoteRouter(
  db: DatabaseClient,
  now: () => Date,
  allowedOrigins: readonly string[] = [],
) {
  const router = Router();
  const service = createQuoteService(db, now);
  const tenantOf = (res: { locals: { realm?: unknown } }) => {
    const realm = res.locals.realm as AcceptedRealm | undefined;
    if (realm && realm.kind === 'AGENCY') return realm.tenant.tenantId;
    throw missing();
  };
  const uuid = (id: unknown) => {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw missing();
    return parsed.data;
  };
  router.use('/portal/my/quotes', portalOriginGuard(allowedOrigins));
  router.use('/portal/my/requests/:id/quotes', portalOriginGuard(allowedOrigins));

  const guards = [requireSession(db), requireCsrf(), requirePermission('quotes.manage')];
  router.post(
    '/agency/requests/:id/quotes',
    ...guards,
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await service.createDraft(
          req.auth!,
          uuid(req.params.id),
          parseBody(QuoteDraftSchema, req),
        ),
      });
    }),
  );
  router.get(
    '/agency/requests/:id/quotes',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({ data: await service.agencyList(req.auth!, uuid(req.params.id)) });
    }),
  );
  router.patch(
    '/agency/quotes/:id/draft',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.editDraft(
          req.auth!,
          uuid(req.params.id),
          parseBody(QuoteDraftEditSchema, req),
        ),
      });
    }),
  );
  router.post(
    '/agency/quotes/:id/send',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.send(req.auth!, uuid(req.params.id), parseBody(QuoteSendSchema, req)),
      });
    }),
  );
  router.get(
    '/agency/quotes/:id/revision-requests',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({ data: await service.listRevisions(req.auth!, uuid(req.params.id)) });
    }),
  );
  router.post(
    '/agency/quote-revisions/:id/decline',
    ...guards,
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.declineRevision(
          req.auth!,
          uuid(req.params.id),
          parseBody(RevisionDeclineSchema, req),
        ),
      });
    }),
  );
  router.post(
    '/agency/quote-revisions/:id/resolve-with-replacement',
    ...guards,
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await service.resolveWithReplacement(
          req.auth!,
          uuid(req.params.id),
          parseBody(RevisionReplacementSchema, req),
        ),
      });
    }),
  );

  router.get(
    '/portal/my/requests/:id/quotes',
    asyncHandler(async (req, res) => {
      res.json({ data: await service.portalList(tenantOf(res), req, uuid(req.params.id)) });
    }),
  );
  router.post(
    '/portal/my/quotes/:id/accept',
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.accept(
          tenantOf(res),
          req,
          uuid(req.params.id),
          parseBody(QuoteActionSchema, req),
          idempotencyKey(req),
        ),
      });
    }),
  );
  router.post(
    '/portal/my/quotes/:id/reject',
    asyncHandler(async (req, res) => {
      res.json({
        data: await service.reject(
          tenantOf(res),
          req,
          uuid(req.params.id),
          parseBody(QuoteActionSchema, req),
        ),
      });
    }),
  );
  router.post(
    '/portal/my/quotes/:id/revision-requests',
    asyncHandler(async (req, res) => {
      res.status(201).json({
        data: await service.requestRevision(
          tenantOf(res),
          req,
          uuid(req.params.id),
          parseBody(QuoteRevisionRequestSchema, req),
        ),
      });
    }),
  );
  return router;
}

import express, { Router, type Request } from 'express';
import { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { UploadIntentSchema, MAX_DOCUMENT_BYTES } from '../../contracts/documents';
import { asyncHandler, parseBody } from '../common/http';
import { requireCsrf, requireSession } from '../auth/guards';
import { missing } from '../common/agency-action';
import { createDocumentService } from './document.service';
import type { MalwareScanner, PrivateObjectStorage } from './private-storage';

export function createDocumentRouter(
  db: DatabaseClient,
  now: () => Date,
  storage?: PrivateObjectStorage,
  scan?: MalwareScanner,
) {
  const router = Router();
  const service = createDocumentService(db, now, storage, scan);
  const id = (req: Request) => {
    const v = z.uuid().safeParse(req.params.id);
    if (!v.success) throw missing();
    return v.data;
  };
  router.use('/documents', requireSession(db), requireCsrf(), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  router.post(
    '/documents/upload-intent',
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json({ data: await service.intent(req.auth!, parseBody(UploadIntentSchema, req)) });
    }),
  );
  router.post(
    '/documents/list',
    asyncHandler(async (req, res) => {
      const parent = parseBody(
        z.strictObject({
          parentType: z.enum(['PATIENT', 'CAREGIVER']),
          parentId: z.uuid(),
          classification: z.enum(['PATIENT_ATTACHMENT', 'AUTHORIZATION_EVIDENCE', 'QUALIFICATION']),
        }),
        req,
      );
      res.json({ data: await service.list(req.auth!, parent) });
    }),
  );
  router.put(
    '/documents/:id/upload',
    express.raw({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      limit: MAX_DOCUMENT_BYTES,
    }),
    asyncHandler(async (req, res) => {
      if (!Buffer.isBuffer(req.body)) throw missing();
      res.json({
        data: await service.upload(req.auth!, id(req), req.body, req.get('Content-Type') ?? ''),
      });
    }),
  );
  router.post(
    '/documents/:id/finalize',
    asyncHandler(async (req, res) => {
      parseBody(z.strictObject({}), req);
      res.json({ data: await service.finalize(req.auth!, id(req)) });
    }),
  );
  router.get(
    '/documents/:id',
    asyncHandler(async (req, res) => {
      res.json({ data: await service.detail(req.auth!, id(req)) });
    }),
  );
  router.get(
    '/documents/:id/download',
    asyncHandler(async (req, res) => {
      res.json({ data: await service.download(req.auth!, id(req)) });
    }),
  );
  router.get(
    '/documents/:id/content',
    asyncHandler(async (req, res) => {
      const ticket = z.string().min(20).max(200).safeParse(req.query.ticket);
      if (!ticket.success) throw missing();
      const result = await service.content(req.auth!, id(req), ticket.data);
      res.setHeader('Content-Type', result.mime);
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(result.bytes);
    }),
  );
  return router;
}

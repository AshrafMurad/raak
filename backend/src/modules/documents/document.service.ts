import { createHash, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import { MAX_DOCUMENT_BYTES, UploadIntentSchema, DocumentEvents } from '../../contracts/documents';
import type { AuthState } from '../auth/guards';
import { lockActiveTenant, missing } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { generateToken, hashToken } from '../auth/crypto';
import { appendAudit } from '../../db/audit';
import { authorizeDocument } from './document-policy';
import {
  matchesDocumentSignature,
  type MalwareScanner,
  type PrivateObjectStorage,
} from './private-storage';

export const documentProjection = {
  id: true,
  parentType: true,
  parentId: true,
  classification: true,
  mime: true,
  sizeBytes: true,
  scanStatus: true,
  createdAt: true,
} as const;
const unavailable = () =>
  new ApiError(503, 'INTERNAL_ERROR', 'Private file processing is unavailable.');
export function createDocumentService(
  db: DatabaseClient,
  now: () => Date,
  storage?: PrivateObjectStorage,
  scan?: MalwareScanner,
) {
  async function authorized(
    tx: Prisma.TransactionClient,
    auth: AuthState,
    id: string,
    write: boolean,
  ) {
    if (auth.realm.kind !== 'AGENCY') throw missing();
    // Acquire the shared writer lock BEFORE reading scan/reservation state.
    // Reading first would let a waiting finalizer reuse a stale unclaimed row.
    await lockActiveTenant(tx, auth.realm.tenant.tenantId);
    const row = await tx.document.findFirst({
      where: { tenantId: auth.realm.tenant.tenantId, id, archivedAt: null },
    });
    if (!row) throw missing();
    await authorizeDocument(tx, auth, row, write, now);
    return row;
  }
  return {
    list: (
      auth: AuthState,
      parent: { parentType: string; parentId: string; classification: string },
    ) =>
      db.$transaction(async (tx) => {
        const tenantId = await authorizeDocument(tx, auth, parent, false, now);
        return {
          items: await tx.document.findMany({
            where: { tenantId, ...parent, archivedAt: null },
            select: documentProjection,
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        };
      }),
    intent: async (auth: AuthState, input: z.infer<typeof UploadIntentSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await authorizeDocument(tx, auth, input, true, now);
        if (!storage) throw unavailable();
        const row = await tx.document.create({
          data: {
            tenantId,
            parentType: input.parentType,
            parentId: input.parentId,
            classification: input.classification,
            originalNameRestricted: input.originalName,
            mime: input.mime,
            sizeBytes: input.sizeBytes,
            storageKey: `${tenantId}/${randomUUID()}/${randomUUID()}`,
            createdBy: auth.session.principalId,
            uploadExpiresAt: new Date(now().getTime() + 5 * 60_000),
          },
          select: documentProjection,
        });
        await recordChange(tx, auth, tenantId, row.id, DocumentEvents.INTENT_CREATED, 'document');
        return {
          ...row,
          uploadUrl: `/v1/documents/${row.id}/upload`,
          uploadMethod: 'PUT',
          expiresInSeconds: 300,
        };
      }),
    upload: async (auth: AuthState, id: string, bytes: Buffer, mime: string) => {
      const row = await db.$transaction(async (tx) => {
        const row = await authorized(tx, auth, id, true);
        if (
          row.createdBy !== auth.session.principalId ||
          row.scanStatus !== 'PENDING' ||
          row.uploadExpiresAt <= now()
        )
          throw missing();
        if (
          bytes.length !== row.sizeBytes ||
          bytes.length > MAX_DOCUMENT_BYTES ||
          mime !== row.mime ||
          !matchesDocumentSignature(bytes, mime)
        ) {
          await tx.document.update({
            where: { id, tenantId: row.tenantId },
            data: { scanStatus: 'REJECTED' },
          });
          await recordChange(tx, auth, row.tenantId, id, DocumentEvents.REJECTED, 'document');
          return null;
        }
        if (!storage) throw unavailable();
        await tx.document.update({
          where: { id, tenantId: row.tenantId },
          data: { scanStatus: 'PROCESSING' },
        });
        await recordChange(tx, auth, row.tenantId, id, DocumentEvents.UPLOAD_STARTED, 'document');
        return row;
      });
      if (!row) throw new ApiError(422, 'VALIDATION_FAILED', 'File content was rejected.');
      try {
        await storage!.putImmutable(row.storageKey, bytes, row.mime);
      } catch {
        await db.$transaction(async (tx) => {
          await authorized(tx, auth, id, true);
          await tx.document.update({
            where: { id, tenantId: row.tenantId },
            data: { scanStatus: 'QUARANTINED' },
          });
          await recordChange(tx, auth, row.tenantId, id, DocumentEvents.QUARANTINED, 'document');
        });
        throw unavailable();
      }
      return { id, scanStatus: 'PROCESSING' };
    },
    finalize: async (auth: AuthState, id: string) => {
      const reserved = await db.$transaction(async (tx) => {
        const row = await authorized(tx, auth, id, true);
        if (row.createdBy !== auth.session.principalId) throw missing();
        if (row.scanStatus !== 'PROCESSING') return { execute: false as const, row };
        if (row.scanStartedAt) {
          if (row.scanStartedAt.getTime() + 120_000 > now().getTime())
            throw new ApiError(
              409,
              'STATE_TRANSITION_INVALID',
              'File processing is already in progress.',
            );
          const quarantined = await tx.document.update({
            where: { id, tenantId: row.tenantId },
            data: { scanStatus: 'QUARANTINED' },
          });
          await recordChange(tx, auth, row.tenantId, id, DocumentEvents.QUARANTINED, 'document');
          return { execute: false as const, row: quarantined };
        }
        const claimed = await tx.document.update({
          where: { id, tenantId: row.tenantId },
          data: { scanStartedAt: now() },
        });
        return { execute: true as const, row: claimed };
      });
      const row = reserved.row;
      if (!reserved.execute) return { id, scanStatus: row.scanStatus };
      let status: 'CLEAN' | 'REJECTED' | 'QUARANTINED' = 'QUARANTINED';
      let checksum: string | null = null;
      try {
        if (storage && scan) {
          const bytes = await storage.read(row.storageKey, MAX_DOCUMENT_BYTES);
          if (bytes.length !== row.sizeBytes || !matchesDocumentSignature(bytes, row.mime))
            status = 'REJECTED';
          else {
            checksum = createHash('sha256').update(bytes).digest('hex');
            status = await scan(bytes);
            if (!['CLEAN', 'REJECTED', 'QUARANTINED'].includes(status)) status = 'QUARANTINED';
          }
        }
      } catch {
        status = 'QUARANTINED';
      }
      return db.$transaction(async (tx) => {
        const current = await authorized(tx, auth, id, true);
        if (current.scanStatus !== 'PROCESSING') return { id, scanStatus: current.scanStatus };
        if (!current.scanStartedAt || current.scanStartedAt.getTime() + 120_000 <= now().getTime())
          status = 'QUARANTINED';
        await tx.document.update({
          where: { id, tenantId: row.tenantId },
          data: { scanStatus: status, checksum },
        });
        await recordChange(tx, auth, row.tenantId, id, DocumentEvents[status], 'document');
        return { id, scanStatus: status };
      });
    },
    detail: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const row = await authorized(tx, auth, id, false);
        return tx.document.findFirstOrThrow({
          where: { id, tenantId: row.tenantId },
          select: documentProjection,
        });
      }),
    download: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const row = await authorized(tx, auth, id, false);
        if (row.scanStatus !== 'CLEAN') throw missing();
        if (!storage) throw unavailable();
        const secret = generateToken();
        await tx.documentTicket.create({
          data: {
            tenantId: row.tenantId,
            documentId: id,
            sessionId: auth.sessionId,
            secretHash: secret.tokenHash,
            expiresAt: new Date(now().getTime() + 60_000),
          },
        });
        await recordChange(
          tx,
          auth,
          row.tenantId,
          id,
          DocumentEvents.DOWNLOAD_AUTHORIZED,
          'document',
        );
        return { url: `/v1/documents/${id}/content?ticket=${secret.token}`, expiresInSeconds: 60 };
      }),
    content: async (auth: AuthState, id: string, ticket: string) => {
      const row = await db.$transaction(async (tx) => {
        const row = await authorized(tx, auth, id, false);
        if (
          row.scanStatus !== 'CLEAN' ||
          !(await tx.documentTicket.findFirst({
            where: {
              tenantId: row.tenantId,
              documentId: id,
              sessionId: auth.sessionId,
              secretHash: hashToken(ticket),
              expiresAt: { gt: now() },
            },
          }))
        )
          throw missing();
        return row;
      });
      if (!storage) throw unavailable();
      let bytes: Buffer;
      try {
        bytes = await storage.read(row.storageKey, MAX_DOCUMENT_BYTES);
      } catch {
        throw unavailable();
      }
      if (createHash('sha256').update(bytes).digest('hex') !== row.checksum) throw missing();
      // Recheck after external I/O: revocation during download setup is denied.
      await db.$transaction(async (tx) => {
        const current = await authorized(tx, auth, id, false);
        if (
          current.scanStatus !== 'CLEAN' ||
          current.checksum !== row.checksum ||
          !(await tx.documentTicket.findFirst({
            where: {
              tenantId: row.tenantId,
              documentId: id,
              sessionId: auth.sessionId,
              secretHash: hashToken(ticket),
              expiresAt: { gt: now() },
            },
            select: { id: true },
          }))
        )
          throw missing();
        await appendAudit(tx, {
          tenantId: row.tenantId,
          actorType: auth.session.principalType,
          actorId: auth.session.principalId,
          action: 'document.downloaded',
          subjectType: 'document',
          subjectId: id,
        });
      });
      return { bytes, mime: row.mime };
    },
  };
}

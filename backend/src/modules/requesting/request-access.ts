import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import type { AccessLinkSchema } from '../../contracts/catalog';
import { ApiError } from '../../api-error';
import { generateToken, hashToken } from '../auth/crypto';
import { lockActiveTenant } from '../catalog/catalog.repository';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { sealSecret } from './secrets';
import { RequestEvents } from '../../contracts/events';

export const GUEST_TOKEN_TTL_MS = 15 * 60_000;
export const GUEST_SESSION_TTL_MS = 30 * 60_000;
const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', 'Verification required.');

/** Borrow the caller's transaction: intake and resend share token issuance. */
export function createRequestTokenIssuer(now: () => Date, key: () => string) {
  return async function issue(
    tx: Prisma.TransactionClient,
    tenantId: string,
    requestId: string,
    email: string,
  ) {
    const secret = generateToken().token;
    const row = await tx.guestActionToken.create({
      data: {
        tenantId,
        requestId,
        tokenHash: hashToken(secret),
        emailHash: hashToken(email),
        expiresAt: new Date(now().getTime() + GUEST_TOKEN_TTL_MS),
      },
    });
    await tx.guestActionToken.update({
      where: { id: row.id },
      data: { encryptedSecret: sealSecret(secret, key(), `${tenantId}:${row.id}`) },
    });
    await enqueueOutbox(tx, {
      tenantId,
      eventType: RequestEvents.ACCESS_EMAIL,
      aggregateId: row.id,
      payloadMinimal: { requestId },
    });
  };
}

export type RequestTokenIssuer = ReturnType<typeof createRequestTokenIssuer>;

export function createRequestAccess(
  db: DatabaseClient,
  now: () => Date,
  issue: RequestTokenIssuer,
) {
  return {
    accessLink: (tenantId: string, input: z.infer<typeof AccessLinkSchema>) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const row = await tx.serviceRequest.findFirst({
          where: { tenantId, reference: input.reference, requesterEmailNormalized: input.email },
        });
        if (!row) return;
        const count = await tx.guestActionToken.count({
          where: {
            tenantId,
            requestId: row.id,
            expiresAt: { gt: new Date(now().getTime() - 45 * 60_000) },
          },
        });
        // Non-enumerating suppression uses the same 202 response as no match.
        if (count >= 4) return;
        await issue(tx, tenantId, row.id, row.requesterEmailNormalized);
      }),
    consume: (tenantId: string, secret: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const row = await tx.guestActionToken.findFirst({
          where: { tenantId, tokenHash: hashToken(secret), purpose: 'REQUEST_STATUS' },
          include: { request: { select: { requesterEmailNormalized: true } } },
        });
        if (!row || row.emailHash !== hashToken(row.request.requesterEmailNormalized))
          throw unauthenticated();
        if (row.consumedAt) throw new ApiError(409, 'TOKEN_ALREADY_USED', 'Link already used.');
        const consumedAt = now();
        const claim = await tx.guestActionToken.updateMany({
          where: { id: row.id, tenantId, consumedAt: null, expiresAt: { gt: consumedAt } },
          data: { consumedAt, encryptedSecret: null },
        });
        if (claim.count !== 1) throw new ApiError(401, 'TOKEN_EXPIRED', 'Link expired.');
        const sessionToken = generateToken().token;
        await tx.guestSession.create({
          data: {
            tenantId,
            requestId: row.requestId,
            secretHash: hashToken(sessionToken),
            expiresAt: new Date(consumedAt.getTime() + GUEST_SESSION_TTL_MS),
          },
        });
        await appendAudit(tx, {
          tenantId,
          action: 'request.ownership_verified',
          subjectType: 'service_request',
          subjectId: row.requestId,
        });
        return { sessionToken, requestId: row.requestId };
      }),
  };
}

import type { Request } from 'express';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import { hashToken, safeEqual } from '../auth/crypto';
import { sessionCookieName } from '../auth/cookies';
import { resolveSession } from '../auth/session.service';

export const GUEST_COOKIE = 'raak_guest';

export interface RequestViewer {
  kind: 'GUEST' | 'CUSTOMER';
  /** Guest sessions are bound to exactly one verified request (docs 05). */
  guestRequestId?: string;
  customerAccountId?: string;
  /** Stable idempotency principal scope for this viewer. */
  principalId: string;
}

function cookieSecret(req: Request, name: string): string | undefined {
  return req.headers.cookie
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(`${name}=`.length);
}

/**
 * Resolve the verified requester for portal request/quote actions: either a
 * fresh guest session (ownership verified by emailed capability) or a signed-in
 * customer account that the request row itself names. Email similarity or a
 * bare reference never establishes ownership (docs 05 guest flows).
 */
export async function resolveRequestViewer(
  tx: Prisma.TransactionClient,
  tenantId: string,
  req: Request,
  now: () => Date,
): Promise<RequestViewer | null> {
  // Resolve within the same transaction as the commercial action. These
  // routes also admit guests, so they do not use the staff-only HTTP guards.
  const accountSecret = cookieSecret(req, sessionCookieName('AGENCY'));
  const auth = accountSecret ? await resolveSession(tx, accountSecret, now) : null;
  if (
    auth &&
    auth.session.principalType === 'AGENCY_CUSTOMER' &&
    auth.session.tenantId === tenantId &&
    auth.customer &&
    auth.customer.tenantId === tenantId
  ) {
    const verified = await tx.customerAccount.findFirst({
      where: { tenantId, id: auth.customer.id, emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    if (!verified) return null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.get('X-CSRF-Token');
      if (!csrf || !safeEqual(hashToken(csrf), auth.csrfTokenHash))
        throw new ApiError(403, 'FORBIDDEN', 'CSRF token missing or invalid.');
    }
    return {
      kind: 'CUSTOMER',
      customerAccountId: auth.customer.id,
      principalId: `customer:${auth.customer.id}`,
    };
  }
  const secret = cookieSecret(req, GUEST_COOKIE);
  if (!secret) return null;
  const session = await tx.guestSession.findFirst({
    where: { tenantId, secretHash: hashToken(secret), expiresAt: { gt: now() } },
  });
  if (!session) return null;
  return {
    kind: 'GUEST',
    guestRequestId: session.requestId,
    principalId: `guest:${session.id}`,
  };
}

export function requireViewer(
  tx: Prisma.TransactionClient,
  tenantId: string,
  req: Request,
  now: () => Date,
): Promise<RequestViewer> {
  return resolveRequestViewer(tx, tenantId, req, now).then((viewer) => {
    if (!viewer) throw new ApiError(401, 'UNAUTHENTICATED', 'Verification required.');
    return viewer;
  });
}

/** 404 (not 403) for requests the viewer does not own — no enumeration. */
export async function loadOwnedRequest(
  tx: Prisma.TransactionClient,
  viewer: RequestViewer,
  tenantId: string,
  requestId: string,
) {
  const row = await tx.serviceRequest.findFirst({ where: { tenantId, id: requestId } });
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  const owns =
    viewer.kind === 'GUEST'
      ? viewer.guestRequestId === row.id
      : viewer.customerAccountId !== undefined &&
        row.customerAccountId === viewer.customerAccountId;
  if (!owns) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  return row;
}

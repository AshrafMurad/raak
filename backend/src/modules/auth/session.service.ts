/**
 * Opaque server-side sessions (docs 05): raw secret exists only in the cookie;
 * the database stores sha-256 hashes. Resolution re-checks account status,
 * sessionVersion and tenant status on every call — a previously valid session
 * is never trusted for current authorization (I15).
 */
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import type { ServerSessionContext } from '../../contracts';
import { generateToken, hashToken } from './crypto';

export type PrincipalTypeValue = 'PLATFORM_OPERATOR' | 'AGENCY_STAFF' | 'AGENCY_CUSTOMER';
export type AccountStatusValue = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';

export interface CreateSessionInput {
  principalType: PrincipalTypeValue;
  principalId: string;
  /** Required for staff/customer principals; must be null for platform operators. */
  tenantId?: string;
  sessionVersion: number;
  ttlSeconds: number;
  /** Injectable clock for tests. */
  now?(): Date;
}

export interface CreatedSession {
  sessionId: string;
  /** Raw opaque session secret — cookie value only, never persisted. */
  sessionToken: string;
  /** Raw CSRF secret — readable cookie + response body, stored hashed. */
  csrfToken: string;
  expiresAt: Date;
}

export interface ResolvedStaff {
  id: string;
  tenantId: string;
  emailNormalized: string;
  role: string;
  status: string;
}

export interface ResolvedCustomer {
  id: string;
  tenantId: string;
  emailNormalized: string;
  status: string;
}

export interface ResolvedOperator {
  id: string;
  emailNormalized: string;
  status: string;
}

export interface ResolvedSession {
  sessionId: string;
  csrfTokenHash: string;
  session: ServerSessionContext;
  staff?: ResolvedStaff;
  customer?: ResolvedCustomer;
  operator?: ResolvedOperator;
}

export async function createSession(db: DatabaseClient, input: CreateSessionInput): Promise<CreatedSession> {
  const now = input.now ?? (() => new Date());
  const issuedAt = now();
  const expiresAt = new Date(issuedAt.getTime() + input.ttlSeconds * 1000);
  const sessionSecret = generateToken();
  const csrfSecret = generateToken();
  const row = await db.authSession.create({
    data: {
      principalType: input.principalType,
      principalId: input.principalId,
      tenantId: input.principalType === 'PLATFORM_OPERATOR' ? null : input.tenantId,
      secretHash: sessionSecret.tokenHash,
      csrfTokenHash: csrfSecret.tokenHash,
      sessionVersion: input.sessionVersion,
      expiresAt,
      createdAt: issuedAt,
    },
  });
  return {
    sessionId: row.id,
    sessionToken: sessionSecret.token,
    csrfToken: csrfSecret.token,
    expiresAt,
  };
}

export async function resolveSession(
  db: DatabaseClient,
  sessionToken: string,
  now: () => Date = () => new Date(),
): Promise<ResolvedSession | null> {
  const row = await db.authSession.findUnique({ where: { secretHash: hashToken(sessionToken) } });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= now().getTime()) return null;

  const base = {
    sessionId: row.id,
    csrfTokenHash: row.csrfTokenHash,
  };
  const context = {
    principalId: row.principalId,
    sessionVersion: row.sessionVersion,
    issuedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };

  if (row.principalType === 'PLATFORM_OPERATOR') {
    const operator = await db.platformOperator.findUnique({ where: { id: row.principalId } });
    if (!operator || operator.status !== 'ACTIVE' || operator.sessionVersion !== row.sessionVersion) {
      return null;
    }
    return {
      ...base,
      session: { ...context, principalType: 'PLATFORM_OPERATOR' },
      operator: {
        id: operator.id,
        emailNormalized: operator.emailNormalized,
        status: operator.status,
      },
    };
  }

  if (row.principalType === 'AGENCY_STAFF') {
    const staff = await db.staffAccount.findUnique({ where: { id: row.principalId } });
    if (
      !staff ||
      staff.status !== 'ACTIVE' ||
      staff.sessionVersion !== row.sessionVersion ||
      row.tenantId !== staff.tenantId
    ) {
      return null;
    }
    const tenant = await db.tenant.findUnique({ where: { id: staff.tenantId } });
    if (!tenant) return null;
    // Owner may sign in while the tenant awaits activation; all other staff
    // and every customer require an ACTIVE tenant (docs 05 registration flow).
    const tenantUsable =
      tenant.status === 'ACTIVE' ||
      (tenant.status === 'PENDING_APPROVAL' && staff.role === 'AGENCY_OWNER');
    if (!tenantUsable) return null;
    return {
      ...base,
      session: { ...context, principalType: 'AGENCY_STAFF', tenantId: staff.tenantId },
      staff: {
        id: staff.id,
        tenantId: staff.tenantId,
        emailNormalized: staff.emailNormalized,
        role: staff.role,
        status: staff.status,
      },
    };
  }

  const customer = await db.customerAccount.findUnique({ where: { id: row.principalId } });
  if (
    !customer ||
    customer.status !== 'ACTIVE' ||
    customer.sessionVersion !== row.sessionVersion ||
    row.tenantId !== customer.tenantId
  ) {
    return null;
  }
  const tenant = await db.tenant.findUnique({ where: { id: customer.tenantId } });
  if (!tenant || tenant.status !== 'ACTIVE') return null;
  return {
    ...base,
    session: { ...context, principalType: 'AGENCY_CUSTOMER', tenantId: customer.tenantId },
    customer: {
      id: customer.id,
      tenantId: customer.tenantId,
      emailNormalized: customer.emailNormalized,
      status: customer.status,
    },
  };
}

export async function revokeSession(db: DatabaseClient, sessionId: string, now: () => Date = () => new Date()): Promise<void> {
  await db.authSession.update({
    where: { id: sessionId },
    data: { revokedAt: now() },
  });
}

/** Used by platform tenant suspension (I15): every live session of the tenant dies now. */
export async function revokeAllSessionsForTenant(
  db: DatabaseClient | Prisma.TransactionClient,
  tenantId: string,
  now: () => Date = () => new Date(),
): Promise<number> {
  const result = await db.authSession.updateMany({
    where: { tenantId, revokedAt: null },
    data: { revokedAt: now() },
  });
  return result.count;
}

export async function rotateCsrf(
  db: DatabaseClient,
  sessionId: string,
): Promise<{ csrfToken: string; csrfTokenHash: string }> {
  const csrfSecret = generateToken();
  await db.authSession.update({
    where: { id: sessionId },
    data: { csrfTokenHash: csrfSecret.tokenHash },
  });
  return { csrfToken: csrfSecret.token, csrfTokenHash: csrfSecret.tokenHash };
}

/**
 * Authentication service (docs 05): owner email verification, realm login
 * (platform operator / tenant staff / tenant customer), logout, password
 * reset. All failures are generic (no enumeration); capability tokens are
 * single-use, hashed at rest, expiry enforced server-side.
 */
import type { DatabaseClient } from '../../db/client';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { ApiError } from '../../api-error';
import { generateToken, hashToken, hashPassword, verifyPassword } from './crypto';
import {
  createSession,
  revokeAllSessionsForTenant,
  revokeSession,
  type CreatedSession,
} from './session.service';
import type { HostRealm } from './host-resolver';
import type { AuthState } from './guards';
import type { AuthMeDto } from '../../contracts';

export const PASSWORD_RESET_TTL_SECONDS = 30 * 60;
const SESSION_TTL_SECONDS = 12 * 60 * 60;

const GENERIC_LOGIN_FAILURE = new ApiError(401, 'UNAUTHENTICATED', 'Invalid email or password.');

export interface AuthServiceDeps {
  db: DatabaseClient;
  now(): Date;
  buildLink(kind: 'owner_verification' | 'password_reset', token: string): string;
}

type AnyAccount = { id: string; passwordHash: string; sessionVersion: number; status: string };

export function createAuthService(deps: AuthServiceDeps) {
  const db = deps.db;

  async function consumeEmailToken(
    token: string,
    purpose: 'OWNER_VERIFICATION' | 'PASSWORD_RESET',
  ): Promise<{ row: { id: string; principalType: string; principalId: string; tenantId: string | null } }> {
    const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.purpose !== purpose) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'This link is not valid.');
    }
    if (row.consumedAt) {
      throw new ApiError(409, 'TOKEN_ALREADY_USED', 'This link was already used.');
    }
    if (row.expiresAt.getTime() <= deps.now().getTime()) {
      throw new ApiError(401, 'TOKEN_EXPIRED', 'This link has expired.');
    }
    return { row };
  }

  return {
    async verifyOwnerEmail(token: string): Promise<void> {
      const { row } = await consumeEmailToken(token, 'OWNER_VERIFICATION');
      await db.$transaction(async (tx) => {
        const updated = await tx.emailToken.update({
          where: { id: row.id, consumedAt: null },
          data: { consumedAt: deps.now() },
        });
        if (!updated) {
          throw new ApiError(409, 'TOKEN_ALREADY_USED', 'This link was already used.');
        }
        await tx.staffAccount.update({
          where: { id: row.principalId },
          data: { status: 'ACTIVE', emailVerifiedAt: deps.now() },
        });
        await appendAudit(tx, {
          ...(row.tenantId !== null ? { tenantId: row.tenantId } : {}),
          actorType: 'AGENCY_STAFF',
          actorId: row.principalId,
          action: 'owner.email_verified',
          subjectType: 'staff_account',
          subjectId: row.principalId,
        });
      });
    },

    async login(realm: HostRealm & { kind: 'PLATFORM' | 'AGENCY' }, emailRaw: string, password: string): Promise<{ created: CreatedSession; me: AuthMeDto }> {
      const email = emailRaw.trim().toLowerCase();
      let me: AuthMeDto;
      let principal: AnyAccount;
      let principalType: 'PLATFORM_OPERATOR' | 'AGENCY_STAFF' | 'AGENCY_CUSTOMER';

      if (realm.kind === 'PLATFORM') {
        const operator = await db.platformOperator.findUnique({ where: { emailNormalized: email } });
        if (!operator) throw GENERIC_LOGIN_FAILURE;
        if (operator.status !== 'ACTIVE') throw GENERIC_LOGIN_FAILURE;
        if (!(await verifyPassword(password, operator.passwordHash))) throw GENERIC_LOGIN_FAILURE;
        principal = operator;
        principalType = 'PLATFORM_OPERATOR';
        me = { principalType: 'PLATFORM_OPERATOR', email: operator.emailNormalized };
      } else {
        const tenantId = realm.tenant.tenantId;
        const staff = await db.staffAccount.findUnique({
          where: { tenantId_emailNormalized: { tenantId, emailNormalized: email } },
        });
        if (staff) {
          const tenantUsable =
            realm.tenant.status === 'ACTIVE' ||
            (realm.tenant.status === 'PENDING_APPROVAL' && staff.role === 'AGENCY_OWNER');
          if (!tenantUsable || staff.status !== 'ACTIVE' || !(await verifyPassword(password, staff.passwordHash))) {
            throw GENERIC_LOGIN_FAILURE;
          }
          principal = staff;
          principalType = 'AGENCY_STAFF';
          me = {
            principalType: 'AGENCY_STAFF',
            email: staff.emailNormalized,
            role: staff.role,
            tenant: { tenantId, slug: realm.tenant.slug, status: realm.tenant.status },
          };
        } else {
          const customer = await db.customerAccount.findUnique({
            where: { tenantId_emailNormalized: { tenantId, emailNormalized: email } },
          });
          if (!customer) throw GENERIC_LOGIN_FAILURE;
          if (
            realm.tenant.status !== 'ACTIVE' ||
            customer.status !== 'ACTIVE' ||
            !(await verifyPassword(password, customer.passwordHash))
          ) {
            throw GENERIC_LOGIN_FAILURE;
          }
          principal = customer;
          principalType = 'AGENCY_CUSTOMER';
          me = {
            principalType: 'AGENCY_CUSTOMER',
            email: customer.emailNormalized,
            tenant: { tenantId, slug: realm.tenant.slug, status: realm.tenant.status },
          };
        }
      }

      const created = await createSession(db, {
        principalType,
        principalId: principal.id,
        ...(principalType !== 'PLATFORM_OPERATOR' && realm.kind === 'AGENCY'
          ? { tenantId: realm.tenant.tenantId }
          : {}),
        sessionVersion: principal.sessionVersion,
        ttlSeconds: SESSION_TTL_SECONDS,
        now: deps.now,
      });
      await db.auditEvent.create({
        data: {
          ...(realm.kind === 'AGENCY' ? { tenantId: realm.tenant.tenantId } : {}),
          actorType: principalType,
          actorId: principal.id,
          action: 'auth.login',
          subjectType: 'auth_session',
          subjectId: created.sessionId,
          metadataJson: {},
        },
      });
      return { created, me };
    },

    async logout(auth: AuthState): Promise<void> {
      await revokeSession(db, auth.sessionId, deps.now);
      await db.auditEvent.create({
        data: {
          ...(auth.realm.kind === 'AGENCY' ? { tenantId: auth.realm.tenant.tenantId } : {}),
          actorType: auth.session.principalType,
          actorId: auth.session.principalId,
          action: 'auth.logout',
          subjectType: 'auth_session',
          subjectId: auth.sessionId,
          metadataJson: {},
        },
      });
    },

    async requestPasswordReset(realm: HostRealm & { kind: 'PLATFORM' | 'AGENCY' }, emailRaw: string): Promise<void> {
      const email = emailRaw.trim().toLowerCase();
      let accountId: string | null = null;
      let principalType: 'PLATFORM_OPERATOR' | 'AGENCY_STAFF' | 'AGENCY_CUSTOMER' | null = null;
      let tenantId: string | null = null;

      if (realm.kind === 'PLATFORM') {
        const operator = await db.platformOperator.findUnique({ where: { emailNormalized: email } });
        if (operator?.status === 'ACTIVE') {
          accountId = operator.id;
          principalType = 'PLATFORM_OPERATOR';
        }
      } else {
        const staff = await db.staffAccount.findUnique({
          where: { tenantId_emailNormalized: { tenantId: realm.tenant.tenantId, emailNormalized: email } },
        });
        if (staff?.status === 'ACTIVE') {
          accountId = staff.id;
          principalType = 'AGENCY_STAFF';
          tenantId = staff.tenantId;
        } else {
          const customer = await db.customerAccount.findUnique({
            where: { tenantId_emailNormalized: { tenantId: realm.tenant.tenantId, emailNormalized: email } },
          });
          if (customer?.status === 'ACTIVE') {
            accountId = customer.id;
            principalType = 'AGENCY_CUSTOMER';
            tenantId = customer.tenantId;
          }
        }
      }
      if (!accountId || !principalType) return; // generic 202 either way

      const reset = generateToken();
      await db.$transaction(async (tx) => {
        await tx.emailToken.create({
          data: {
            ...(tenantId !== null ? { tenantId } : {}),
            purpose: 'PASSWORD_RESET',
            principalType,
            principalId: accountId!,
            tokenHash: reset.tokenHash,
            expiresAt: new Date(deps.now().getTime() + PASSWORD_RESET_TTL_SECONDS * 1000),
            createdAt: deps.now(),
          },
        });
        await enqueueOutbox(tx, {
          ...(tenantId !== null ? { tenantId } : {}),
          eventType: 'email.password_reset',
          aggregateId: accountId!,
          payloadMinimal: {
            to: email,
            action: 'password_reset',
            link: deps.buildLink('password_reset', reset.token),
          },
        });
        await appendAudit(tx, {
          ...(tenantId !== null ? { tenantId } : {}),
          action: 'auth.password_reset_requested',
          subjectType: principalType === 'PLATFORM_OPERATOR' ? 'platform_operator' : principalType === 'AGENCY_STAFF' ? 'staff_account' : 'customer_account',
          subjectId: accountId!,
          metadata: {},
        });
      });
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
      const { row } = await consumeEmailToken(token, 'PASSWORD_RESET');
      const passwordHash = await hashPassword(newPassword);
      await db.$transaction(async (tx) => {
        const updated = await tx.emailToken.update({
          where: { id: row.id, consumedAt: null },
          data: { consumedAt: deps.now() },
        });
        if (!updated) {
          throw new ApiError(409, 'TOKEN_ALREADY_USED', 'This link was already used.');
        }
        if (row.principalType === 'PLATFORM_OPERATOR') {
          const op = await tx.platformOperator.update({
            where: { id: row.principalId },
            data: { passwordHash, sessionVersion: { increment: 1 } },
          });
          await tx.authSession.deleteMany({ where: { principalId: op.id } });
        } else if (row.principalType === 'AGENCY_STAFF') {
          const staff = await tx.staffAccount.update({
            where: { id: row.principalId },
            data: { passwordHash, sessionVersion: { increment: 1 } },
          });
          await tx.authSession.deleteMany({ where: { principalId: staff.id } });
        } else {
          const customer = await tx.customerAccount.update({
            where: { id: row.principalId },
            data: { passwordHash, sessionVersion: { increment: 1 } },
          });
          await tx.authSession.deleteMany({ where: { principalId: customer.id } });
        }
        await appendAudit(tx, {
          ...(row.tenantId !== null ? { tenantId: row.tenantId } : {}),
          action: 'auth.password_reset',
          subjectType: row.principalType === 'PLATFORM_OPERATOR' ? 'platform_operator' : row.principalType === 'AGENCY_STAFF' ? 'staff_account' : 'customer_account',
          subjectId: row.principalId,
          metadata: {},
        });
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
export { revokeAllSessionsForTenant };

/**
 * Platform control plane (docs 05/07): operator-only tenant lifecycle and
 * audit reads. Aggregate counts and metadata only — no agency content, no
 * patient data. Suspend revokes every live tenant session in the same
 * transaction (I15).
 */
import type { DatabaseClient } from '../../db/client';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { ApiError } from '../../api-error';
import type { AuthState } from '../auth/guards';
import { revokeAllSessionsForTenant } from '../auth/session.service';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const AUDIT_ACTIONS = ['tenant.registered', 'tenant.activated', 'tenant.suspended'];

export interface PlatformServiceDeps {
  db: DatabaseClient;
  now(): Date;
}

export interface CursorPage {
  limit?: number;
  cursor?: string | undefined;
}

export function createPlatformService(deps: PlatformServiceDeps) {
  const db = deps.db;

  function clampLimit(limit: number | undefined): number {
    if (limit === undefined) return DEFAULT_LIMIT;
    return Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
  }

  async function countsFor(tenantIds: string[]) {
    const [owners, staff, customers] = await Promise.all([
      db.staffAccount.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds }, role: 'AGENCY_OWNER' }, _count: { _all: true } }),
      db.staffAccount.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
      db.customerAccount.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    ]);
    const ownerMap = new Map(owners.map((r) => [r.tenantId, r._count._all]));
    const staffMap = new Map(staff.map((r) => [r.tenantId, r._count._all]));
    const customerMap = new Map(customers.map((r) => [r.tenantId, r._count._all]));
    return (tenantId: string) => ({
      owners: ownerMap.get(tenantId) ?? 0,
      staff: staffMap.get(tenantId) ?? 0,
      customers: customerMap.get(tenantId) ?? 0,
    });
  }

  return {
    async listTenants(page: CursorPage & { status?: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' }) {
      const limit = clampLimit(page.limit);
      const tenants = await db.tenant.findMany({
        where: {
          ...(page.status !== undefined ? { status: page.status } : {}),
          ...(page.cursor !== undefined ? { id: { gt: page.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      const hasMore = tenants.length > limit;
      const pageItems = hasMore ? tenants.slice(0, limit) : tenants;
      const counts = await countsFor(pageItems.map((t) => t.id));
      return {
        items: pageItems.map((t) => ({
          tenantId: t.id,
          slug: t.slug,
          displayName: t.displayName,
          status: t.status,
          counts: counts(t.id),
        })),
        nextCursor: hasMore ? pageItems[pageItems.length - 1]!.id : null,
      };
    },

    async getTenant(tenantId: string) {
      const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
      }
      const owner = await db.staffAccount.findFirst({
        where: { tenantId, role: 'AGENCY_OWNER' },
        orderBy: { createdAt: 'asc' },
      });
      const counts = await countsFor([tenantId]);
      return {
        tenantId: tenant.id,
        slug: tenant.slug,
        displayName: tenant.displayName,
        status: tenant.status,
        legalName: tenant.legalName,
        timezone: tenant.timezone,
        currency: tenant.currency,
        supportEmail: tenant.supportEmail,
        createdAt: tenant.createdAt.toISOString(),
        ownerEmail: owner?.emailNormalized ?? null,
        counts: counts(tenantId),
      };
    },

    async activateTenant(auth: AuthState, tenantId: string, reason?: string): Promise<{ tenantId: string; status: string }> {
      const tenant = await db.$transaction(async (tx) => {
        const current = await tx.tenant.findUnique({ where: { id: tenantId } });
        if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
        if (current.status !== 'PENDING_APPROVAL' && current.status !== 'SUSPENDED') {
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Tenant cannot be activated from its current status.');
        }
        const changed = await tx.tenant.updateMany({
          where: { id: tenantId, status: current.status },
          data: { status: 'ACTIVE' },
        });
        if (changed.count !== 1) {
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Tenant cannot be activated from its current status.');
        }
        const updated = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const owner = await tx.staffAccount.findFirst({
          where: { tenantId, role: 'AGENCY_OWNER' },
          orderBy: { createdAt: 'asc' },
        });
        if (owner) {
          await enqueueOutbox(tx, {
            tenantId,
            eventType: 'email.tenant_activated',
            aggregateId: tenantId,
            payloadMinimal: { to: owner.emailNormalized, action: 'tenant_activated' },
          });
        }
        await appendAudit(tx, {
          tenantId,
          actorType: 'PLATFORM_OPERATOR',
          actorId: auth.session.principalId,
          action: 'tenant.activated',
          subjectType: 'tenant',
          subjectId: tenantId,
          ...(reason !== undefined ? { reason } : {}),
          metadata: { fromStatus: current.status, toStatus: 'ACTIVE' },
        });
        return updated;
      });
      return { tenantId: tenant.id, status: tenant.status };
    },

    async suspendTenant(auth: AuthState, tenantId: string, reason: string): Promise<{ tenantId: string; status: string }> {
      const tenant = await db.$transaction(async (tx) => {
        const current = await tx.tenant.findUnique({ where: { id: tenantId } });
        if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
        if (current.status !== 'ACTIVE') {
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Tenant cannot be suspended from its current status.');
        }
        const changed = await tx.tenant.updateMany({
          where: { id: tenantId, status: 'ACTIVE' },
          data: { status: 'SUSPENDED' },
        });
        if (changed.count !== 1) {
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Tenant cannot be suspended from its current status.');
        }
        const updated = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        await revokeAllSessionsForTenant(tx, tenantId, deps.now);
        await appendAudit(tx, {
          tenantId,
          actorType: 'PLATFORM_OPERATOR',
          actorId: auth.session.principalId,
          action: 'tenant.suspended',
          subjectType: 'tenant',
          subjectId: tenantId,
          reason,
          metadata: { fromStatus: 'ACTIVE', toStatus: 'SUSPENDED' },
        });
        return updated;
      });
      return { tenantId: tenant.id, status: tenant.status };
    },

    async listAudit(page: CursorPage) {
      const limit = clampLimit(page.limit);
      const rows = await db.auditEvent.findMany({
        where: {
          action: { in: AUDIT_ACTIONS },
          ...(page.cursor !== undefined ? { id: { lt: page.cursor } } : {}),
        },
        orderBy: { id: 'desc' },
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const pageItems = hasMore ? rows.slice(0, limit) : rows;
      return {
        items: pageItems.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          action: row.action,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          reason: row.reason,
          at: row.at.toISOString(),
        })),
        nextCursor: hasMore ? pageItems[pageItems.length - 1]!.id : null,
      };
    },
  };
}

export type PlatformService = ReturnType<typeof createPlatformService>;

/**
 * Agency audit view (docs 06 audit_events "paged restricted admin review",
 * docs 07 Session 4): append-only rows scoped to the server-resolved tenant,
 * safe summaries only. The projection deliberately excludes metadataJson —
 * non-sensitive operational deltas stay in the audit record itself, never in
 * admin list responses — and never carries notes, addresses or patient
 * details. Owner/Admin only (`agency.audit.read`), re-checked with live
 * account/session/tenant checks inside the read transaction.
 */
import type { DatabaseClient } from '../../db/client';
import type { AgencyAuditQuery } from '../../contracts/reports';
import type { AuthState } from '../auth/guards';
import { agencyAction } from '../common/agency-action';

export interface AgencyAuditEntry {
  id: string;
  at: string;
  actorType: string | null;
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string | null;
  reason: string | null;
}

export interface AgencyAuditPage {
  timezone: string;
  items: AgencyAuditEntry[];
  nextCursor: string | null;
}

export function createAuditService(db: DatabaseClient) {
  return {
    list: (auth: AuthState, query: AgencyAuditQuery): Promise<AgencyAuditPage> =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'agency.audit.read');
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const [at, id] = query.cursor?.split('~') ?? [];
        const rows = await tx.auditEvent.findMany({
          // Platform-scope rows (nullable tenantId) never appear in agency views.
          where: {
            tenantId,
            ...(at && id
              ? { OR: [{ at: { lt: new Date(at) } }, { at: new Date(at), id: { lt: id } }] }
              : {}),
          },
          orderBy: [{ at: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
          select: {
            id: true,
            at: true,
            actorType: true,
            actorId: true,
            action: true,
            subjectType: true,
            subjectId: true,
            reason: true,
          },
        });
        const hasMore = rows.length > query.limit;
        const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
          ...row,
          at: row.at.toISOString(),
        }));
        return {
          timezone: tenant.timezone,
          items,
          nextCursor: hasMore
            ? `${items[items.length - 1]!.at}~${items[items.length - 1]!.id}`
            : null,
        };
      }),
  };
}

export type AuditService = ReturnType<typeof createAuditService>;

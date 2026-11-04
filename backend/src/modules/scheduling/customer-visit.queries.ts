/** Grant-scoped customer summaries. Internal notes, task exceptions and
 * completion snapshots never cross this projection. */
import type { DatabaseClient } from '../../db/client';
import type { CustomerVisitQuery } from '../../contracts';
import type { AuthState } from '../auth/guards';
import { customerAction } from '../common/customer-action';
import { missing } from '../common/agency-action';
import { hasPatientGrant } from '../patients/patient.repository';
import { visitDateWindow } from '../common/visit-date-window';

const summary = {
  id: true,
  status: true,
  scheduledStartUtc: true,
  scheduledEndUtc: true,
  timezoneSnapshot: true,
  version: true,
  patient: { select: { id: true, displayName: true } },
  serviceNameSnapshot: true,
} as const;
const changeSummary = {
  id: true,
  type: true,
  status: true,
  urgency: true,
  proposedStartUtc: true,
  createdAt: true,
  decisionAt: true,
  decisionReason: true,
} as const;

export function createCustomerVisitQueries(db: DatabaseClient, now: () => Date) {
  return {
    customerVisits: (auth: AuthState, query: CustomerVisitQuery) =>
      db.$transaction(async (tx) => {
        const customer = await customerAction(tx, auth, 'visits.customer_change', now);
        const tenantId = customer.tenantId;
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const rows = await tx.visit.findMany({
          where: {
            tenantId,
            status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
            patient: {
              grants: {
                some: {
                  tenantId,
                  customerAccountId: customer.id,
                  scopes: { has: 'VIEW_VISITS' },
                  status: 'ACTIVE',
                  revokedAt: null,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
                },
              },
            },
            scheduledStartUtc: visitDateWindow(query, tenant.timezone),
            ...(query.cursor ? { id: { gt: query.cursor } } : {}),
          },
          select: {
            ...summary,
            changeRequests: {
              where: { requesterAccountId: customer.id },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: changeSummary,
            },
          },
          orderBy: { id: 'asc' },
          take: 21,
        });
        return {
          timezone: tenant.timezone,
          items: rows.slice(0, 20).map((row) => ({
            ...row,
            pendingChange: row.changeRequests.find((change) => change.status === 'PENDING') ?? null,
          })),
          nextCursor: rows.length > 20 ? rows[19]!.id : null,
        };
      }),
    customerVisitDetail: (auth: AuthState, visitId: string) =>
      db.$transaction(async (tx) => {
        const customer = await customerAction(tx, auth, 'visits.customer_change', now);
        const tenantId = customer.tenantId;
        const visit = await tx.visit.findFirst({
          where: {
            tenantId,
            id: visitId,
            status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
          },
          select: {
            ...summary,
            changeRequests: {
              where: { requesterAccountId: customer.id },
              orderBy: { createdAt: 'desc' },
              take: 100,
              select: changeSummary,
            },
          },
        });
        if (
          !visit ||
          !(await hasPatientGrant(tx, tenantId, customer.id, visit.patient.id, 'VIEW_VISITS', now))
        )
          throw missing();
        return {
          ...visit,
          pendingChange: visit.changeRequests.find((change) => change.status === 'PENDING') ?? null,
        };
      }),
  };
}

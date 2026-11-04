import type { Prisma } from '../../db/generated/prisma/client';
import type { AuthState } from '../auth/guards';
import { authorize } from '../auth/permissions';

/** Read authority, independent of event age/relevance. Never serializes resource content. */
export async function notificationTarget(
  tx: Prisma.TransactionClient,
  auth: AuthState,
  row: {
    tenantId: string;
    entityType: string;
    entityId: string;
  },
): Promise<string | null> {
  const { tenantId, entityId: id } = row;
  const customer = auth.session.principalType === 'AGENCY_CUSTOMER';
  const staff = customer
    ? null
    : await tx.staffAccount.findFirst({
        where: { tenantId, id: auth.session.principalId },
        select: { role: true },
      });
  const principal = {
    principalType: auth.session.principalType,
    tenantStatus: 'ACTIVE' as const,
    ...(staff ? { role: staff.role } : {}),
  };
  if (row.entityType === 'visit') {
    const visit = await tx.visit.findFirst({
      where: { tenantId, id },
      select: { patientId: true, assignedCaregiverId: true, status: true },
    });
    if (!visit) return null;
    if (customer && authorize(principal, 'visits.customer_change').allowed) {
      const grant = await tx.patientAccess.findFirst({
        where: {
          tenantId,
          patientId: visit.patientId,
          customerAccountId: auth.session.principalId,
          status: 'ACTIVE',
          revokedAt: null,
          scopes: { has: 'VIEW_VISITS' },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });
      return grant ? `/my/visits?visit=${id}` : null;
    }
    if (authorize(principal, 'visits.read').allowed) return `/workspace/visits?visit=${id}`;
    if (
      visit.assignedCaregiverId &&
      authorize(principal, 'visits.self_execute').allowed &&
      ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(visit.status)
    ) {
      const own = await tx.caregiver.findFirst({
        where: {
          tenantId,
          id: visit.assignedCaregiverId,
          staffAccountId: auth.session.principalId,
          operationalStatus: 'ACTIVE',
        },
        select: { id: true },
      });
      return own ? `/caregiver/visits?visit=${id}` : null;
    }
  }
  if (row.entityType === 'service_request') {
    const request = await tx.serviceRequest.findFirst({
      where: { tenantId, id },
      select: { customerAccountId: true },
    });
    if (!request) return null;
    if (customer)
      return request.customerAccountId === auth.session.principalId ? `/track?request=${id}` : null;
    if (authorize(principal, 'requests.review').allowed) return `/workspace/requests/${id}`;
  }
  if (
    row.entityType === 'caregiver' &&
    authorize(principal, 'caregivers.read').allowed &&
    (await tx.caregiver.findFirst({ where: { tenantId, id }, select: { id: true } }))
  )
    return `/workspace/caregivers?caregiver=${id}`;
  return null;
}

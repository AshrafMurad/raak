import type { Prisma } from '../../db/generated/prisma/client';
import type { NotificationEvent } from '../../contracts/notifications';
import { authorize } from '../auth/permissions';

export const DISPATCH_EVENT_KINDS = [
  'request.new', 'quote.responded', 'quote.revision_requested', 'visit.needs_review',
  'caregiver.exception_changed', 'visit.assigned', 'visit.change_approved',
] as const;
export interface Recipient {
  principalType: 'AGENCY_STAFF' | 'AGENCY_CUSTOMER'; principalId: string; email: string;
}
export interface Audience {
  eventType: NotificationEvent; entityType: string; entityId: string; recipients: Recipient[];
  obsolete?: boolean;
  blocked?: boolean;
}

/** Resource IDs are loaded within the event tenant; no payload authorizes a recipient. */
export async function resolveAudience(tx: Prisma.TransactionClient, event: {
  tenantId: string; eventType: string; aggregateId: string;
}, now: Date): Promise<Audience | null> {
  const { tenantId, aggregateId } = event;
  const tenant = await tx.tenant.findFirst({ where: { id: tenantId, status: 'ACTIVE' }, select: { id: true } });
  if (!tenant) return null;
  let eventType: NotificationEvent;
  let entityType: string;
  let entityId = aggregateId;
  let caregiverId: string | null = null;
  let patientId: string | null = null;
  let coordinators = false;
  switch (event.eventType) {
    case 'request.new': {
      if (!await tx.serviceRequest.findFirst({ where: { tenantId, id: aggregateId }, select: { id: true } })) return null;
      eventType = 'REQUEST_NEW'; entityType = 'service_request'; coordinators = true; break;
    }
    case 'quote.responded':
    case 'quote.revision_requested': {
      const revision = event.eventType === 'quote.revision_requested'
        ? await tx.quoteRevisionRequest.findFirst({ where: { tenantId, id: aggregateId }, select: { quoteId: true } }) : null;
      const quote = await tx.quote.findFirst({ where: { tenantId, id: revision?.quoteId ?? aggregateId }, select: { requestId: true } });
      if (!quote || (event.eventType === 'quote.revision_requested' && !revision)) return null;
      eventType = event.eventType === 'quote.responded' ? 'QUOTE_RESPONSE' : 'QUOTE_REVISION_REQUESTED';
      entityType = 'service_request'; entityId = quote.requestId; coordinators = true; break;
    }
    case 'caregiver.exception_changed': {
      if (!await tx.caregiver.findFirst({ where: { tenantId, id: aggregateId }, select: { id: true } })) return null;
      eventType = 'CAREGIVER_EXCEPTION'; entityType = 'caregiver'; coordinators = true; break;
    }
    case 'visit.assigned':
    case 'visit.needs_review': {
      const visit = await tx.visit.findFirst({ where: { tenantId, id: aggregateId }, select: { assignedCaregiverId: true, reviewStatus: true, status: true } });
      if (!visit) return null;
      eventType = event.eventType === 'visit.assigned' ? 'VISIT_ASSIGNED' : 'VISIT_NEEDS_REVIEW';
      entityType = 'visit'; caregiverId = eventType === 'VISIT_ASSIGNED' ? visit.assignedCaregiverId : null;
      if ((eventType === 'VISIT_ASSIGNED' && visit.status !== 'SCHEDULED') ||
          (eventType === 'VISIT_NEEDS_REVIEW' && visit.reviewStatus !== 'NEEDS_REVIEW'))
        return { eventType, entityType, entityId, recipients: [], obsolete: true };
      coordinators = eventType === 'VISIT_NEEDS_REVIEW'; break;
    }
    case 'visit.change_approved': {
      const change = await tx.visitChangeRequest.findFirst({ where: { tenantId, id: aggregateId, status: 'APPROVED' }, select: { visitId: true, type: true } });
      if (!change) return null;
      const visit = await tx.visit.findFirst({ where: { tenantId, id: change.visitId }, select: { id: true, patientId: true, assignedCaregiverId: true } });
      if (!visit) return null;
      eventType = change.type === 'CANCEL' ? 'VISIT_CANCELLED' : 'VISIT_CHANGED';
      entityType = 'visit'; entityId = visit.id; patientId = visit.patientId; caregiverId = visit.assignedCaregiverId; break;
    }
    default: return null;
  }
  const recipients: Recipient[] = [];
  if (coordinators) {
    const staff = await tx.staffAccount.findMany({ where: { tenantId, status: 'ACTIVE', emailVerifiedAt: { not: null },
      role: { in: ['AGENCY_OWNER', 'AGENCY_ADMIN', 'CARE_COORDINATOR'] } }, select: { id: true, role: true, emailNormalized: true } });
    for (const s of staff) if (authorize({ principalType: 'AGENCY_STAFF', role: s.role, tenantStatus: 'ACTIVE' }, 'notifications.receive').allowed)
      recipients.push({ principalType: 'AGENCY_STAFF', principalId: s.id, email: s.emailNormalized });
  }
  if (caregiverId) {
    const caregiver = await tx.caregiver.findFirst({ where: { tenantId, id: caregiverId, operationalStatus: 'ACTIVE' }, select: { staffAccountId: true } });
    const staff = caregiver?.staffAccountId ? await tx.staffAccount.findFirst({ where: { tenantId, id: caregiver.staffAccountId,
      role: 'CAREGIVER', status: 'ACTIVE', emailVerifiedAt: { not: null } }, select: { id: true, emailNormalized: true, role: true } }) : null;
    if (staff && authorize({ principalType: 'AGENCY_STAFF', role: staff.role, tenantStatus: 'ACTIVE' }, 'notifications.receive').allowed)
      recipients.push({ principalType: 'AGENCY_STAFF', principalId: staff.id, email: staff.emailNormalized });
  }
  if (patientId && authorize({ principalType: 'AGENCY_CUSTOMER', tenantStatus: 'ACTIVE' }, 'notifications.receive').allowed) {
    const grants = await tx.patientAccess.findMany({ where: { tenantId, patientId, status: 'ACTIVE', revokedAt: null,
      scopes: { has: 'VIEW_VISITS' }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      customer: { status: 'ACTIVE', emailVerifiedAt: { not: null } } }, select: { customerAccountId: true, customer: { select: { emailNormalized: true } } } });
    for (const grant of grants) recipients.push({ principalType: 'AGENCY_CUSTOMER', principalId: grant.customerAccountId, email: grant.customer.emailNormalized });
  }
  return { eventType, entityType, entityId, recipients,
    blocked: patientId !== null && !recipients.some((r) => r.principalType === 'AGENCY_CUSTOMER') };
}

import type { Prisma } from '../../db/generated/prisma/client';
import type { NotificationEvent } from '../../contracts/notifications';
import { authorize } from '../auth/permissions';
import { hashToken } from '../auth/crypto';

export const DISPATCH_EVENT_KINDS = [
  'request.new', 'quote.responded', 'quote.revision_requested', 'visit.needs_review',
  'caregiver.exception_changed', 'visit.assigned', 'visit.change_approved',
  'request.info_needed', 'quote.sent', 'quote.revision_sent',
  'visit.confirmed', 'visit.notification_changed', 'visit.reminder',
] as const;
export interface Recipient {
  principalType: 'AGENCY_STAFF' | 'AGENCY_CUSTOMER' | 'VERIFIED_GUEST'; principalId: string; email: string;
  locale?: 'ar' | 'en'; path?: string;
}
export interface Audience {
  eventType: NotificationEvent; entityType: string; entityId: string; recipients: Recipient[];
  obsolete?: boolean;
  blocked?: boolean;
  channel?: 'IN_APP' | 'EMAIL';
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
  let channel: 'IN_APP' | 'EMAIL' | undefined;
  switch (event.eventType) {
    case 'request.info_needed':
    case 'quote.sent':
    case 'quote.revision_sent': {
      const quote = event.eventType.startsWith('quote.') ? await tx.quote.findFirst({
        where: { tenantId, id: aggregateId }, select: { requestId: true, status: true, validUntil: true } }) : null;
      const request = await tx.serviceRequest.findFirst({ where: { tenantId, id: quote?.requestId ?? aggregateId },
        select: { id: true, status: true, customerAccountId: true, requesterEmailNormalized: true, locale: true } });
      if (!request || (event.eventType.startsWith('quote.') && !quote)) return null;
      eventType = event.eventType === 'request.info_needed' ? 'REQUEST_NEEDS_INFO' : event.eventType === 'quote.sent' ? 'QUOTE_SENT' : 'QUOTE_REVISION_SENT';
      entityType = 'service_request'; entityId = request.id;
      if ((quote && (quote.status !== 'SENT' || !quote.validUntil || quote.validUntil <= now)) ||
          (!quote && request.status !== 'AWAITING_CUSTOMER'))
        return { eventType, entityType, entityId, recipients: [], obsolete: true };
      const recipients: Recipient[] = [];
      if (request.customerAccountId) {
        const customer = await tx.customerAccount.findFirst({ where: { tenantId, id: request.customerAccountId, status: 'ACTIVE', emailVerifiedAt: { not: null } },
          select: { id: true, emailNormalized: true, notificationLocale: true } });
        if (customer && authorize({ principalType: 'AGENCY_CUSTOMER', tenantStatus: 'ACTIVE' }, 'notifications.receive').allowed)
          recipients.push({ principalType: 'AGENCY_CUSTOMER', principalId: customer.id, email: customer.emailNormalized,
            locale: customer.notificationLocale === 'en' ? 'en' : 'ar', path: `/track?request=${request.id}` });
      } else {
        const proof = await tx.guestActionToken.findFirst({ where: { tenantId, requestId: request.id, purpose: 'REQUEST_STATUS',
          consumedAt: { not: null }, emailHash: hashToken(request.requesterEmailNormalized) }, select: { id: true } });
        if (proof && authorize({ principalType: 'VERIFIED_GUEST', tenantStatus: 'ACTIVE' }, 'notifications.receive_email').allowed)
          recipients.push({ principalType: 'VERIFIED_GUEST', principalId: request.id, email: request.requesterEmailNormalized,
            locale: request.locale === 'en' ? 'en' : 'ar', path: `/track?request=${request.id}` });
      }
      return { eventType, entityType, entityId, recipients, blocked: recipients.length === 0 };
    }
    case 'visit.reminder': {
      const reminder = await tx.visitReminder.findFirst({ where: { tenantId, id: aggregateId } });
      if (!reminder || reminder.dueAt > now) return null;
      const visit = await tx.visit.findFirst({ where: { tenantId, id: reminder.visitId }, select: {
        status: true, reminderRevision: true, scheduledStartUtc: true, patientId: true, assignedCaregiverId: true } });
      if (!visit) return null;
      eventType = 'VISIT_REMINDER'; entityType = 'visit'; entityId = reminder.visitId;
      if (visit.status !== 'SCHEDULED' || visit.reminderRevision !== reminder.revision ||
          visit.scheduledStartUtc <= now || visit.scheduledStartUtc.getTime() !== reminder.scheduledStartUtc.getTime())
        return { eventType, entityType, entityId, recipients: [], obsolete: true };
      channel = reminder.channel === 'EMAIL' ? 'EMAIL' : 'IN_APP';
      patientId = visit.patientId; caregiverId = visit.assignedCaregiverId; break;
    }
    case 'visit.confirmed':
    case 'visit.notification_changed': {
      const visit = await tx.visit.findFirst({ where: { tenantId, id: aggregateId }, select: { status: true, patientId: true, assignedCaregiverId: true } });
      if (!visit) return null;
      eventType = event.eventType === 'visit.confirmed' ? 'VISIT_CONFIRMED' : 'VISIT_CHANGED'; entityType = 'visit';
      if (visit.status !== 'SCHEDULED') return { eventType, entityType, entityId, recipients: [], obsolete: true };
      patientId = visit.patientId; caregiverId = visit.assignedCaregiverId; break;
    }
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
      role: { in: ['AGENCY_OWNER', 'AGENCY_ADMIN', 'CARE_COORDINATOR'] } }, select: { id: true, role: true, emailNormalized: true, notificationLocale: true } });
    for (const s of staff) if (authorize({ principalType: 'AGENCY_STAFF', role: s.role, tenantStatus: 'ACTIVE' }, 'notifications.receive').allowed)
      recipients.push({ principalType: 'AGENCY_STAFF', principalId: s.id, email: s.emailNormalized, locale: s.notificationLocale === 'en' ? 'en' : 'ar',
        path: entityType === 'service_request' ? `/workspace/requests/${entityId}` : entityType === 'caregiver' ? `/workspace/caregivers?caregiver=${entityId}` : `/workspace/visits?visit=${entityId}` });
  }
  if (caregiverId) {
    const caregiver = await tx.caregiver.findFirst({ where: { tenantId, id: caregiverId, operationalStatus: 'ACTIVE' }, select: { staffAccountId: true } });
    const staff = caregiver?.staffAccountId ? await tx.staffAccount.findFirst({ where: { tenantId, id: caregiver.staffAccountId,
      role: 'CAREGIVER', status: 'ACTIVE', emailVerifiedAt: { not: null } }, select: { id: true, emailNormalized: true, role: true, notificationLocale: true } }) : null;
    if (staff && authorize({ principalType: 'AGENCY_STAFF', role: staff.role, tenantStatus: 'ACTIVE' }, 'notifications.receive').allowed)
      recipients.push({ principalType: 'AGENCY_STAFF', principalId: staff.id, email: staff.emailNormalized,
        locale: staff.notificationLocale === 'en' ? 'en' : 'ar', path: `/caregiver/visits?visit=${entityId}` });
  }
  if (patientId && authorize({ principalType: 'AGENCY_CUSTOMER', tenantStatus: 'ACTIVE' }, 'notifications.receive').allowed) {
    const grants = await tx.patientAccess.findMany({ where: { tenantId, patientId, status: 'ACTIVE', revokedAt: null,
      scopes: { has: 'VIEW_VISITS' }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      customer: { status: 'ACTIVE', emailVerifiedAt: { not: null } } }, select: { customerAccountId: true, customer: { select: { emailNormalized: true, notificationLocale: true } } } });
    for (const grant of grants) recipients.push({ principalType: 'AGENCY_CUSTOMER', principalId: grant.customerAccountId, email: grant.customer.emailNormalized,
      locale: grant.customer.notificationLocale === 'en' ? 'en' : 'ar', path: `/my/visits?visit=${entityId}` });
  }
  return { eventType, entityType, entityId, recipients,
    ...(channel ? { channel } : {}),
    blocked: eventType !== 'VISIT_REMINDER' && patientId !== null && !recipients.some((r) => r.principalType === 'AGENCY_CUSTOMER') };
}

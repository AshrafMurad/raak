import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { getPrisma } from '../../src/db/client';
import { replaceVisitReminders } from '../../src/modules/notifications/reminders';
import { dispatchNotificationEvent } from '../../src/modules/notifications/dispatcher';
import { deliverNotificationEmail } from '../../src/modules/notifications/delivery';
import { renderNotification } from '../../src/modules/notifications/templates';
import { hashToken } from '../../src/modules/auth/crypto';

const db = getPrisma();
const booked = new Date('2027-01-01T08:00:00Z');
async function fixture(hours = 48) {
  const tenant = await db.tenant.create({ data: { slug: `reminder-${randomUUID()}`, legalName: 'Synthetic', displayName: 'Synthetic agency',
    status: 'ACTIVE', timezone: 'Asia/Riyadh', currency: 'SAR', supportEmail: 'synthetic@example.invalid' } });
  const staff = await db.staffAccount.create({ data: { tenantId: tenant.id, emailNormalized: 'caregiver@example.invalid', passwordHash: 'unused', role: 'CAREGIVER', status: 'ACTIVE', emailVerifiedAt: booked } });
  const caregiver = await db.caregiver.create({ data: { tenantId: tenant.id, staffAccountId: staff.id, name: 'Synthetic caregiver', professionalCategory: 'Synthetic', operationalStatus: 'ACTIVE' } });
  const patient = await db.patient.create({ data: { tenantId: tenant.id, displayName: 'Synthetic private beneficiary', normalizedName: 'synthetic', areaId: 'central' } });
  const service = await db.agencyService.create({ data: { tenantId: tenant.id, slug: 'synthetic', config: {} } });
  const visit = await db.visit.create({ data: { tenantId: tenant.id, patientId: patient.id, agencyServiceId: service.id, assignedCaregiverId: caregiver.id,
    status: 'SCHEDULED', areaId: 'central', serviceNameSnapshot: {}, timezoneSnapshot: 'Asia/Riyadh',
    scheduledStartUtc: new Date(booked.getTime() + hours * 3600000), scheduledEndUtc: new Date(booked.getTime() + (hours + 1) * 3600000) } });
  const replace = async (at = booked) => db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenant.id}::uuid FOR UPDATE`;
    await replaceVisitReminders(tx, tenant.id, visit.id, at);
  });
  return { tenantId: tenant.id, visit, staff, replace };
}

it('schedules exact default deadlines once per generation and never dispatches early', async () => {
  const f = await fixture(); await f.replace();
  const rows = await db.visitReminder.findMany({ where: { tenantId: f.tenantId, visitId: f.visit.id }, orderBy: [{ channel: 'asc' }, { offsetMin: 'desc' }] });
  expect(rows).toHaveLength(4);
  expect(rows.map((r) => r.dueAt.toISOString())).toEqual(['2027-01-02T08:00:00.000Z', '2027-01-03T06:00:00.000Z', '2027-01-02T08:00:00.000Z', '2027-01-03T06:00:00.000Z']);
  await dispatchNotificationEvent(db, rows[0]!.id, () => booked);
  expect(await db.notificationDelivery.count({ where: { tenantId: f.tenantId } })).toBe(0);
  const due = () => new Date('2027-01-02T08:00:00Z');
  await Promise.all([dispatchNotificationEvent(db, rows[0]!.id, due), dispatchNotificationEvent(db, rows[0]!.id, due)]);
  expect(await db.notificationDelivery.count({ where: { tenantId: f.tenantId, eventId: rows[0]!.id } })).toBe(1);
  let sent = 0;
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId: f.tenantId } });
  await deliverNotificationEmail({ db, tenantId: f.tenantId, deliveryId: delivery.id, now: due,
    render: () => ({ subject: 'Synthetic', text: 'Synthetic' }) });
  const blocked = await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  expect(blocked.status).toBe('PENDING'); expect(blocked.attempts).toBe(0); expect(blocked.lastErrorCode).toBe('EMAIL_NOT_CONFIGURED');
  await db.notificationDelivery.update({ where: { id: delivery.id }, data: { retryAt: due() } });
  await deliverNotificationEmail({ db, tenantId: f.tenantId, deliveryId: delivery.id, now: due,
    render: (event, context) => renderNotification(event, { ...context!, url: 'https://synthetic.example.invalid/ar/caregiver/visits' }), send: async () => { sent++; } });
  expect(sent).toBe(1);
});

it('skips offsets at/inside booking time, and invalidates queued old-generation emails on reschedule/cancel', async () => {
  const inside = await fixture(2); await inside.replace();
  expect(await db.visitReminder.count({ where: { tenantId: inside.tenantId } })).toBe(0);
  const f = await fixture(3); await f.replace();
  const rows = await db.visitReminder.findMany({ where: { tenantId: f.tenantId, channel: 'EMAIL' } });
  expect(rows).toHaveLength(1);
  const due = () => new Date('2027-01-01T09:00:00Z');
  await dispatchNotificationEvent(db, rows[0]!.id, due);
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId: f.tenantId } });
  await db.visit.update({ where: { id: f.visit.id }, data: { scheduledStartUtc: new Date('2027-01-04T08:00:00Z'), scheduledEndUtc: new Date('2027-01-04T09:00:00Z') } });
  await f.replace(due());
  expect((await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe('SKIPPED');
  let sent = 0;
  await deliverNotificationEmail({ db, tenantId: f.tenantId, deliveryId: delivery.id, now: due, render: () => ({ subject: 'Synthetic', text: 'Synthetic' }), send: async () => { sent++; } });
  expect(sent).toBe(0);
  await db.visit.update({ where: { id: f.visit.id }, data: { status: 'CANCELLED' } });
  await f.replace(due());
  expect(await db.outboxEvent.count({ where: { tenantId: f.tenantId, eventType: 'visit.reminder', processedAt: null } })).toBe(0);
});

it('honors per-channel custom offsets, current opt-outs, suspension and cancelled/started state', async () => {
  const f = await fixture();
  const owner = await db.staffAccount.create({ data: { tenantId: f.tenantId, emailNormalized: 'owner@example.invalid', passwordHash: 'unused', role: 'AGENCY_OWNER', status: 'ACTIVE', emailVerifiedAt: booked } });
  await db.notificationPolicy.create({ data: { tenantId: f.tenantId, eventType: 'VISIT_REMINDER', channel: 'EMAIL', enabled: true, reminderOffsetMin: 60, updatedBy: owner.id } });
  await f.replace();
  const email = await db.visitReminder.findFirstOrThrow({ where: { tenantId: f.tenantId, channel: 'EMAIL' } });
  expect(email.dueAt.toISOString()).toBe('2027-01-03T07:00:00.000Z');
  expect(await db.visitReminder.count({ where: { tenantId: f.tenantId } })).toBe(3);
  const due = () => email.dueAt;
  await db.tenant.update({ where: { id: f.tenantId }, data: { status: 'SUSPENDED' } });
  await dispatchNotificationEvent(db, email.id, due);
  expect(await db.notificationDelivery.count({ where: { tenantId: f.tenantId } })).toBe(0);
  await db.tenant.update({ where: { id: f.tenantId }, data: { status: 'ACTIVE' } });
  await dispatchNotificationEvent(db, email.id, due);
  const row = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId: f.tenantId } });
  await db.notificationPreference.create({ data: { tenantId: f.tenantId, principalType: 'AGENCY_STAFF', principalId: f.staff.id,
    eventType: 'VISIT_REMINDER', channel: 'EMAIL', optedOut: true } });
  let sent = 0;
  await deliverNotificationEmail({ db, tenantId: f.tenantId, deliveryId: row.id, now: due,
    render: () => ({ subject: 'Synthetic', text: 'Synthetic' }), send: async () => { sent++; } });
  expect(sent).toBe(0);
  expect((await db.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('SKIPPED');
  for (const status of ['CANCELLED', 'IN_PROGRESS']) {
    await db.visit.update({ where: { id: f.visit.id }, data: { status } });
    const event = await db.outboxEvent.create({ data: { tenantId: f.tenantId, aggregateId: email.id, eventType: 'visit.reminder', payloadMinimal: {} } });
    await dispatchNotificationEvent(db, event.id, due);
    expect(await db.notification.count({ where: { tenantId: f.tenantId, eventId: event.id } })).toBe(0);
  }
});

it('serializes replacement generations and rechecks relevance after claiming, immediately before send', async () => {
  const f = await fixture();
  await Promise.all([f.replace(), f.replace()]);
  const current = await db.visit.findUniqueOrThrow({ where: { id: f.visit.id } });
  expect(current.reminderRevision).toBe(2);
  const reminders = await db.visitReminder.findMany({ where: { tenantId: f.tenantId, revision: 2 } });
  expect(reminders).toHaveLength(4);
  expect(await db.outboxEvent.count({ where: { tenantId: f.tenantId, processedAt: null } })).toBe(4);
  const reminder = reminders.find((r) => r.channel === 'EMAIL' && r.offsetMin === 1440)!;
  let at = reminder.dueAt;
  const now = () => at;
  await dispatchNotificationEvent(db, reminder.id, now);
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId: f.tenantId, eventId: reminder.id } });
  let sent = 0;
  await deliverNotificationEmail({ db, tenantId: f.tenantId, deliveryId: delivery.id, now,
    render: () => { at = current.scheduledStartUtc; return { subject: 'Synthetic', text: 'Synthetic' }; },
    send: async () => { sent++; } });
  expect(sent).toBe(0);
  expect((await db.notificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).not.toBe('SENT');
});

it('delivers request-only guest updates only after matching email proof, without an inbox or patient authority', async () => {
  const f = await fixture();
  const req = await db.serviceRequest.create({ data: { tenantId: f.tenantId, agencyServiceId: f.visit.agencyServiceId,
    reference: randomUUID(), idempotencyKey: randomUUID(), payloadHash: 'synthetic', requesterName: 'Synthetic requester',
    requesterEmailNormalized: 'guest@example.invalid', requesterPhone: '', beneficiaryName: 'Private synthetic beneficiary',
    relationship: 'OTHER', areaId: 'central', preferredWindowJson: {}, notesRestricted: 'Private synthetic notes',
    locale: 'en', privacyVersion: 'synthetic', serviceSnapshot: {}, priceAcknowledged: false, status: 'AWAITING_CUSTOMER' } });
  const event = await db.outboxEvent.create({ data: { tenantId: f.tenantId, aggregateId: req.id, eventType: 'request.info_needed', payloadMinimal: {} } });
  const now = () => new Date();
  await dispatchNotificationEvent(db, event.id, now);
  expect(await db.notificationDelivery.count({ where: { tenantId: f.tenantId } })).toBe(0);
  expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt).toBeNull();
  await db.guestActionToken.create({ data: { tenantId: f.tenantId, requestId: req.id, purpose: 'REQUEST_STATUS', tokenHash: randomUUID(),
    emailHash: hashToken(req.requesterEmailNormalized), expiresAt: new Date('2027-02-01'), consumedAt: now() } });
  await dispatchNotificationEvent(db, event.id, now);
  const delivery = await db.notificationDelivery.findFirstOrThrow({ where: { tenantId: f.tenantId } });
  expect(delivery.principalType).toBe('VERIFIED_GUEST');
  expect(await db.notification.count({ where: { tenantId: f.tenantId } })).toBe(0);
  const content: string[] = [];
  await deliverNotificationEmail({ db, tenantId: f.tenantId, deliveryId: delivery.id, now,
    render: (type, context) => { expect(context?.locale).toBe('en'); expect(context?.path).toBe(`/track?request=${req.id}`);
      return renderNotification(type, { ...context!, url: 'https://synthetic.example.invalid/en/track' }); },
    send: async (mail) => { content.push(mail.text); } });
  expect(content).toHaveLength(1); expect(content[0]).not.toContain('Private synthetic');
  expect(await db.patientAccess.count({ where: { tenantId: f.tenantId } })).toBe(0);
  // Event tenant never authorizes another tenant's request, even with its verified proof.
  const b = await fixture();
  const forged = await db.outboxEvent.create({ data: { tenantId: b.tenantId, aggregateId: req.id, eventType: 'request.info_needed', payloadMinimal: {} } });
  await dispatchNotificationEvent(db, forged.id, now);
  expect(await db.notificationDelivery.count({ where: { tenantId: b.tenantId } })).toBe(0);
});

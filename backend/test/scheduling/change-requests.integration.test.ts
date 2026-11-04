// Sprint 6 customer visit change requests (BR-CHG, F09): grant-gated
// single-occurrence CANCEL/RESCHEDULE, server cutoff classification, one
// pending per visit, original-appointment preservation, transactional
// approval rechecks through the scheduling hard filters, conflicts leaving
// the request pending (I12/I13/I14), races, timezone boundaries and the
// scheduling-policy settings surface. Synthetic data only.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';
import { classifyUrgency } from '../../src/modules/scheduling/change-request.service';

const db = getPrisma();
const slug = `changes-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
let currentNow = new Date('2026-11-20T09:00:00Z');
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
  db,
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => currentNow,
});

let tenantId: string;
let otherTenantId: string;
let owner: { cookie: string; csrf: string };
let coordinator1: { cookie: string; csrf: string };
let coordinator2: { cookie: string; csrf: string };
let caregiverId: string;
let patient1: string;
let patient2: string;
let serviceId: string;
let customerId: string;
let customer: { cookie: string; csrf: string };
let foreignCustomer: { cookie: string; csrf: string };
let grantP1: string;

const serviceConfig = {
  nameAr: 'خدمة تغييرات اصطناعية',
  nameEn: 'Synthetic change service',
  summaryAr: 'ملخص',
  summaryEn: 'Summary',
  descriptionAr: 'وصف اصطناعي',
  descriptionEn: 'Synthetic only',
  durationMin: 60,
  clinicalClass: 'NON_CLINICAL',
  requiredQualificationCodes: [],
  serviceAreaIds: ['central'],
  allowStandalone: true,
  allowRecurring: true,
  pricingType: 'CUSTOM_QUOTE',
  priceMinor: null,
  pricingUnit: null,
};

async function staffSession(principalId: string) {
  const created = await createSession(db, {
    principalId,
    principalType: 'AGENCY_STAFF',
    tenantId,
    sessionVersion: 0,
    // The suite freezes the clock at 2026-11-20; a real-clock 1h session
    // would already read as expired inside that workflow, so use 30 days.
    ttlSeconds: 2_592_000,
  });
  return { cookie: `raak_session_agency=${created.sessionToken}`, csrf: created.csrfToken };
}

async function createStaff(
  email: string,
  role: 'AGENCY_OWNER' | 'CARE_COORDINATOR' | 'CAREGIVER',
  tenant = tenantId,
) {
  return db.staffAccount.create({
    data: {
      tenantId: tenant,
      emailNormalized: email,
      passwordHash: 'unused',
      role,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
}

async function customerSession(principalId: string, tenant = tenantId) {
  const created = await createSession(db, {
    principalId,
    principalType: 'AGENCY_CUSTOMER',
    tenantId: tenant,
    sessionVersion: 0,
    ttlSeconds: 2_592_000,
  });
  return { cookie: `raak_session_agency=${created.sessionToken}`, csrf: created.csrfToken };
}

function call(
  method: 'get' | 'post' | 'put' | 'patch',
  path: string,
  actor: { cookie: string; csrf: string },
  body?: object,
  extraHeaders?: Record<string, string>,
  requestHost = host,
) {
  const req = request(app)
    [method](`/v1${path}`)
    .set('Host', requestHost)
    .set('Cookie', actor.cookie);
  if (method !== 'get') req.set('X-CSRF-Token', actor.csrf);
  for (const [key, value] of Object.entries(extraHeaders ?? {})) req.set(key, value);
  return req.send(body ?? {});
}

const idKey = () => `synthetic-key-${randomUUID().slice(0, 12)}-${randomUUID().slice(0, 12)}`;

let occurrence = 0;

async function createVisit(
  start: string,
  end: string,
  input: {
    status?: string;
    caregiverId?: string | null;
    patientId?: string;
    carePlanId?: string | null;
    planVersionId?: string | null;
    occurrenceKey?: string | null;
  } = {},
) {
  occurrence += 1;
  return db.visit.create({
    data: {
      tenantId,
      patientId: input.patientId ?? patient1,
      agencyServiceId: serviceId,
      carePlanId: input.carePlanId ?? null,
      planVersionId: input.planVersionId ?? null,
      occurrenceKey: input.occurrenceKey ?? `changes-${occurrence}-${randomUUID()}`,
      assignedCaregiverId: input.caregiverId === undefined ? caregiverId : input.caregiverId,
      areaId: 'central',
      serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
      scheduledStartUtc: new Date(start),
      scheduledEndUtc: new Date(end),
      timezoneSnapshot: 'Asia/Riyadh',
      status: input.status ?? 'SCHEDULED',
    },
  });
}

beforeAll(async () => {
  tenantId = (
    await db.tenant.create({
      data: {
        slug,
        legalName: 'Synthetic Change Tests',
        displayName: 'Synthetic',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: 'support@example.invalid',
      },
    })
  ).id;
  const ownerRow = await createStaff('owner@example.invalid', 'AGENCY_OWNER');
  owner = await staffSession(ownerRow.id);
  coordinator1 = await staffSession(
    (await createStaff('coord1@example.invalid', 'CARE_COORDINATOR')).id,
  );
  coordinator2 = await staffSession(
    (await createStaff('coord2@example.invalid', 'CARE_COORDINATOR')).id,
  );
  const caregiverStaff = await createStaff('caregiver@example.invalid', 'CAREGIVER');
  caregiverId = (
    await db.caregiver.create({
      data: {
        tenantId,
        staffAccountId: caregiverStaff.id,
        name: 'Synthetic change caregiver',
        professionalCategory: 'Synthetic',
        operationalStatus: 'ACTIVE',
        serviceAreasJson: ['central'],
      },
    })
  ).id;
  patient1 = (
    await db.patient.create({
      data: {
        tenantId,
        displayName: 'Synthetic Change Patient One',
        normalizedName: 'synthetic change patient one',
        areaId: 'central',
      },
    })
  ).id;
  patient2 = (
    await db.patient.create({
      data: {
        tenantId,
        displayName: 'Synthetic Change Patient Two',
        normalizedName: 'synthetic change patient two',
        areaId: 'central',
      },
    })
  ).id;
  serviceId = (
    await db.agencyService.create({
      data: { tenantId, slug: `changes-${randomUUID()}`, config: serviceConfig },
    })
  ).id;
  await db.caregiverServiceAuthorization.create({
    data: {
      tenantId,
      caregiverId,
      agencyServiceId: serviceId,
      authorizedAt: new Date(),
      authorizedBy: ownerRow.id,
    },
  });
  for (let weekday = 0; weekday < 7; weekday++)
    await db.availabilitySlot.create({
      data: {
        tenantId,
        caregiverId,
        weekday,
        localStartTime: '08:00',
        localEndTime: '18:00',
      },
    });
  const customerRow = await db.customerAccount.create({
    data: {
      tenantId,
      emailNormalized: 'change-customer@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  customerId = customerRow.id;
  customer = await customerSession(customerId);
  grantP1 = (
    await db.patientAccess.create({
      data: {
        tenantId,
        patientId: patient1,
        customerAccountId: customerId,
        scopes: ['VIEW_BASIC', 'VIEW_VISITS', 'MANAGE_VISITS'],
        authorizationType: 'AGENCY_VERIFIED_AUTHORITY',
        verifiedByStaffId: ownerRow.id,
        verifiedAt: new Date(),
      },
    })
  ).id;
  await db.patientAccess.create({
    data: {
      tenantId,
      patientId: patient2,
      customerAccountId: customerId,
      scopes: ['VIEW_VISITS'],
      authorizationType: 'AGENCY_VERIFIED_AUTHORITY',
      verifiedByStaffId: ownerRow.id,
      verifiedAt: new Date(),
    },
  });
  // Second tenant (Europe/Berlin, DST-capable) for isolation + DST-gap cases.
  const otherSlug = `changes-iso-${randomUUID().slice(0, 8)}`;
  otherTenantId = (
    await db.tenant.create({
      data: {
        slug: otherSlug,
        legalName: 'Synthetic Berlin Tenant',
        displayName: 'Synthetic',
        status: 'ACTIVE',
        timezone: 'Europe/Berlin',
        currency: 'EUR',
        supportEmail: 'support@example.invalid',
      },
    })
  ).id;
  const foreignCustomerRow = await db.customerAccount.create({
    data: {
      tenantId: otherTenantId,
      emailNormalized: 'berlin-customer@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  await createStaff('berlin-owner@example.invalid', 'AGENCY_OWNER', otherTenantId);
  foreignCustomer = await customerSession(foreignCustomerRow.id, otherTenantId);
});

afterAll(async () => {
  for (const tenant of [tenantId, otherTenantId]) {
    await db.visitReview.deleteMany({ where: { tenantId: tenant } });
    await db.visitChangeRequest.deleteMany({ where: { tenantId: tenant } });
    await db.visitNote.deleteMany({ where: { tenantId: tenant } });
    await db.visitTask.deleteMany({ where: { tenantId: tenant } });
    await db.visitAssignmentHistory.deleteMany({ where: { tenantId: tenant } });
    await db.visit.deleteMany({ where: { tenantId: tenant } });
    await db.carePlanVersion.deleteMany({ where: { tenantId: tenant } });
    await db.carePlan.deleteMany({ where: { tenantId: tenant } });
    await db.availabilitySlot.deleteMany({ where: { tenantId: tenant } });
    await db.caregiverServiceAuthorization.deleteMany({ where: { tenantId: tenant } });
    await db.caregiver.deleteMany({ where: { tenantId: tenant } });
    await db.patientAccess.deleteMany({ where: { tenantId: tenant } });
    await db.patient.deleteMany({ where: { tenantId: tenant } });
    await db.agencyService.deleteMany({ where: { tenantId: tenant } });
    await db.customerAccount.deleteMany({ where: { tenantId: tenant } });
    await db.idempotencyKey.deleteMany({ where: { tenantId: tenant } });
    await db.authSession.deleteMany({ where: { tenantId: tenant } });
    await db.staffAccount.deleteMany({ where: { tenantId: tenant } });
    await db.auditEvent.deleteMany({ where: { tenantId: tenant } });
    await db.outboxEvent.deleteMany({ where: { tenantId: tenant } });
    await db.tenant.delete({ where: { id: tenant } });
  }
});

describe('cutoff classification (pure)', () => {
  it('classifies the exact cutoff boundary as NORMAL and anything later as LATE', () => {
    const start = new Date('2026-11-21T09:00:00Z');
    expect(classifyUrgency(new Date('2026-11-20T09:00:00Z'), start, 24)).toBe('NORMAL');
    expect(classifyUrgency(new Date('2026-11-20T09:00:01Z'), start, 24)).toBe('LATE');
    expect(classifyUrgency(new Date('2026-11-21T08:59:59Z'), start, 0)).toBe('NORMAL');
    expect(classifyUrgency(new Date('2026-11-21T09:00:00Z'), start, 0)).toBe('NORMAL');
  });
});

describe('submission authorization and semantics', () => {
  it('requires an exact MANAGE_VISITS grant for the visit patient', async () => {
    const visit = await createVisit('2026-11-24T06:00:00Z', '2026-11-24T07:00:00Z');
    // No grant at all (unrelated patient of the same tenant): privacy-safe 404.
    const stranger = await customerSession(
      (
        await db.customerAccount.create({
          data: {
            tenantId,
            emailNormalized: `${randomUUID()}@example.invalid`,
            passwordHash: 'unused',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
          },
        })
      ).id,
    );
    expect(
      (
        await call('post', `/portal/my/visits/${visit.id}/change-requests`, stranger, {
          type: 'CANCEL',
          reason: 'Synthetic cancellation reason for testing.',
        })
      ).status,
    ).toBe(404);
    // VIEW_VISITS alone never confers change authority.
    const p2Visit = await createVisit('2026-11-24T06:00:00Z', '2026-11-24T07:00:00Z', {
      patientId: patient2,
    });
    expect(
      (
        await call('post', `/portal/my/visits/${p2Visit.id}/change-requests`, customer, {
          type: 'CANCEL',
          reason: 'Synthetic cancellation reason for testing.',
        })
      ).status,
    ).toBe(404);
    // The authorized patient succeeds.
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic cancellation reason for testing.',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      visitId: visit.id,
      type: 'CANCEL',
      status: 'PENDING',
      urgency: 'NORMAL',
    });
  });

  it('keeps the original appointment untouched while pending (I12)', async () => {
    const visit = await createVisit('2026-11-25T06:00:00Z', '2026-11-25T07:00:00Z');
    const before = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'RESCHEDULE',
      proposedDate: '2026-11-26',
      proposedTime: '10:00',
      reason: 'Synthetic reschedule reason for testing.',
    });
    const after = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(after.scheduledStartUtc).toEqual(before.scheduledStartUtc);
    expect(after.scheduledEndUtc).toEqual(before.scheduledEndUtc);
    expect(after.status).toBe('SCHEDULED');
    expect(after.assignedCaregiverId).toBe(caregiverId);
    expect(after.version).toBe(before.version);
  });

  it('allows only one pending request per visit, including parallel submissions', async () => {
    const visit = await createVisit('2026-11-25T06:00:00Z', '2026-11-25T07:00:00Z');
    const first = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic first cancellation reason.',
    });
    expect(first.status).toBe(201);
    const second = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'RESCHEDULE',
      proposedDate: '2026-11-26',
      proposedTime: '10:00',
      reason: 'Synthetic second reschedule reason.',
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CHANGE_REQUEST_PENDING');
    // Parallel duplicate submissions on a fresh visit: exactly one wins.
    const race = await createVisit('2026-11-25T08:00:00Z', '2026-11-25T09:00:00Z');
    const [a, b] = await Promise.allSettled([
      call('post', `/portal/my/visits/${race.id}/change-requests`, customer, {
        type: 'CANCEL',
        reason: 'Synthetic parallel submission one.',
      }),
      call('post', `/portal/my/visits/${race.id}/change-requests`, customer, {
        type: 'CANCEL',
        reason: 'Synthetic parallel submission two.',
      }),
    ]);
    const statuses = [a, b].map((result) =>
      result.status === 'fulfilled' ? result.value.status : -1,
    );
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);
  });

  it('withdraws a pending request and keeps the visit; non-pending withdraw is refused', async () => {
    const visit = await createVisit('2026-11-23T06:00:00Z', '2026-11-23T07:00:00Z');
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic withdrawable cancellation reason.',
    });
    expect(created.status).toBe(201);
    const withdrawn = await call(
      'post',
      `/portal/my/visit-change-requests/${created.body.data.id}/withdraw`,
      customer,
      {},
    );
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.data).toMatchObject({ status: 'WITHDRAWN' });
    const visitRow = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(visitRow.status).toBe('SCHEDULED');
    expect(
      (
        await call(
          'post',
          `/portal/my/visit-change-requests/${created.body.data.id}/withdraw`,
          customer,
          {},
        )
      ).status,
    ).toBe(409);
    // A new request may be submitted after withdrawal.
    const again = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic post-withdrawal cancellation reason.',
    });
    expect(again.status).toBe(201);
  });

  it('refuses non-future, unconfirmed or completed visits and invalid proposals', async () => {
    const past = await createVisit('2026-11-19T06:00:00Z', '2026-11-19T07:00:00Z');
    expect(
      (
        await call('post', `/portal/my/visits/${past.id}/change-requests`, customer, {
          type: 'CANCEL',
          reason: 'Synthetic past visit cancellation reason.',
        })
      ).status,
    ).toBe(409);
    const planned = await createVisit('2026-11-27T06:00:00Z', '2026-11-27T07:00:00Z', {
      status: 'PLANNED',
      caregiverId: null,
    });
    expect(
      (
        await call('post', `/portal/my/visits/${planned.id}/change-requests`, customer, {
          type: 'CANCEL',
          reason: 'Synthetic planned visit cancellation reason.',
        })
      ).status,
    ).toBe(409);
    const sameTime = await createVisit('2026-11-27T08:00:00Z', '2026-11-27T09:00:00Z');
    expect(
      (
        await call('post', `/portal/my/visits/${sameTime.id}/change-requests`, customer, {
          type: 'RESCHEDULE',
          proposedDate: '2026-11-27',
          proposedTime: '11:00',
          reason: 'Synthetic identical-time reschedule reason.',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call('post', `/portal/my/visits/${sameTime.id}/change-requests`, customer, {
          type: 'RESCHEDULE',
          // 2026-11-19 10:00 Riyadh precedes the frozen clock (past proposal).
          proposedDate: '2026-11-19',
          proposedTime: '10:00',
          reason: 'Synthetic past-proposal reschedule reason.',
        })
      ).status,
    ).toBe(422);
  });

  it('rejects a proposed local time inside a DST gap (timezone recheck)', async () => {
    const foreignPatient = await db.patient.create({
      data: {
        tenantId: otherTenantId,
        displayName: 'Synthetic Berlin Patient',
        normalizedName: 'synthetic berlin patient',
        areaId: 'central',
      },
    });
    const berlinCustomer = (
      await db.customerAccount.findFirstOrThrow({ where: { tenantId: otherTenantId } })
    ).id;
    await db.patientAccess.create({
      data: {
        tenantId: otherTenantId,
        patientId: foreignPatient.id,
        customerAccountId: berlinCustomer,
        scopes: ['VIEW_VISITS', 'MANAGE_VISITS'],
        authorizationType: 'AGENCY_VERIFIED_AUTHORITY',
        verifiedByStaffId: (
          await db.staffAccount.findFirstOrThrow({ where: { tenantId: otherTenantId } })
        ).id,
        verifiedAt: new Date(),
      },
    });
    const berlinService = await db.agencyService.create({
      data: { tenantId: otherTenantId, slug: `berlin-${randomUUID()}`, config: serviceConfig },
    });
    const berlinVisit = await db.visit.create({
      data: {
        tenantId: otherTenantId,
        patientId: foreignPatient.id,
        agencyServiceId: berlinService.id,
        areaId: 'central',
        serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
        scheduledStartUtc: new Date('2027-04-01T08:00:00Z'),
        scheduledEndUtc: new Date('2027-04-01T09:00:00Z'),
        timezoneSnapshot: 'Europe/Berlin',
        status: 'SCHEDULED',
      },
    });
    const response = await call(
      'post',
      `/portal/my/visits/${berlinVisit.id}/change-requests`,
      foreignCustomer,
      {
        type: 'RESCHEDULE',
        // 2027-03-28 02:30 Europe/Berlin does not exist (spring-forward gap).
        proposedDate: '2027-03-28',
        proposedTime: '02:30',
        reason: 'Synthetic DST-gap reschedule reason.',
      },
      undefined,
      `${(await db.tenant.findUniqueOrThrow({ where: { id: otherTenantId } })).slug}.localhost`,
    );
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('RECURRENCE_TIME_INVALID');
    expect(
      await db.visitChangeRequest.count({
        where: { tenantId: otherTenantId, visitId: berlinVisit.id },
      }),
    ).toBe(0);
  });
});

describe('late classification and policy gate (I14)', () => {
  it('classifies late requests server-side and queues them for priority review', async () => {
    const visit = await createVisit('2026-11-21T09:00:00Z', '2026-11-21T10:00:00Z');
    // Exactly at the 24h cutoff the request is still NORMAL.
    currentNow = new Date('2026-11-20T09:00:00Z');
    const boundary = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic boundary cancellation reason.',
    });
    // (A pending request now exists; withdraw it to reuse the visit cleanly.)
    expect(boundary.status).toBe(201);
    expect(boundary.body.data.urgency).toBe('NORMAL');
    await call(
      'post',
      `/portal/my/visit-change-requests/${boundary.body.data.id}/withdraw`,
      customer,
      {},
    );
    // One minute past the cutoff: LATE, still submissible with allowLateReview.
    currentNow = new Date('2026-11-20T09:01:00Z');
    const late = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic late cancellation reason.',
    });
    expect(late.status).toBe(201);
    expect(late.body.data.urgency).toBe('LATE');
    const queue = await call(
      'get',
      '/agency/visit-change-requests?status=PENDING&urgency=LATE',
      coordinator1,
    );
    expect(queue.status).toBe(200);
    expect(queue.body.data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: late.body.data.id, urgency: 'LATE' })]),
    );
    // No direct mutation ever happens from submission alone.
    const visitRow = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(visitRow.status).toBe('SCHEDULED');
  });

  it('refuses late submissions when the tenant disabled late review', async () => {
    const settings = await call('get', '/agency/settings', owner);
    expect(settings.status).toBe(200);
    const patched = await call('patch', '/agency/settings', owner, {
      expectedVersion: settings.body.data.settingsVersion,
      travelBufferMin: 30,
      changeCancelCutoffHours: 24,
      changeRescheduleCutoffHours: 24,
      allowLateReview: false,
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data.allowLateReview).toBe(false);
    const visit = await createVisit('2026-11-21T09:00:00Z', '2026-11-21T10:00:00Z');
    // currentNow (2026-11-20T09:01Z) is one minute past this visit's 24h cutoff.
    const refused = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic refused late cancellation reason.',
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('CHANGE_CUTOFF_EXCEEDED');
    expect(await db.visitChangeRequest.count({ where: { tenantId, visitId: visit.id } })).toBe(0);
    // Restore the default policy for the remaining flows.
    const restored = await call('patch', '/agency/settings', owner, {
      expectedVersion: patched.body.data.settingsVersion,
      travelBufferMin: 30,
      changeCancelCutoffHours: 24,
      changeRescheduleCutoffHours: 24,
      allowLateReview: true,
    });
    expect(restored.status).toBe(200);
    currentNow = new Date('2026-11-20T09:00:00Z');
  });
});

describe('coordinator decisions', () => {
  it('approves a cancellation transactionally with idempotent replay', async () => {
    const visit = await createVisit('2026-11-24T06:00:00Z', '2026-11-24T07:00:00Z');
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic approved cancellation reason.',
    });
    const key = idKey();
    const approved = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': key },
    );
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({
      changeRequestId: created.body.data.id,
      type: 'CANCEL',
      status: 'APPROVED',
    });
    const visitRow = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(visitRow.status).toBe('CANCELLED');
    expect(visitRow.cancelledReason).toBe('Synthetic approved cancellation reason.');
    const replay = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': key },
    );
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual(approved.body.data);
    const conflictingKey = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': idKey() },
    );
    expect(conflictingKey.status).toBe(409);
    const audits = await db.auditEvent.count({
      where: { tenantId, subjectId: created.body.data.id, action: 'visit.change_approved' },
    });
    expect(audits).toBe(1);
  });

  it('keeps the request pending and the original unchanged on a conflicting reschedule (I13)', async () => {
    const visit = await createVisit('2026-11-25T06:00:00Z', '2026-11-25T07:00:00Z');
    // An existing assignment occupies the proposed window exactly.
    const conflict = await createVisit('2026-11-26T07:00:00Z', '2026-11-26T08:00:00Z');
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'RESCHEDULE',
      proposedDate: '2026-11-26',
      proposedTime: '10:00',
      reason: 'Synthetic conflicting reschedule reason.',
    });
    expect(created.status).toBe(201);
    const before = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    const approval = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': idKey() },
    );
    expect(approval.status).toBe(409);
    expect(approval.body.error.code).toBe('SCHEDULE_CONFLICT');
    const requestRow = await db.visitChangeRequest.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(requestRow.status).toBe('PENDING');
    const after = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(after.scheduledStartUtc).toEqual(before.scheduledStartUtc);
    expect(after.version).toBe(before.version);
    expect(after.status).toBe('SCHEDULED');
    // Removing the conflict lets the same request approve cleanly.
    await db.visit.delete({ where: { tenantId, id: conflict.id } });
    const retried = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': idKey() },
    );
    expect(retried.status).toBe(200);
    const moved = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(moved.scheduledStartUtc.toISOString()).toBe('2026-11-26T07:00:00.000Z');
    expect(moved.scheduledEndUtc.toISOString()).toBe('2026-11-26T08:00:00.000Z');
    expect(moved.assignedCaregiverId).toBe(caregiverId);
  });

  it('preserves sibling occurrences and plan history on a single-occurrence reschedule', async () => {
    const plan = await db.carePlan.create({
      data: {
        tenantId,
        patientId: patient1,
        agencyServiceId: serviceId,
        status: 'ACTIVE',
        currentVersion: 1,
      },
    });
    const planVersion = await db.carePlanVersion.create({
      data: {
        tenantId,
        carePlanId: plan.id,
        version: 1,
        status: 'ACTIVATED',
        validFrom: '2026-11-20',
        validUntil: '2026-12-20',
        weekdaysJson: [2, 3],
        localStartTime: '09:00',
        durationMin: 60,
        taskTemplatesJson: [],
        timezoneSnapshot: 'Asia/Riyadh',
        activatedAt: currentNow,
      },
    });
    const target = await createVisit('2026-11-25T06:00:00Z', '2026-11-25T07:00:00Z', {
      carePlanId: plan.id,
      planVersionId: planVersion.id,
      occurrenceKey: 'sprint6-sibling-1',
    });
    const sibling = await createVisit('2026-11-26T06:00:00Z', '2026-11-26T07:00:00Z', {
      carePlanId: plan.id,
      planVersionId: planVersion.id,
      occurrenceKey: 'sprint6-sibling-2',
    });
    const created = await call('post', `/portal/my/visits/${target.id}/change-requests`, customer, {
      type: 'RESCHEDULE',
      proposedDate: '2026-11-30',
      proposedTime: '09:00',
      reason: 'Synthetic single-occurrence reschedule reason.',
    });
    const approved = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': idKey() },
    );
    expect(approved.status).toBe(200);
    const moved = await db.visit.findUniqueOrThrow({ where: { id: target.id } });
    expect(moved.scheduledStartUtc.toISOString()).toBe('2026-11-30T06:00:00.000Z');
    expect(moved.occurrenceKey).toBe('sprint6-sibling-1');
    const untouched = await db.visit.findUniqueOrThrow({ where: { id: sibling.id } });
    expect(untouched.scheduledStartUtc.toISOString()).toBe('2026-11-26T06:00:00.000Z');
    expect(untouched.status).toBe('SCHEDULED');
    const planRow = await db.carePlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(planRow.currentVersion).toBe(1);
    expect(await db.carePlanVersion.count({ where: { tenantId, carePlanId: plan.id } })).toBe(1);
  });

  it('rejects with a reason and keeps the original booking', async () => {
    const visit = await createVisit('2026-11-25T06:00:00Z', '2026-11-25T07:00:00Z');
    const before = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'RESCHEDULE',
      proposedDate: '2026-11-27',
      proposedTime: '09:00',
      reason: 'Synthetic rejected reschedule reason.',
    });
    const missingKey = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/reject`,
      coordinator1,
      { reason: 'Synthetic missing key decision.' },
    );
    expect(missingKey.status).toBe(422);
    const decisionKey = idKey();
    const rejected = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/reject`,
      coordinator1,
      { reason: 'Synthetic rejection reason: caregiver unavailable that week.' },
      { 'Idempotency-Key': decisionKey },
    );
    expect(rejected.status).toBe(200);
    expect(rejected.body.data).toMatchObject({ status: 'REJECTED' });
    const replay = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/reject`,
      coordinator1,
      { reason: 'Synthetic rejection reason: caregiver unavailable that week.' },
      { 'Idempotency-Key': decisionKey },
    );
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual(rejected.body.data);
    const changedReason = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/reject`,
      coordinator1,
      { reason: 'A different synthetic rejection reason.' },
      { 'Idempotency-Key': decisionKey },
    );
    expect(changedReason.status).toBe(409);
    expect(changedReason.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(
      await db.auditEvent.count({
        where: { tenantId, subjectId: created.body.data.id, action: 'visit.change_rejected' },
      }),
    ).toBe(1);
    const after = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(after.scheduledStartUtc).toEqual(before.scheduledStartUtc);
    expect(after.status).toBe('SCHEDULED');
    expect(
      (
        await call(
          'post',
          `/agency/visit-change-requests/${created.body.data.id}/reject`,
          coordinator1,
          {
            reason: 'Synthetic duplicate rejection reason.',
          },
          { 'Idempotency-Key': idKey() },
        )
      ).status,
    ).toBe(409);
  });

  it('rechecks requester authority at approval after a grant revocation', async () => {
    const visit = await createVisit('2026-11-25T06:00:00Z', '2026-11-25T07:00:00Z');
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic revocation-test cancellation reason.',
    });
    await db.patientAccess.update({
      where: { id: grantP1 },
      data: { status: 'REVOKED', revokedAt: currentNow },
    });
    const approval = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': idKey() },
    );
    expect(approval.status).toBe(409);
    expect(approval.body.error.code).toBe('STATE_TRANSITION_INVALID');
    expect(
      (
        await call(
          'post',
          `/portal/my/visit-change-requests/${created.body.data.id}/withdraw`,
          customer,
          {},
        )
      ).status,
    ).toBe(404);
    const visitRow = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(visitRow.status).toBe('SCHEDULED');
    // The coordinator can still resolve the stuck request by rejecting it.
    expect(
      (
        await call(
          'post',
          `/agency/visit-change-requests/${created.body.data.id}/reject`,
          coordinator1,
          {
            reason: 'Synthetic post-revocation rejection reason.',
          },
          { 'Idempotency-Key': idKey() },
        )
      ).status,
    ).toBe(200);
    await db.patientAccess.update({
      where: { id: grantP1 },
      data: { status: 'ACTIVE', revokedAt: null },
    });
  });

  it('resolves exactly one of two parallel approvals (race)', async () => {
    const visit = await createVisit('2026-11-25T06:00:00Z', '2026-11-25T07:00:00Z');
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic raced cancellation reason.',
    });
    const [a, b] = await Promise.allSettled([
      call(
        'post',
        `/agency/visit-change-requests/${created.body.data.id}/approve`,
        coordinator1,
        {},
        { 'Idempotency-Key': idKey() },
      ),
      call(
        'post',
        `/agency/visit-change-requests/${created.body.data.id}/approve`,
        coordinator2,
        {},
        { 'Idempotency-Key': idKey() },
      ),
    ]);
    const results = [a, b].map((entry) => (entry.status === 'fulfilled' ? entry.value : null));
    expect(results.filter((entry) => entry?.status === 200)).toHaveLength(1);
    expect(results.filter((entry) => entry?.status === 409)).toHaveLength(1);
    const requestRow = await db.visitChangeRequest.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(requestRow.status).toBe('APPROVED');
    expect(
      await db.auditEvent.count({
        where: { tenantId, subjectId: created.body.data.id, action: 'visit.change_approved' },
      }),
    ).toBe(1);
  });
});

describe('completion interplay', () => {
  it('serializes cancellation approval against assigned-caregiver start', async () => {
    const visit = await createVisit('2026-12-05T06:00:00Z', '2026-12-05T07:00:00Z');
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic concurrent cancellation.',
    });
    expect(created.status).toBe(201);
    const caregiver = await db.caregiver.findUniqueOrThrow({ where: { id: caregiverId } });
    const actor = await staffSession(caregiver.staffAccountId!);
    const [approval, start] = await Promise.all([
      call(
        'post',
        `/agency/visit-change-requests/${created.body.data.id}/approve`,
        coordinator1,
        {},
        { 'Idempotency-Key': idKey() },
      ),
      call('post', `/caregiver/my/visits/${visit.id}/start`, actor, {}),
    ]);
    expect([approval.status, start.status].sort()).toEqual([200, 409]);
    const result = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
    expect(result.status).toBe(approval.status === 200 ? 'CANCELLED' : 'IN_PROGRESS');
  });
  it('blocks change submission once the visit completed and approval of stale requests', async () => {
    // (a) complete first: submission is refused for a non-SCHEDULED visit.
    const completedVisit = await createVisit('2026-11-25T06:00:00Z', '2026-11-25T07:00:00Z');
    await db.visit.update({
      where: { tenantId, id: completedVisit.id },
      data: { status: 'IN_PROGRESS', actualStartAt: currentNow },
    });
    await db.visit.update({
      where: { tenantId, id: completedVisit.id },
      data: { status: 'COMPLETED', actualEndAt: currentNow },
    });
    expect(
      (
        await call('post', `/portal/my/visits/${completedVisit.id}/change-requests`, customer, {
          type: 'CANCEL',
          reason: 'Synthetic post-completion cancellation attempt.',
        })
      ).status,
    ).toBe(409);
    // (b) submit first: the request survives but approval refuses the
    // completed state and leaves the request pending for rejection.
    const visit = await createVisit('2026-11-25T08:00:00Z', '2026-11-25T09:00:00Z');
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic pre-completion cancellation reason.',
    });
    expect(created.status).toBe(201);
    await db.visit.update({
      where: { tenantId, id: visit.id },
      data: { status: 'IN_PROGRESS', actualStartAt: currentNow },
    });
    await db.visit.update({
      where: { tenantId, id: visit.id },
      data: { status: 'COMPLETED', actualEndAt: currentNow },
    });
    const approval = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': idKey() },
    );
    expect(approval.status).toBe(409);
    expect(approval.body.error.code).toBe('STATE_TRANSITION_INVALID');
    const requestRow = await db.visitChangeRequest.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(requestRow.status).toBe('PENDING');
  });
});

describe('customer visit projections', () => {
  it('rejects a patient conflict even when the other appointment has a different caregiver', async () => {
    const target = await createVisit('2026-12-08T06:00:00Z', '2026-12-08T07:00:00Z');
    const other = await db.caregiver.create({
      data: {
        tenantId,
        name: 'Synthetic different provider',
        professionalCategory: 'Synthetic',
        operationalStatus: 'ACTIVE',
        serviceAreasJson: ['central'],
      },
    });
    await createVisit('2026-12-09T06:00:00Z', '2026-12-09T07:00:00Z', { caregiverId: other.id });
    const created = await call('post', `/portal/my/visits/${target.id}/change-requests`, customer, {
      type: 'RESCHEDULE',
      proposedDate: '2026-12-09',
      proposedTime: '09:00',
      reason: 'Synthetic patient conflict test.',
    });
    expect(created.status).toBe(201);
    const result = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': idKey() },
    );
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('SCHEDULE_CONFLICT');
    expect(
      (await db.visitChangeRequest.findUniqueOrThrow({ where: { id: created.body.data.id } }))
        .status,
    ).toBe('PENDING');
    expect(
      (await db.visit.findUniqueOrThrow({ where: { id: target.id } })).scheduledStartUtc,
    ).toEqual(target.scheduledStartUtc);
  });
  it('rechecks availability and timezone at approval and keeps the request actionable', async () => {
    const target = await createVisit('2026-12-11T06:00:00Z', '2026-12-11T07:00:00Z');
    const created = await call('post', `/portal/my/visits/${target.id}/change-requests`, customer, {
      type: 'RESCHEDULE',
      proposedDate: '2026-12-12',
      proposedTime: '23:00',
      reason: 'Synthetic unavailable hours test.',
    });
    expect(created.status).toBe(201);
    const unavailable = await call(
      'post',
      `/agency/visit-change-requests/${created.body.data.id}/approve`,
      coordinator1,
      {},
      { 'Idempotency-Key': idKey() },
    );
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error.code).toBe('CAREGIVER_UNAVAILABLE');
    await db.tenant.update({ where: { id: tenantId }, data: { timezone: 'Asia/Dubai' } });
    try {
      const staleZone = await call(
        'post',
        `/agency/visit-change-requests/${created.body.data.id}/approve`,
        coordinator1,
        {},
        { 'Idempotency-Key': idKey() },
      );
      expect(staleZone.status).toBe(409);
      expect(staleZone.body.error.code).toBe('STATE_TRANSITION_INVALID');
    } finally {
      await db.tenant.update({ where: { id: tenantId }, data: { timezone: 'Asia/Riyadh' } });
    }
    expect(
      (await db.visitChangeRequest.findUniqueOrThrow({ where: { id: created.body.data.id } }))
        .status,
    ).toBe('PENDING');
  });
  it('lists only granted patients and excludes revoked grants', async () => {
    const own = await createVisit('2026-11-27T06:00:00Z', '2026-11-27T07:00:00Z');
    const viewOnly = await createVisit('2026-11-27T06:00:00Z', '2026-11-27T07:00:00Z', {
      patientId: patient2,
    });
    const patient3 = (
      await db.patient.create({
        data: {
          tenantId,
          displayName: 'Synthetic Change Patient Three',
          normalizedName: 'synthetic change patient three',
          areaId: 'central',
        },
      })
    ).id;
    const ungranted = await createVisit('2026-11-27T06:00:00Z', '2026-11-27T07:00:00Z', {
      patientId: patient3,
    });
    // Scope this assertion to its fixture day. A random UUID may legitimately
    // place these visits on a later cursor page of the full synthetic tenant.
    const list = await call('get', '/portal/my/visits?from=2026-11-27&to=2026-11-27', customer);
    expect(list.status).toBe(200);
    const ids = list.body.data.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(own.id);
    // VIEW_VISITS is sufficient for the summary list (but never for changes).
    expect(ids).toContain(viewOnly.id);
    expect(ids).not.toContain(ungranted.id);
    const detail = await call('get', `/portal/my/visits/${own.id}`, customer);
    expect(detail.status).toBe(200);
    expect(detail.body.data.patient.id).toBe(patient1);
    expect(detail.body.data).not.toHaveProperty('notes');
    expect((await call('get', `/portal/my/visits/${ungranted.id}`, customer)).status).toBe(404);
    // Revoking the grant removes the summary immediately.
    await db.patientAccess.update({
      where: { id: grantP1 },
      data: { status: 'REVOKED', revokedAt: currentNow },
    });
    const revoked = await call('get', '/portal/my/visits?from=2026-11-27&to=2026-11-27', customer);
    expect(revoked.body.data.items.map((item: { id: string }) => item.id)).not.toContain(own.id);
    expect((await call('get', `/portal/my/visits/${own.id}`, customer)).status).toBe(404);
    await db.patientAccess.update({
      where: { id: grantP1 },
      data: { status: 'ACTIVE', revokedAt: null },
    });
  });

  it('keeps cross-tenant visits and change requests invisible (I01)', async () => {
    // A visit of tenant B requested through tenant A's customer session.
    const foreignVisit = await db.visit.findFirstOrThrow({
      where: { tenantId: otherTenantId },
    });
    const otherHost = `${(await db.tenant.findUniqueOrThrow({ where: { id: otherTenantId } })).slug}.localhost`;
    const foreignChange = await call(
      'post',
      `/portal/my/visits/${foreignVisit.id}/change-requests`,
      foreignCustomer,
      { type: 'CANCEL', reason: 'Synthetic foreign change request.' },
      undefined,
      otherHost,
    );
    expect(foreignChange.status).toBe(201);
    expect(
      (
        await call(
          'post',
          `/agency/visit-change-requests/${foreignChange.body.data.id}/approve`,
          coordinator1,
          {},
          { 'Idempotency-Key': idKey() },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          'post',
          `/agency/visit-change-requests/${foreignChange.body.data.id}/reject`,
          coordinator1,
          { reason: 'Synthetic foreign rejection attempt.' },
          { 'Idempotency-Key': idKey() },
        )
      ).status,
    ).toBe(404);
    expect((await call('get', `/portal/my/visits/${foreignVisit.id}`, customer)).status).toBe(404);
    expect(
      (
        await call('post', `/portal/my/visits/${foreignVisit.id}/change-requests`, customer, {
          type: 'CANCEL',
          reason: 'Synthetic cross-tenant cancellation attempt.',
        })
      ).status,
    ).toBe(404);
    // A tenant-A change request is invisible to tenant B's staff (none
    // exist there) and to A's customer in another customer's request.
    const visit = await createVisit('2026-11-27T08:00:00Z', '2026-11-27T09:00:00Z');
    const created = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic isolation cancellation reason.',
    });
    const stranger = await customerSession(
      (
        await db.customerAccount.create({
          data: {
            tenantId,
            emailNormalized: `${randomUUID()}@example.invalid`,
            passwordHash: 'unused',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
          },
        })
      ).id,
    );
    expect(
      (
        await call(
          'post',
          `/portal/my/visit-change-requests/${created.body.data.id}/withdraw`,
          stranger,
          {},
        )
      ).status,
    ).toBe(404);
  });
});

describe('scheduling policy settings', () => {
  it('validates bounds, versions and reader/writer split', async () => {
    const read = await call('get', '/agency/settings', coordinator1);
    expect(read.status).toBe(200);
    const version = read.body.data.settingsVersion;
    expect(
      (
        await call('patch', '/agency/settings', owner, {
          expectedVersion: version,
          travelBufferMin: 121,
          changeCancelCutoffHours: 24,
          changeRescheduleCutoffHours: 24,
          allowLateReview: true,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call('patch', '/agency/settings', owner, {
          expectedVersion: version,
          travelBufferMin: 30,
          changeCancelCutoffHours: 200,
          changeRescheduleCutoffHours: 24,
          allowLateReview: true,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call('patch', '/agency/settings', owner, {
          expectedVersion: version - 1,
          travelBufferMin: 30,
          changeCancelCutoffHours: 24,
          changeRescheduleCutoffHours: 24,
          allowLateReview: true,
        })
      ).status,
    ).toBe(409);
    const updated = await call('patch', '/agency/settings', owner, {
      expectedVersion: version,
      travelBufferMin: 30,
      changeCancelCutoffHours: 12,
      changeRescheduleCutoffHours: 6,
      allowLateReview: true,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      changeCancelCutoffHours: 12,
      changeRescheduleCutoffHours: 6,
      settingsVersion: version + 1,
    });
    // Coordinators read; they cannot write; caregivers can neither.
    expect(
      (
        await call('patch', '/agency/settings', coordinator1, {
          expectedVersion: version + 1,
          travelBufferMin: 30,
          changeCancelCutoffHours: 12,
          changeRescheduleCutoffHours: 6,
          allowLateReview: true,
        })
      ).status,
    ).toBe(403);
    // Cutoffs now apply at submission (12h cancel cutoff).
    const visit = await createVisit('2026-11-21T02:00:00Z', '2026-11-21T03:00:00Z');
    const lateNow = new Date('2026-11-20T15:00:00Z');
    const previous = currentNow;
    currentNow = lateNow;
    const late = await call('post', `/portal/my/visits/${visit.id}/change-requests`, customer, {
      type: 'CANCEL',
      reason: 'Synthetic 12h-cutoff cancellation reason.',
    });
    expect(late.status).toBe(201);
    expect(late.body.data.urgency).toBe('LATE');
    currentNow = previous;
  });

  it('flags and heals prospective conflicts when the travel buffer changes (BR-SCH)', async () => {
    // Isolated window: a 45-minute gap between the two visits conflicts at a
    // 60-minute buffer and heals at 30. Other earlier synthetic rows may also
    // be flagged; the assertions stay scoped to this pair.
    const first = await createVisit('2026-11-29T06:00:00Z', '2026-11-29T07:00:00Z');
    const second = await createVisit('2026-11-29T07:45:00Z', '2026-11-29T08:45:00Z');
    const read = await call('get', '/agency/settings', owner);
    const flaggedBefore = await db.visit.count({
      where: { tenantId, status: 'SCHEDULED', assignmentHealth: 'NEEDS_REASSIGNMENT' },
    });
    const raised = await call('patch', '/agency/settings', owner, {
      expectedVersion: read.body.data.settingsVersion,
      travelBufferMin: 60,
      changeCancelCutoffHours: 12,
      changeRescheduleCutoffHours: 6,
      allowLateReview: true,
    });
    expect(raised.status).toBe(200);
    expect(raised.body.data.impact.flagged).toBeGreaterThanOrEqual(2);
    const flaggedAfter = await db.visit.count({
      where: { tenantId, status: 'SCHEDULED', assignmentHealth: 'NEEDS_REASSIGNMENT' },
    });
    expect(raised.body.data.impact.flagged).toBe(flaggedAfter - flaggedBefore);
    for (const visit of [first, second]) {
      const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
      expect(row.assignmentHealth).toBe('NEEDS_REASSIGNMENT');
    }
    const lowered = await call('patch', '/agency/settings', owner, {
      expectedVersion: raised.body.data.settingsVersion,
      travelBufferMin: 30,
      changeCancelCutoffHours: 12,
      changeRescheduleCutoffHours: 6,
      allowLateReview: true,
    });
    expect(lowered.status).toBe(200);
    expect(lowered.body.data.impact.healed).toBeGreaterThanOrEqual(2);
    const stillFlagged = await db.visit.count({
      where: { tenantId, status: 'SCHEDULED', assignmentHealth: 'NEEDS_REASSIGNMENT' },
    });
    expect(lowered.body.data.impact.healed).toBe(flaggedAfter - stillFlagged);
    for (const visit of [first, second]) {
      const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
      expect(row.assignmentHealth).toBe('OK');
    }
  });
});

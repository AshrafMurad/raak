import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';

/**
 * ADR-0012 decision 8: only ACTIVE parent care plans permit candidate lookup
 * and new assignment; retained PLANNED visits under DRAFT/PAUSED/COMPLETED/
 * CANCELLED plans are not newly assignable (409 STATE_TRANSITION_INVALID,
 * privacy-safe); standalone PLANNED visits remain assignable; pause/cancel
 * with KEEP never silently cancels confirmed SCHEDULED visits.
 */
const db = getPrisma();
const slug = `plan-lifecycle-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
  db,
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => new Date('2026-11-02T12:00:00Z'),
});

let tenantId: string;
let ownerId: string;
let owner: { cookie: string; csrf: string };
let patientId: string;
let serviceId: string;
let occurrence = 0;

const serviceConfig = {
  nameAr: 'خدمة دورة حياة الخطة اصطناعية',
  nameEn: 'Synthetic plan-lifecycle service',
  summaryAr: 'ملخص',
  summaryEn: 'Summary',
  descriptionAr: 'وصف اصطناعي',
  descriptionEn: 'Synthetic only',
  durationMin: 60,
  clinicalClass: 'CLINICAL',
  requiredQualificationCodes: ['SYNTHETIC_LICENSE'],
  serviceAreaIds: ['central'],
  allowStandalone: true,
  allowRecurring: true,
  pricingType: 'CUSTOM_QUOTE',
  priceMinor: null,
  pricingUnit: null,
};

async function session(principalId: string) {
  const created = await createSession(db, {
    principalId,
    principalType: 'AGENCY_STAFF',
    tenantId,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  return { cookie: `raak_session_agency=${created.sessionToken}`, csrf: created.csrfToken };
}

const post = (path: string, body: object, key?: string) => {
  const call = request(app)
    .post(`/v1${path}`)
    .set('Host', host)
    .set('Cookie', owner.cookie)
    .set('X-CSRF-Token', owner.csrf);
  if (key) call.set('Idempotency-Key', key);
  return call.send(body);
};

/** Rejects only via the approved stable code; no plan or patient content in the error. */
function expectPrivacySafeConflict(
  response: { status: number; body: { error?: { code?: string } } },
  planId: string,
) {
  expect(response.status).toBe(409);
  expect(response.body.error?.code).toBe('STATE_TRANSITION_INVALID');
  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toContain(planId);
  expect(serialized).not.toContain('Synthetic lifecycle patient');
}

async function createCaregiver(name: string) {
  const staff = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: `${randomUUID()}@example.invalid`,
      passwordHash: 'unused',
      role: 'CAREGIVER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const caregiver = await db.caregiver.create({
    data: {
      tenantId,
      staffAccountId: staff.id,
      name,
      professionalCategory: 'Synthetic nurse',
      operationalStatus: 'ACTIVE',
      serviceAreasJson: ['central'],
    },
  });
  await db.caregiverQualification.create({
    data: {
      tenantId,
      caregiverId: caregiver.id,
      code: 'SYNTHETIC_LICENSE',
      licenseIssuer: 'Synthetic board',
      licenseNumberRestricted: randomUUID(),
      validThrough: '2027-12-31',
      status: 'VERIFIED',
      verifiedBy: ownerId,
      verifiedAt: new Date(),
    },
  });
  await db.caregiverServiceAuthorization.create({
    data: {
      tenantId,
      caregiverId: caregiver.id,
      agencyServiceId: serviceId,
      authorizedAt: new Date(),
      authorizedBy: ownerId,
    },
  });
  await db.availabilitySlot.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({
      tenantId,
      caregiverId: caregiver.id,
      weekday,
      localStartTime: '08:00',
      localEndTime: '18:00',
    })),
  });
  return caregiver;
}

async function createPlan(status: string) {
  const plan = await db.carePlan.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      status,
      currentVersion: 1,
    },
  });
  const version = await db.carePlanVersion.create({
    data: {
      tenantId,
      carePlanId: plan.id,
      version: 1,
      status: status === 'DRAFT' ? 'DRAFT' : 'ACTIVATED',
      validFrom: '2026-12-01',
      validUntil: '2026-12-31',
      weekdaysJson: [0, 1, 2, 3, 4, 5, 6],
      localStartTime: '09:00',
      durationMin: 60,
      taskTemplatesJson: [],
      timezoneSnapshot: 'Asia/Riyadh',
    },
  });
  return { plan, version };
}

async function createVisitFor(
  plan: { id: string; versionId: string } | null,
  start: string,
  end: string,
  input: { status?: string; caregiverId?: string | null } = {},
) {
  occurrence += 1;
  return db.visit.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      carePlanId: plan?.id ?? null,
      planVersionId: plan?.versionId ?? null,
      occurrenceKey: plan ? `test-${occurrence}-${randomUUID()}` : null,
      assignedCaregiverId: input.caregiverId ?? null,
      areaId: 'central',
      serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
      scheduledStartUtc: new Date(start),
      scheduledEndUtc: new Date(end),
      timezoneSnapshot: 'Asia/Riyadh',
      status: input.status ?? 'PLANNED',
    },
  });
}

beforeAll(async () => {
  tenantId = (
    await db.tenant.create({
      data: {
        slug,
        legalName: 'Synthetic Plan Lifecycle Tests',
        displayName: 'Synthetic Lifecycle',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: 'support@example.invalid',
        travelBufferMin: 30,
      },
    })
  ).id;
  const ownerRow = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: 'owner@example.invalid',
      passwordHash: 'unused',
      role: 'AGENCY_OWNER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  ownerId = ownerRow.id;
  owner = await session(ownerId);
  patientId = (
    await db.patient.create({
      data: {
        tenantId,
        displayName: 'Synthetic lifecycle patient',
        normalizedName: 'synthetic lifecycle patient',
        areaId: 'central',
      },
    })
  ).id;
  serviceId = (
    await db.agencyService.create({
      data: { tenantId, slug: `lifecycle-${randomUUID()}`, config: serviceConfig },
    })
  ).id;
});

afterAll(async () => {
  await db.visitAssignmentHistory.deleteMany({ where: { tenantId } });
  await db.visitTask.deleteMany({ where: { tenantId } });
  await db.visitReminder.deleteMany({ where: { tenantId } });
  await db.visit.deleteMany({ where: { tenantId } });
  await db.carePlanVersion.deleteMany({ where: { tenantId } });
  await db.carePlan.deleteMany({ where: { tenantId } });
  await db.availabilityException.deleteMany({ where: { tenantId } });
  await db.availabilitySlot.deleteMany({ where: { tenantId } });
  await db.caregiverServiceAuthorization.deleteMany({ where: { tenantId } });
  await db.caregiverQualification.deleteMany({ where: { tenantId } });
  await db.caregiver.deleteMany({ where: { tenantId } });
  await db.idempotencyKey.deleteMany({ where: { tenantId } });
  await db.patient.deleteMany({ where: { tenantId } });
  await db.agencyService.deleteMany({ where: { tenantId } });
  await db.authSession.deleteMany({ where: { tenantId } });
  await db.staffAccount.deleteMany({ where: { tenantId } });
  await db.auditEvent.deleteMany({ where: { tenantId } });
  await db.outboxEvent.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
});

it('an ACTIVE parent plan permits assignment of its PLANNED visit', async () => {
  const caregiver = await createCaregiver('Lifecycle active caregiver');
  const { plan, version } = await createPlan('ACTIVE');
  const visit = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-01T06:00:00Z',
    '2026-12-01T07:00:00Z',
  );
  const response = await post(
    `/agency/visits/${visit.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-active-key-0001',
  );
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    visitId: visit.id,
    status: 'SCHEDULED',
    assignedCaregiverId: caregiver.id,
    version: 2,
    assignmentHealth: 'OK',
  });
});

it('a DRAFT parent plan rejects new assignment with the stable conflict code', async () => {
  const caregiver = await createCaregiver('Lifecycle draft caregiver');
  const { plan, version } = await createPlan('DRAFT');
  const visit = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-02T06:00:00Z',
    '2026-12-02T07:00:00Z',
  );
  const response = await post(
    `/agency/visits/${visit.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-draft-key-0001',
  );
  expectPrivacySafeConflict(response, plan.id);
  const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(row.status).toBe('PLANNED');
  expect(row.assignedCaregiverId).toBeNull();
  expect(await db.visitAssignmentHistory.count({ where: { tenantId, visitId: visit.id } })).toBe(0);
});

it('a PAUSED parent plan rejects new assignment with the stable conflict code', async () => {
  const caregiver = await createCaregiver('Lifecycle paused caregiver');
  const { plan, version } = await createPlan('PAUSED');
  const visit = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-03T06:00:00Z',
    '2026-12-03T07:00:00Z',
  );
  const response = await post(
    `/agency/visits/${visit.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-paused-key-0001',
  );
  expectPrivacySafeConflict(response, plan.id);
  const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(row.status).toBe('PLANNED');
  expect(row.assignedCaregiverId).toBeNull();
});

it('a COMPLETED parent plan rejects new assignment with the stable conflict code', async () => {
  const caregiver = await createCaregiver('Lifecycle completed caregiver');
  const { plan, version } = await createPlan('COMPLETED');
  const visit = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-04T06:00:00Z',
    '2026-12-04T07:00:00Z',
  );
  const response = await post(
    `/agency/visits/${visit.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-completed-key-0001',
  );
  expectPrivacySafeConflict(response, plan.id);
  const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(row.status).toBe('PLANNED');
  expect(row.assignedCaregiverId).toBeNull();
});

it('a CANCELLED parent plan rejects new assignment with the stable conflict code', async () => {
  const caregiver = await createCaregiver('Lifecycle cancelled caregiver');
  const { plan, version } = await createPlan('CANCELLED');
  const visit = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-05T06:00:00Z',
    '2026-12-05T07:00:00Z',
  );
  const response = await post(
    `/agency/visits/${visit.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-cancelled-key-0001',
  );
  expectPrivacySafeConflict(response, plan.id);
  const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(row.status).toBe('PLANNED');
  expect(row.assignedCaregiverId).toBeNull();
});

it('a standalone PLANNED visit without a parent plan remains assignable', async () => {
  const caregiver = await createCaregiver('Lifecycle standalone caregiver');
  const visit = await createVisitFor(null, '2026-12-08T06:00:00Z', '2026-12-08T07:00:00Z');
  const response = await post(
    `/agency/visits/${visit.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-standalone-key-0001',
  );
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({
    status: 'SCHEDULED',
    assignedCaregiverId: caregiver.id,
  });
});

it('candidate lookup works for an ACTIVE parent and rejects an inactive parent', async () => {
  const caregiver = await createCaregiver('Lifecycle candidate caregiver');
  const active = await createPlan('ACTIVE');
  const activeVisit = await createVisitFor(
    { id: active.plan.id, versionId: active.version.id },
    '2026-12-09T06:00:00Z',
    '2026-12-09T07:00:00Z',
  );
  const allowed = await post(`/agency/visits/${activeVisit.id}/candidates`, {});
  expect(allowed.status).toBe(200);
  expect(allowed.body.data.advisory).toBe(true);
  expect(allowed.body.data.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ caregiverId: caregiver.id })]),
  );
  const paused = await createPlan('PAUSED');
  const pausedVisit = await createVisitFor(
    { id: paused.plan.id, versionId: paused.version.id },
    '2026-12-10T06:00:00Z',
    '2026-12-10T07:00:00Z',
  );
  const denied = await post(`/agency/visits/${pausedVisit.id}/candidates`, {});
  expectPrivacySafeConflict(denied, paused.plan.id);
});

it('pause with KEEP preserves the SCHEDULED visit but blocks later assignment of retained PLANNED visits', async () => {
  const caregiver = await createCaregiver('Lifecycle pause-keep caregiver');
  const { plan, version } = await createPlan('ACTIVE');
  const scheduled = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-11T06:00:00Z',
    '2026-12-11T07:00:00Z',
  );
  const assigned = await post(
    `/agency/visits/${scheduled.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-pause-keep-assign-1',
  );
  expect(assigned.status).toBe(200);
  const planned = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-11T08:00:00Z',
    '2026-12-11T09:00:00Z',
  );
  const paused = await post(`/agency/care-plans/${plan.id}/pause`, {
    plannedVisitsAction: 'KEEP',
  });
  expect(paused.status).toBe(200);
  expect(paused.body.data).toMatchObject({ id: plan.id, status: 'PAUSED', cancelledVisits: 0 });
  const keptRow = await db.visit.findUniqueOrThrow({ where: { id: scheduled.id } });
  expect(keptRow.status).toBe('SCHEDULED');
  expect(keptRow.assignedCaregiverId).toBe(caregiver.id);
  expect(keptRow.assignmentHealth).toBe('OK');
  const rejected = await post(
    `/agency/visits/${planned.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-pause-keep-assign-2',
  );
  expectPrivacySafeConflict(rejected, plan.id);
  const row = await db.visit.findUniqueOrThrow({ where: { id: planned.id } });
  expect(row.status).toBe('PLANNED');
  expect(row.assignedCaregiverId).toBeNull();
});

it('pause and assignment serialize with only the two approved outcomes', async () => {
  const caregiver = await createCaregiver('Lifecycle pause-race caregiver');
  const { plan, version } = await createPlan('ACTIVE');
  const visit = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-15T06:00:00Z',
    '2026-12-15T07:00:00Z',
  );
  const [assignReply, pauseReply] = await Promise.all([
    post(
      `/agency/visits/${visit.id}/assign`,
      { caregiverId: caregiver.id, expectedVisitVersion: 1 },
      'lifecycle-pause-race-key-01',
    ),
    post(`/agency/care-plans/${plan.id}/pause`, { plannedVisitsAction: 'KEEP' }),
  ]);
  expect(pauseReply.status).toBe(200);
  expect(pauseReply.body.data).toMatchObject({ id: plan.id, status: 'PAUSED' });
  const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  if (assignReply.status === 200) {
    // Assignment linearized first: pause with KEEP preserves the SCHEDULED visit.
    expect(assignReply.body.data).toMatchObject({
      visitId: visit.id,
      status: 'SCHEDULED',
      assignedCaregiverId: caregiver.id,
    });
    expect(row.status).toBe('SCHEDULED');
    expect(row.assignedCaregiverId).toBe(caregiver.id);
    expect(row.assignmentHealth).toBe('OK');
  } else {
    // Pause linearized first: assignment is rejected without plan/patient content.
    expectPrivacySafeConflict(assignReply, plan.id);
    expect(row.status).toBe('PLANNED');
    expect(row.assignedCaregiverId).toBeNull();
  }
  expect(await db.visitAssignmentHistory.count({ where: { tenantId, visitId: visit.id } })).toBe(
    assignReply.status === 200 ? 1 : 0,
  );
});

it('cancel with KEEP preserves the SCHEDULED visit but blocks later assignment of retained PLANNED visits', async () => {
  const caregiver = await createCaregiver('Lifecycle cancel-keep caregiver');
  const { plan, version } = await createPlan('ACTIVE');
  const scheduled = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-12T06:00:00Z',
    '2026-12-12T07:00:00Z',
  );
  const assigned = await post(
    `/agency/visits/${scheduled.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-cancel-keep-assign-1',
  );
  expect(assigned.status).toBe(200);
  const planned = await createVisitFor(
    { id: plan.id, versionId: version.id },
    '2026-12-12T08:00:00Z',
    '2026-12-12T09:00:00Z',
  );
  const cancelled = await post(`/agency/care-plans/${plan.id}/cancel`, {
    plannedVisitsAction: 'KEEP',
    reason: 'Synthetic plan cancellation',
  });
  expect(cancelled.status).toBe(200);
  expect(cancelled.body.data).toMatchObject({
    id: plan.id,
    status: 'CANCELLED',
    cancelledVisits: 0,
  });
  const keptRow = await db.visit.findUniqueOrThrow({ where: { id: scheduled.id } });
  expect(keptRow.status).toBe('SCHEDULED');
  expect(keptRow.assignedCaregiverId).toBe(caregiver.id);
  expect(keptRow.assignmentHealth).toBe('OK');
  const rejected = await post(
    `/agency/visits/${planned.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'lifecycle-cancel-keep-assign-2',
  );
  expectPrivacySafeConflict(rejected, plan.id);
  const row = await db.visit.findUniqueOrThrow({ where: { id: planned.id } });
  expect(row.status).toBe('PLANNED');
  expect(row.assignedCaregiverId).toBeNull();
});

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';

const db = getPrisma();
const slug = `schedule-${randomUUID().slice(0, 8)}`;
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
let planId: string;
let versionId: string;
let occurrence = 0;

const serviceConfig = {
  nameAr: 'خدمة جدولة اصطناعية',
  nameEn: 'Synthetic scheduling service',
  summaryAr: 'ملخص',
  summaryEn: 'Summary',
  descriptionAr: 'وصف اصطناعي',
  descriptionEn: 'Synthetic only',
  durationMin: 60,
  clinicalClass: 'CLINICAL',
  requiredQualificationCodes: ['SYNTHETIC_LICENSE'],
  serviceAreaIds: ['central', 'north'],
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

async function createCaregiver(input: {
  name: string;
  areas?: string[];
  qualified?: boolean;
  active?: boolean;
}) {
  const staff = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: `${randomUUID()}@example.invalid`,
      passwordHash: 'unused',
      role: 'CAREGIVER',
      status: input.active === false ? 'SUSPENDED' : 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  const caregiver = await db.caregiver.create({
    data: {
      tenantId,
      staffAccountId: staff.id,
      name: input.name,
      professionalCategory: 'Synthetic nurse',
      operationalStatus: input.active === false ? 'INACTIVE' : 'ACTIVE',
      serviceAreasJson: input.areas ?? ['central'],
    },
  });
  if (input.qualified !== false)
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

async function createVisit(
  start: string,
  end: string,
  input: { status?: string; caregiverId?: string | null; areaId?: string } = {},
) {
  occurrence += 1;
  return db.visit.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      carePlanId: planId,
      planVersionId: versionId,
      occurrenceKey: `test-${occurrence}-${randomUUID()}`,
      assignedCaregiverId: input.caregiverId ?? null,
      areaId: input.areaId ?? 'central',
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
        legalName: 'Synthetic Scheduling Tests',
        displayName: 'Synthetic',
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
        displayName: 'Synthetic Scheduling Patient',
        normalizedName: 'synthetic scheduling patient',
        areaId: 'central',
      },
    })
  ).id;
  serviceId = (
    await db.agencyService.create({
      data: { tenantId, slug: `schedule-${randomUUID()}`, config: serviceConfig },
    })
  ).id;
  const plan = await db.carePlan.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      status: 'ACTIVE',
      currentVersion: 1,
    },
  });
  planId = plan.id;
  versionId = (
    await db.carePlanVersion.create({
      data: {
        tenantId,
        carePlanId: plan.id,
        version: 1,
        status: 'ACTIVATED',
        validFrom: '2026-12-01',
        validUntil: '2026-12-31',
        weekdaysJson: [0, 1, 2, 3, 4, 5, 6],
        localStartTime: '09:00',
        durationMin: 60,
        taskTemplatesJson: [],
        timezoneSnapshot: 'Asia/Riyadh',
      },
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

it('ranks primary first, then load/area/id, and excludes an unqualified primary (U07/U08)', async () => {
  const primary = await createCaregiver({ name: 'Primary synthetic caregiver' });
  const sameArea = await createCaregiver({ name: 'Same-area synthetic caregiver' });
  const otherArea = await createCaregiver({
    name: 'North-area synthetic caregiver',
    areas: ['north'],
  });
  const unqualified = await createCaregiver({
    name: 'Unqualified synthetic caregiver',
    qualified: false,
  });
  await db.carePlan.update({ where: { id: planId }, data: { primaryCaregiverId: primary.id } });
  // Primary has a heavier load but remains first by the locked ranking order.
  await createVisit('2026-12-01T06:00:00Z', '2026-12-01T07:00:00Z', {
    status: 'SCHEDULED',
    caregiverId: primary.id,
  });
  const visit = await createVisit('2026-12-02T06:00:00Z', '2026-12-02T07:00:00Z');
  const response = await post(`/agency/visits/${visit.id}/candidates`, {});
  expect(response.status).toBe(200);
  expect(response.body.data.advisory).toBe(true);
  expect(response.body.data.items[0]).toMatchObject({ caregiverId: primary.id, isPrimary: true });
  const same = response.body.data.items.findIndex(
    (item: { caregiverId: string }) => item.caregiverId === sameArea.id,
  );
  const other = response.body.data.items.findIndex(
    (item: { caregiverId: string }) => item.caregiverId === otherArea.id,
  );
  expect(same).toBeGreaterThan(0);
  expect(other).toBeGreaterThan(same); // equal load, same-area preference first
  expect(response.body.data.excluded).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        caregiverId: unqualified.id,
        reasons: expect.arrayContaining(['QUALIFICATION_INVALID']),
      }),
    ]),
  );
});

it('enforces exact travel-buffer adjacency (U04/U05)', async () => {
  const caregiver = await createCaregiver({ name: 'Buffer synthetic caregiver' });
  await createVisit('2026-12-07T06:00:00Z', '2026-12-07T07:00:00Z', {
    status: 'SCHEDULED',
    caregiverId: caregiver.id,
  }); // local 09:00-10:00
  const conflict = await createVisit('2026-12-07T07:29:00Z', '2026-12-07T08:29:00Z');
  const denied = await post(
    `/agency/visits/${conflict.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'buffer-conflict-key-0001',
  );
  expect(denied.status).toBe(409);
  expect(denied.body.error.code).toBe('SCHEDULE_CONFLICT');
  const adjacent = await createVisit('2026-12-07T07:30:00Z', '2026-12-07T08:30:00Z');
  const allowed = await post(
    `/agency/visits/${adjacent.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'buffer-adjacent-key-0001',
  );
  expect(allowed.status).toBe(200);
  expect(allowed.body.data).toMatchObject({
    visitId: adjacent.id,
    status: 'SCHEDULED',
    assignedCaregiverId: caregiver.id,
    version: 2,
    assignmentHealth: 'OK',
  });
});

it('parallel overlapping assignments serialize: one commits and one conflicts (I08)', async () => {
  const caregiver = await createCaregiver({ name: 'Race synthetic caregiver' });
  const a = await createVisit('2026-12-10T06:00:00Z', '2026-12-10T07:00:00Z');
  const b = await createVisit('2026-12-10T06:30:00Z', '2026-12-10T07:30:00Z');
  const replies = await Promise.all([
    post(
      `/agency/visits/${a.id}/assign`,
      { caregiverId: caregiver.id, expectedVisitVersion: 1 },
      'i08-assignment-key-0001',
    ),
    post(
      `/agency/visits/${b.id}/assign`,
      { caregiverId: caregiver.id, expectedVisitVersion: 1 },
      'i08-assignment-key-0002',
    ),
  ]);
  expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409]);
  expect(replies.find((reply) => reply.status === 409)!.body.error.code).toBe('SCHEDULE_CONFLICT');
  expect(
    await db.visit.count({
      where: { tenantId, id: { in: [a.id, b.id] }, status: 'SCHEDULED' },
    }),
  ).toBe(1);
});

it('bulk assignment returns explicit partial outcomes and replays safely', async () => {
  const caregiver = await createCaregiver({ name: 'Bulk synthetic caregiver' });
  const first = await createVisit('2026-12-11T06:00:00Z', '2026-12-11T07:00:00Z');
  const second = await createVisit('2026-12-11T06:15:00Z', '2026-12-11T07:15:00Z');
  const body = {
    assignments: [
      { visitId: first.id, caregiverId: caregiver.id, expectedVisitVersion: 1 },
      { visitId: second.id, caregiverId: caregiver.id, expectedVisitVersion: 1 },
    ],
    reason: 'Synthetic bulk assignment',
  };
  const key = 'bulk-partial-key-0000001';
  const response = await post('/agency/visits/bulk-assign', body, key);
  expect(response.status).toBe(200);
  expect(response.body.data.summary).toEqual({ succeeded: 1, failed: 1 });
  expect(response.body.data.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ visitId: first.id, ok: true, status: 'SCHEDULED' }),
      expect.objectContaining({ visitId: second.id, ok: false, code: 'SCHEDULE_CONFLICT' }),
    ]),
  );
  const replay = await post('/agency/visits/bulk-assign', body, key);
  expect(replay.status).toBe(200);
  expect(replay.body.data).toEqual(response.body.data);
  expect(await db.visitAssignmentHistory.count({ where: { tenantId, visitId: first.id } })).toBe(1);
});

it('leave excludes candidates and flags existing appointments without cancelling (U09/F10)', async () => {
  const caregiver = await createCaregiver({ name: 'Leave synthetic caregiver' });
  const visit = await createVisit('2026-12-14T06:00:00Z', '2026-12-14T07:00:00Z');
  const assigned = await post(
    `/agency/visits/${visit.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'leave-assignment-key-0001',
  );
  expect(assigned.status).toBe(200);
  const exception = await post(`/agency/caregivers/${caregiver.id}/exceptions`, {
    expectedRevision: 1,
    localDate: '2026-12-14',
    type: 'UNAVAILABLE',
    startLocal: null,
    endLocal: null,
    reason: 'Synthetic approved leave',
  });
  expect(exception.status).toBe(200);
  expect(exception.body.data.impactScan.flagged).toBe(1);
  const impacted = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(impacted.status).toBe('SCHEDULED');
  expect(impacted.assignedCaregiverId).toBe(caregiver.id);
  expect(impacted.assignmentHealth).toBe('NEEDS_REASSIGNMENT');
  const planned = await createVisit('2026-12-14T08:00:00Z', '2026-12-14T09:00:00Z');
  const candidates = await post(`/agency/visits/${planned.id}/candidates`, {});
  expect(candidates.body.data.excluded).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        caregiverId: caregiver.id,
        reasons: expect.arrayContaining(['OUTSIDE_AVAILABILITY']),
      }),
    ]),
  );
});

it('leave/assignment race either rejects assignment or flags the committed visit', async () => {
  const caregiver = await createCaregiver({ name: 'Leave race caregiver' });
  const visit = await createVisit('2026-12-15T06:00:00Z', '2026-12-15T07:00:00Z');
  const [assignReply, leaveReply] = await Promise.all([
    post(
      `/agency/visits/${visit.id}/assign`,
      { caregiverId: caregiver.id, expectedVisitVersion: 1 },
      'leave-race-assign-000001',
    ),
    post(`/agency/caregivers/${caregiver.id}/exceptions`, {
      expectedRevision: 1,
      localDate: '2026-12-15',
      type: 'UNAVAILABLE',
      startLocal: null,
      endLocal: null,
      reason: 'Synthetic concurrent leave',
    }),
  ]);
  expect(leaveReply.status).toBe(200);
  const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  if (assignReply.status === 200) {
    expect(row.status).toBe('SCHEDULED');
    expect(row.assignmentHealth).toBe('NEEDS_REASSIGNMENT');
  } else {
    expect(assignReply.status).toBe(409);
    expect(assignReply.body.error.code).toBe('CAREGIVER_UNAVAILABLE');
    expect(row.status).toBe('PLANNED');
    expect(row.assignedCaregiverId).toBeNull();
  }
});

it('withdrawing a verified qualification flags future appointments (I20)', async () => {
  const caregiver = await createCaregiver({ name: 'Qualification impact caregiver' });
  const qualification = await db.caregiverQualification.findFirstOrThrow({
    where: { tenantId, caregiverId: caregiver.id },
  });
  const visit = await createVisit('2026-12-16T06:00:00Z', '2026-12-16T07:00:00Z');
  await post(
    `/agency/visits/${visit.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'qualification-assign-0001',
  );
  const withdrawal = await post(`/agency/qualifications/${qualification.id}/verify`, {
    expectedVersion: qualification.version,
    decision: 'REJECTED',
    reason: 'Synthetic verification withdrawal',
  });
  expect(withdrawal.status).toBe(200);
  expect(withdrawal.body.data.impactScan.flagged).toBe(1);
  const impacted = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(impacted.status).toBe('SCHEDULED');
  expect(impacted.assignmentHealth).toBe('NEEDS_REASSIGNMENT');
});

it('assignment idempotency and stale visit versions are enforced', async () => {
  const caregiver = await createCaregiver({ name: 'Idempotent caregiver' });
  const visit = await createVisit('2026-12-17T06:00:00Z', '2026-12-17T07:00:00Z');
  const body = { caregiverId: caregiver.id, expectedVisitVersion: 1 };
  const key = 'assignment-replay-key-0001';
  const first = await post(`/agency/visits/${visit.id}/assign`, body, key);
  const replay = await post(`/agency/visits/${visit.id}/assign`, body, key);
  expect(first.status).toBe(200);
  expect(replay.status).toBe(200);
  expect(replay.body.data).toEqual(first.body.data);
  expect(await db.visitReminder.count({ where: { tenantId, visitId: visit.id } })).toBe(4);
  expect((await db.visit.findUniqueOrThrow({ where: { id: visit.id } })).reminderRevision).toBe(1);
  expect(await db.visitAssignmentHistory.count({ where: { tenantId, visitId: visit.id } })).toBe(1);
  const other = await createVisit('2026-12-18T06:00:00Z', '2026-12-18T07:00:00Z');
  await db.visit.update({ where: { id: other.id }, data: { version: 2 } });
  const stale = await post(
    `/agency/visits/${other.id}/assign`,
    { caregiverId: caregiver.id, expectedVisitVersion: 1 },
    'assignment-stale-key-0001',
  );
  expect(stale.status).toBe(409);
  expect(stale.body.error.code).toBe('VISIT_VERSION_CONFLICT');
});

it('service authorization withdrawal and restoration version and audit assignment health', async () => {
  const authorize = (id: string, body: object) =>
    request(app)
      .put(`/v1/agency/caregivers/${id}/service-authorizations`)
      .set('Host', host)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrf)
      .send(body);
  const caregiver = await createCaregiver({ name: 'Synthetic service withdrawal' });
  const visit = await createVisit('2026-12-22T06:00:00Z', '2026-12-22T07:00:00Z');
  expect(
    (
      await post(
        `/agency/visits/${visit.id}/assign`,
        { caregiverId: caregiver.id, expectedVisitVersion: 1 },
        'service-withdrawal-assign-001',
      )
    ).status,
  ).toBe(200);
  expect(
    (await authorize(caregiver.id, { expectedVersion: caregiver.version, serviceIds: [] })).status,
  ).toBe(200);
  const flagged = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(flagged.assignmentHealth).toBe('NEEDS_REASSIGNMENT');
  expect(flagged.version).toBe(3);
  expect(flagged.assignedCaregiverId).toBe(caregiver.id);
  expect(
    (
      await authorize(caregiver.id, {
        expectedVersion: caregiver.version + 1,
        serviceIds: [serviceId],
      })
    ).status,
  ).toBe(200);
  const healed = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(healed.assignmentHealth).toBe('OK');
  expect(healed.version).toBe(4);
  expect(
    await db.auditEvent.count({
      where: {
        tenantId,
        subjectId: visit.id,
        action: { in: ['visit.reassignment_flagged', 'visit.reassignment_resolved'] },
      },
    }),
  ).toBe(2);
  expect(
    await db.outboxEvent.count({
      where: {
        tenantId,
        aggregateId: visit.id,
        eventType: { in: ['visit.reassignment_flagged', 'visit.reassignment_resolved'] },
      },
    }),
  ).toBe(2);
});

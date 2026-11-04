import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';

/**
 * ADR-0012 decision 10: bulk assignment order is semantic, duplicate visit IDs
 * are invalid, the canonical request hash preserves input order and includes
 * every visit/caregiver/version tuple plus the top-level reason, the first
 * (tenantId, principalId, key) request atomically reserves execution, a
 * concurrent matching request gets 409 IDEMPOTENCY_IN_PROGRESS, a changed
 * payload gets 409 IDEMPOTENCY_CONFLICT, and completed per-visit outcomes are
 * checkpointed so a later matching replay resumes unfinished items without
 * rerunning completed ones.
 */
const db = getPrisma();
const slug = `bulk-idem-${randomUUID().slice(0, 8)}`;
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
  nameAr: 'Ø®Ø¯Ù…Ø© ØªØ¬Ù…ÙŠØ¹ Ø¬Ø¯ÙˆÙ„Ø© Ø§ØµØ·Ù†Ø§Ø¹ÙŠØ©',
  nameEn: 'Synthetic bulk idempotency service',
  summaryAr: 'Ù…Ù„Ø®Øµ',
  summaryEn: 'Summary',
  descriptionAr: 'ÙˆØµÙ Ø§ØµØ·Ù†Ø§Ø¹ÙŠ',
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

interface BulkItem {
  visitId: string;
  caregiverId: string;
  expectedVisitVersion: number;
}

/** Independent characterization of the documented canonical hash: input order
 * preserved, every tuple included, top-level reason included. */
const canonicalBulkHash = (assignments: BulkItem[], reason?: string) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        kind: 'visit.bulkAssign',
        assignments: assignments.map((a) => ({
          visitId: a.visitId,
          caregiverId: a.caregiverId,
          expectedVisitVersion: a.expectedVisitVersion,
        })),
        reason: reason ?? null,
      }),
    )
    .digest('hex');

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

async function createVisit(caregiverIdForConflict: string | null, start: string, end: string) {
  occurrence += 1;
  return db.visit.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      carePlanId: planId,
      planVersionId: versionId,
      occurrenceKey: `test-${occurrence}-${randomUUID()}`,
      assignedCaregiverId: caregiverIdForConflict,
      areaId: 'central',
      serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
      scheduledStartUtc: new Date(start),
      scheduledEndUtc: new Date(end),
      timezoneSnapshot: 'Asia/Riyadh',
      status: 'PLANNED',
    },
  });
}

/** Spaced 90 minutes apart inside the 08:00-18:00 local availability window
 * so one caregiver may legally hold them all. */
const spacedVisits = async (count: number) => {
  const visits = [];
  for (let index = 0; index < count; index += 1) {
    const start = new Date(Date.parse('2026-12-20T05:30:00Z') + index * 90 * 60_000);
    const end = new Date(start.getTime() + 60 * 60_000);
    visits.push(await createVisit(null, start.toISOString(), end.toISOString()));
  }
  return visits;
};

const items = (visits: Array<{ id: string }>, caregiverId: string, version = 1): BulkItem[] =>
  visits.map((visit) => ({ visitId: visit.id, caregiverId, expectedVisitVersion: version }));

/** JSON-safe checkpoint entry: only IDs, stable codes and numeric visit state. */
type SafeCheckpointEntry = Record<string, string | number | boolean | null>;

async function seedInProgressReservation(
  key: string,
  principalId: string,
  payload: BulkItem[],
  reason: string | undefined,
  checkpoint: SafeCheckpointEntry[],
  leaseExpiresAt: string,
) {
  await db.idempotencyKey.create({
    data: {
      tenantId,
      principalId,
      key,
      requestHash: canonicalBulkHash(payload, reason),
      responseSummary: { state: 'IN_PROGRESS', checkpoint, leaseExpiresAt },
      expiresAt: new Date('2026-11-03T12:00:00Z'),
    },
  });
}

beforeAll(async () => {
  tenantId = (
    await db.tenant.create({
      data: {
        slug,
        legalName: 'Synthetic Bulk Idempotency Tests',
        displayName: 'Synthetic Bulk Idem',
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
        displayName: 'Synthetic Bulk Idempotency Patient',
        normalizedName: 'synthetic bulk idempotency patient',
        areaId: 'central',
      },
    })
  ).id;
  serviceId = (
    await db.agencyService.create({
      data: { tenantId, slug: `bulk-idem-${randomUUID()}`, config: serviceConfig },
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

it('concurrent same-key bulk requests execute each visit at most once', async () => {
  const caregiver = await createCaregiver('Bulk concurrency caregiver');
  const visits = await spacedVisits(6);
  const body = {
    assignments: items(visits, caregiver.id),
    reason: 'Synthetic concurrent bulk',
  };
  const key = 'bulk-concurrent-key-000001';
  // Fired simultaneously; the approved serializations are: the loser observes
  // the in-progress reservation (409 IDEMPOTENCY_IN_PROGRESS), or it arrives
  // after completion and replays the stored result byte-for-byte. A second
  // execution pass is never approved.
  const replies = await Promise.all([
    post('/agency/visits/bulk-assign', body, key),
    post('/agency/visits/bulk-assign', body, key),
  ]);
  for (const reply of replies) {
    if (reply.status === 409) {
      expect(reply.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    } else {
      expect(reply.status).toBe(200);
      expect(reply.body.data.summary).toEqual({ succeeded: 6, failed: 0 });
    }
  }
  const completed = replies.filter((reply) => reply.status === 200);
  expect(completed.length).toBeGreaterThanOrEqual(1);
  if (completed.length === 2) expect(completed[0]!.body).toEqual(completed[1]!.body);
  const visitIds = visits.map((visit) => visit.id);
  expect(
    await db.visit.count({
      where: {
        tenantId,
        id: { in: visitIds },
        status: 'SCHEDULED',
        assignedCaregiverId: caregiver.id,
      },
    }),
  ).toBe(6);
  expect(
    await db.visitAssignmentHistory.count({ where: { tenantId, visitId: { in: visitIds } } }),
  ).toBe(6);
  expect(await db.outboxEvent.count({ where: { tenantId, eventType: 'visit.assigned', aggregateId: { in: visitIds } } })).toBe(
    6,
  );
  const stored = await db.idempotencyKey.findUniqueOrThrow({
    where: { tenantId_principalId_key: { tenantId, principalId: `staff:${ownerId}`, key } },
  });
  expect(stored.requestHash).toBe(canonicalBulkHash(body.assignments, body.reason));
});

it('a replay of a completed bulk returns the stored result without re-executing', async () => {
  const caregiver = await createCaregiver('Bulk replay caregiver');
  const visits = await spacedVisits(2);
  const body = { assignments: items(visits, caregiver.id), reason: 'Synthetic replay bulk' };
  const key = 'bulk-replay-key-00000001';
  const first = await post('/agency/visits/bulk-assign', body, key);
  expect(first.status).toBe(200);
  expect(first.body.data.summary).toEqual({ succeeded: 2, failed: 0 });
  const replay = await post('/agency/visits/bulk-assign', body, key);
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual(first.body);
  const visitIds = visits.map((visit) => visit.id);
  expect(
    await db.visitAssignmentHistory.count({ where: { tenantId, visitId: { in: visitIds } } }),
  ).toBe(2);
  expect(await db.outboxEvent.count({ where: { tenantId, eventType: 'visit.assigned', aggregateId: { in: visitIds } } })).toBe(
    2,
  );
});

it('a changed reason under the same key is an IDEMPOTENCY_CONFLICT', async () => {
  const caregiver = await createCaregiver('Bulk reason caregiver');
  const visits = await spacedVisits(2);
  const key = 'bulk-reason-key-00000001';
  const first = await post(
    '/agency/visits/bulk-assign',
    {
      assignments: items(visits, caregiver.id),
      reason: 'Synthetic original reason',
    },
    key,
  );
  expect(first.status).toBe(200);
  const changed = await post(
    '/agency/visits/bulk-assign',
    {
      assignments: items(visits, caregiver.id),
      reason: 'Synthetic changed reason',
    },
    key,
  );
  expect(changed.status).toBe(409);
  expect(changed.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
});

it('a reordered payload under the same key is an IDEMPOTENCY_CONFLICT', async () => {
  const caregiver = await createCaregiver('Bulk order caregiver');
  const visits = await spacedVisits(2);
  const key = 'bulk-order-key-00000001';
  const first = await post(
    '/agency/visits/bulk-assign',
    {
      assignments: items(visits, caregiver.id),
      reason: 'Synthetic ordered bulk',
    },
    key,
  );
  expect(first.status).toBe(200);
  const reordered = await post(
    '/agency/visits/bulk-assign',
    {
      assignments: [...items(visits, caregiver.id)].reverse(),
      reason: 'Synthetic ordered bulk',
    },
    key,
  );
  expect(reordered.status).toBe(409);
  expect(reordered.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
});

it('duplicate visit IDs are rejected before any execution begins', async () => {
  const caregiver = await createCaregiver('Bulk duplicate caregiver');
  const [visit] = await spacedVisits(1);
  const duplicate = {
    assignments: [
      { visitId: visit!.id, caregiverId: caregiver.id, expectedVisitVersion: 1 },
      { visitId: visit!.id, caregiverId: caregiver.id, expectedVisitVersion: 1 },
    ],
    reason: 'Synthetic duplicate bulk',
  };
  const response = await post('/agency/visits/bulk-assign', duplicate, 'bulk-duplicate-key-001');
  expect(response.status).toBe(422);
  expect(response.body.error.code).toBe('VALIDATION_FAILED');
  const row = await db.visit.findUniqueOrThrow({ where: { id: visit!.id } });
  expect(row.status).toBe('PLANNED');
  expect(row.assignedCaregiverId).toBeNull();
  expect(await db.visitAssignmentHistory.count({ where: { tenantId, visitId: visit!.id } })).toBe(
    0,
  );
  expect(
    await db.idempotencyKey.count({ where: { tenantId, key: 'bulk-duplicate-key-001' } }),
  ).toBe(0);
});

it('a matching request concurrent with an in-flight run receives IDEMPOTENCY_IN_PROGRESS', async () => {
  const caregiver = await createCaregiver('Bulk in-progress caregiver');
  const visits = await spacedVisits(2);
  const body = { assignments: items(visits, caregiver.id), reason: 'Synthetic in-flight bulk' };
  const key = 'bulk-inprogress-key-00001';
  await seedInProgressReservation(
    key,
    `staff:${ownerId}`,
    body.assignments,
    body.reason,
    [],
    '2026-11-02T12:01:00Z',
  );
  const response = await post('/agency/visits/bulk-assign', body, key);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
  const rows = await db.visit.findMany({
    where: { tenantId, id: { in: visits.map((v) => v.id) } },
  });
  expect(rows.every((row) => row.status === 'PLANNED' && row.assignedCaregiverId === null)).toBe(
    true,
  );
});

it('an interrupted run resumes unfinished visits without rerunning completed ones', async () => {
  const caregiver = await createCaregiver('Bulk resume caregiver');
  const visits = await spacedVisits(2);
  const [done, todo] = visits;
  const reason = 'Synthetic interrupted bulk';
  const body = { assignments: items(visits, caregiver.id), reason };
  const key = 'bulk-resume-key-0000001';
  // State an interrupted execution would have left: visit A committed (visit
  // row, history, audit, outbox) and its safe outcome checkpointed before the
  // process died; visit B never started; the execution lease has lapsed.
  await db.visit.update({
    where: { id: done!.id },
    data: {
      status: 'SCHEDULED',
      assignedCaregiverId: caregiver.id,
      version: 2,
      assignmentHealth: 'OK',
    },
  });
  await db.visitAssignmentHistory.create({
    data: {
      tenantId,
      visitId: done!.id,
      oldCaregiverId: null,
      newCaregiverId: caregiver.id,
      changedBy: ownerId,
      reason,
    },
  });
  await db.auditEvent.create({
    data: {
      tenantId,
      actorType: 'AGENCY_STAFF',
      actorId: ownerId,
      action: 'visit.assigned',
      subjectType: 'visit',
      subjectId: done!.id,
      metadataJson: {},
      reason,
    },
  });
  await db.outboxEvent.create({
    data: { tenantId, eventType: 'visit.assigned', aggregateId: done!.id, payloadMinimal: {} },
  });
  const checkpoint = [
    {
      visitId: done!.id,
      ok: true,
      status: 'SCHEDULED',
      assignedCaregiverId: caregiver.id,
      version: 2,
      assignmentHealth: 'OK',
    },
  ];
  await seedInProgressReservation(
    key,
    `staff:${ownerId}`,
    body.assignments,
    reason,
    checkpoint,
    '2026-11-02T11:00:00Z',
  );
  const response = await post('/agency/visits/bulk-assign', body, key);
  expect(response.status).toBe(200);
  expect(response.body.data.summary).toEqual({ succeeded: 2, failed: 0 });
  expect(response.body.data.results).toEqual([
    expect.objectContaining({ visitId: done!.id, ok: true, version: 2 }),
    expect.objectContaining({ visitId: todo!.id, ok: true, status: 'SCHEDULED', version: 2 }),
  ]);
  // Completed item: exactly the seeded rows, nothing re-executed.
  expect(await db.visitAssignmentHistory.count({ where: { tenantId, visitId: done!.id } })).toBe(1);
  expect(await db.auditEvent.count({ where: { tenantId, subjectId: done!.id } })).toBe(1);
  expect(await db.outboxEvent.count({ where: { tenantId, aggregateId: done!.id } })).toBe(1);
  // Resumed item: executed exactly once with its full side effects.
  expect(await db.visitAssignmentHistory.count({ where: { tenantId, visitId: todo!.id } })).toBe(1);
  expect(await db.auditEvent.count({ where: { tenantId, subjectId: todo!.id } })).toBe(1);
  expect(await db.outboxEvent.count({ where: { tenantId, eventType: 'visit.assigned', aggregateId: todo!.id } })).toBe(1);
  const stored = await db.idempotencyKey.findUniqueOrThrow({
    where: { tenantId_principalId_key: { tenantId, principalId: `staff:${ownerId}`, key } },
  });
  expect(stored.responseSummary).not.toHaveProperty('state', 'IN_PROGRESS');
  expect(stored.responseSummary).toEqual(response.body.data);
});

it('stored bulk summaries contain only safe operation data', async () => {
  const caregiver = await createCaregiver('Bulk privacy caregiver');
  const start = '2026-12-21T06:00:00Z';
  const overlapping = await createVisit(null, start, '2026-12-21T07:00:00Z');
  const conflicting = await createVisit(null, start, '2026-12-21T07:00:00Z');
  const body = {
    assignments: items([overlapping, conflicting], caregiver.id),
    reason: 'Synthetic privacy bulk',
  };
  const key = 'bulk-privacy-key-000001';
  const response = await post('/agency/visits/bulk-assign', body, key);
  expect(response.status).toBe(200);
  expect(response.body.data.summary).toEqual({ succeeded: 1, failed: 1 });
  const stored = await db.idempotencyKey.findUniqueOrThrow({
    where: { tenantId_principalId_key: { tenantId, principalId: `staff:${ownerId}`, key } },
  });
  const serialized = JSON.stringify(stored.responseSummary);
  expect(serialized).not.toContain('Bulk privacy caregiver');
  expect(serialized).not.toContain('Synthetic Bulk Idempotency Patient');
  expect(serialized).not.toContain('bulk-privacy');
  expect(serialized).toContain(overlapping.id);
  expect(serialized).toContain('SCHEDULE_CONFLICT');
  expect(response.body.data.results.find((entry: { ok: boolean }) => !entry.ok)).toEqual({
    visitId: conflicting.id,
    ok: false,
    code: 'SCHEDULE_CONFLICT',
  });
});

it('fences a still-live original runner after lease takeover', async () => {
  const caregiver = await createCaregiver('Synthetic fenced runner');
  const visits = await spacedVisits(2);
  const body = { assignments: items(visits, caregiver.id), reason: 'Synthetic fenced bulk' };
  const key = 'bulk-fenced-key-00000001';
  let release!: () => void;
  let reserved!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    reserved = resolve;
  });
  const create = db.idempotencyKey.create.bind(db.idempotencyKey);
  const spy = vi.spyOn(db.idempotencyKey, 'create').mockImplementationOnce((args) => {
    // Preserve Prisma's promise interface while delaying delivery to the old runner.
    return (async () => {
      const row = await create(args);
      reserved();
      await held;
      return row;
    })() as ReturnType<typeof db.idempotencyKey.create>;
  });
  const original = post('/agency/visits/bulk-assign', body, key).then((response) => response);
  try {
    await ready;
    const row = await db.idempotencyKey.findUniqueOrThrow({
      where: { tenantId_principalId_key: { tenantId, principalId: `staff:${ownerId}`, key } },
    });
    await db.idempotencyKey.update({
      where: { id: row.id },
      data: {
        responseSummary: {
          ...JSON.parse(JSON.stringify(row.responseSummary)),
          leaseExpiresAt: '2026-11-02T11:00:00Z',
        },
      },
    });
    const takeover = await post('/agency/visits/bulk-assign', body, key);
    expect(takeover.status).toBe(200);
    release();
    const stale = await original;
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    const replay = await post('/agency/visits/bulk-assign', body, key);
    expect(replay.body).toEqual(takeover.body);
    expect(
      await db.visitAssignmentHistory.count({
        where: { tenantId, visitId: { in: visits.map((v) => v.id) } },
      }),
    ).toBe(2);
  } finally {
    release();
    await original;
    spy.mockRestore();
  }
});

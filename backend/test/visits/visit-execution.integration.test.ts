// Sprint 6 visit execution (E06 API level, U13, I01/I07/I17): assigned
// caregiver start/tasks/note/complete with server timestamps, immutable
// finalized notes, append-only corrections, separate review, and denial
// matrices. Synthetic data only.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';

const db = getPrisma();
const slug = `visits-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
const FIXED_NOW = new Date('2026-11-02T12:00:00Z');
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
  db,
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => FIXED_NOW,
});

let tenantId: string;
let ownerId: string;
let owner: { cookie: string; csrf: string };
let coordinator: { cookie: string; csrf: string };
let caregiverA: { id: string; session: { cookie: string; csrf: string } };
let caregiverB: { id: string; session: { cookie: string; csrf: string } };
let patientId: string;
let serviceId: string;
let visitId: string;
let requiredTaskId: string;
let notDoneTaskId: string;
let optionalTaskId: string;

const serviceConfig = {
  nameAr: 'خدمة تنفيذ اصطناعية',
  nameEn: 'Synthetic execution service',
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

async function createStaff(input: {
  role: 'AGENCY_OWNER' | 'CARE_COORDINATOR' | 'CAREGIVER';
  email: string;
}) {
  return db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: input.email,
      passwordHash: 'unused',
      role: input.role,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
}

async function createCaregiverSession(name: string) {
  const staff = await createStaff({ role: 'CAREGIVER', email: `${randomUUID()}@example.invalid` });
  const caregiver = await db.caregiver.create({
    data: {
      tenantId,
      staffAccountId: staff.id,
      name,
      professionalCategory: 'Synthetic',
      operationalStatus: 'ACTIVE',
      serviceAreasJson: ['central'],
    },
  });
  return { id: caregiver.id, session: await session(staff.id) };
}

const call = (
  method: 'get' | 'post' | 'put',
  path: string,
  actor: { cookie: string; csrf: string },
  body?: object,
  extraHeaders?: Record<string, string>,
) => {
  const req = request(app)[method](`/v1${path}`).set('Host', host).set('Cookie', actor.cookie);
  if (method !== 'get') req.set('X-CSRF-Token', actor.csrf);
  for (const [key, value] of Object.entries(extraHeaders ?? {})) req.set(key, value);
  return req.send(body ?? {});
};

const idKey = () => `synthetic-key-${randomUUID().slice(0, 12)}-${randomUUID().slice(0, 12)}`;

beforeAll(async () => {
  tenantId = (
    await db.tenant.create({
      data: {
        slug,
        legalName: 'Synthetic Visit Execution Tests',
        displayName: 'Synthetic',
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        supportEmail: 'support@example.invalid',
      },
    })
  ).id;
  const ownerRow = await createStaff({ role: 'AGENCY_OWNER', email: 'owner@example.invalid' });
  ownerId = ownerRow.id;
  owner = await session(ownerId);
  const coordinatorRow = await createStaff({
    role: 'CARE_COORDINATOR',
    email: 'coordinator@example.invalid',
  });
  coordinator = await session(coordinatorRow.id);
  caregiverA = await createCaregiverSession('Synthetic executing caregiver');
  caregiverB = await createCaregiverSession('Synthetic other caregiver');
  patientId = (
    await db.patient.create({
      data: {
        tenantId,
        displayName: 'Synthetic Execution Patient',
        normalizedName: 'synthetic execution patient',
        areaId: 'central',
      },
    })
  ).id;
  serviceId = (
    await db.agencyService.create({
      data: { tenantId, slug: `execution-${randomUUID()}`, config: serviceConfig },
    })
  ).id;
  const visit = await db.visit.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      areaId: 'central',
      assignedCaregiverId: caregiverA.id,
      serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
      scheduledStartUtc: new Date('2026-12-01T06:00:00Z'),
      scheduledEndUtc: new Date('2026-12-01T07:00:00Z'),
      timezoneSnapshot: 'Asia/Riyadh',
      status: 'SCHEDULED',
    },
  });
  visitId = visit.id;
  const tasks = await db.visitTask.createManyAndReturn({
    data: [
      {
        tenantId,
        visitId,
        order: 1,
        descriptionSnapshot: 'Synthetic required task one',
        isRequired: true,
      },
      {
        tenantId,
        visitId,
        order: 2,
        descriptionSnapshot: 'Synthetic required task two',
        isRequired: true,
      },
      {
        tenantId,
        visitId,
        order: 3,
        descriptionSnapshot: 'Synthetic optional task',
        isRequired: false,
      },
    ],
  });
  requiredTaskId = tasks.find((task) => task.order === 1)!.id;
  notDoneTaskId = tasks.find((task) => task.order === 2)!.id;
  optionalTaskId = tasks.find((task) => task.order === 3)!.id;
});

afterAll(async () => {
  await db.visitReview.deleteMany({ where: { tenantId } });
  await db.visitNote.deleteMany({ where: { tenantId } });
  await db.visitTask.deleteMany({ where: { tenantId } });
  await db.visitAssignmentHistory.deleteMany({ where: { tenantId } });
  await db.visit.deleteMany({ where: { tenantId } });
  await db.patient.deleteMany({ where: { tenantId } });
  await db.agencyService.deleteMany({ where: { tenantId } });
  await db.caregiver.deleteMany({ where: { tenantId } });
  await db.idempotencyKey.deleteMany({ where: { tenantId } });
  await db.authSession.deleteMany({ where: { tenantId } });
  await db.staffAccount.deleteMany({ where: { tenantId } });
  await db.auditEvent.deleteMany({ where: { tenantId } });
  await db.outboxEvent.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
});

it('restricts the caregiver list to own assignments (I07)', async () => {
  const other = await db.visit.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      areaId: 'central',
      assignedCaregiverId: caregiverB.id,
      serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
      scheduledStartUtc: new Date('2026-12-02T06:00:00Z'),
      scheduledEndUtc: new Date('2026-12-02T07:00:00Z'),
      timezoneSnapshot: 'Asia/Riyadh',
      status: 'SCHEDULED',
    },
  });
  const own = await call('get', '/caregiver/my/visits', caregiverA.session);
  expect(own.status).toBe(200);
  expect(own.body.data.items.map((item: { id: string }) => item.id)).toEqual([visitId]);
  const filtered = await call(
    'get',
    '/caregiver/my/visits?from=2026-12-02&to=2026-12-02',
    caregiverA.session,
  );
  expect(filtered.status).toBe(200);
  expect(filtered.body.data.items).toEqual([]);
  // Another caregiver's visit is a privacy-safe 404 in every projection.
  expect((await call('get', `/caregiver/my/visits/${other.id}`, caregiverA.session)).status).toBe(
    404,
  );
  expect(
    (await call('post', `/caregiver/my/visits/${other.id}/start`, caregiverA.session, {})).status,
  ).toBe(404);
  await db.visit.update({
    where: { id: other.id },
    data: { status: 'PLANNED', assignedCaregiverId: null },
  });
  expect((await call('get', `/caregiver/my/visits/${other.id}`, caregiverA.session)).status).toBe(
    404,
  );
  expect(
    (await call('post', `/caregiver/my/visits/${other.id}/start`, caregiverA.session, {})).status,
  ).toBe(404);
});

it('denies caregiver routes to non-caregiver staff and review to caregivers', async () => {
  expect((await call('get', '/caregiver/my/visits', owner)).status).toBe(403);
  expect((await call('get', '/caregiver/my/visits', coordinator)).status).toBe(403);
  expect(
    (
      await call('post', `/agency/visits/${visitId}/review`, caregiverA.session, {
        expectedVersion: 1,
      })
    ).status,
  ).toBe(403);
});

it('starts the assigned visit with a server-owned timestamp and a stable replay', async () => {
  const started = await call(
    'post',
    `/caregiver/my/visits/${visitId}/start`,
    caregiverA.session,
    {},
  );
  expect(started.status).toBe(200);
  expect(started.body.data).toMatchObject({
    visitId,
    status: 'IN_PROGRESS',
    actualStartAt: FIXED_NOW.toISOString(),
  });
  const eventsBefore = await db.outboxEvent.count({
    where: { tenantId, aggregateId: visitId, eventType: 'visit.started' },
  });
  const replay = await call(
    'post',
    `/caregiver/my/visits/${visitId}/start`,
    caregiverA.session,
    {},
  );
  expect(replay.status).toBe(200);
  expect(replay.body.data.status).toBe('IN_PROGRESS');
  const eventsAfter = await db.outboxEvent.count({
    where: { tenantId, aggregateId: visitId, eventType: 'visit.started' },
  });
  expect(eventsAfter).toBe(eventsBefore);
  expect(eventsAfter).toBe(1);
  // A second start from the wrong caregiver is still invisible.
  expect(
    (await call('post', `/caregiver/my/visits/${visitId}/start`, caregiverB.session, {})).status,
  ).toBe(404);
});

it('rejects NOT_DONE without a reason and records outcomes (U13)', async () => {
  expect(
    (
      await call(
        'put',
        `/caregiver/my/visits/${visitId}/tasks/${notDoneTaskId}`,
        caregiverA.session,
        {
          outcome: 'NOT_DONE',
        },
      )
    ).status,
  ).toBe(422);
  const done = await call(
    'put',
    `/caregiver/my/visits/${visitId}/tasks/${requiredTaskId}`,
    caregiverA.session,
    { outcome: 'DONE' },
  );
  expect(done.status).toBe(200);
  expect(done.body.data.task).toMatchObject({ id: requiredTaskId, outcome: 'DONE' });
  const notDone = await call(
    'put',
    `/caregiver/my/visits/${visitId}/tasks/${notDoneTaskId}`,
    caregiverA.session,
    { outcome: 'NOT_DONE', reason: 'Synthetic reason: patient was asleep' },
  );
  expect(notDone.status).toBe(200);
  expect(notDone.body.data.task).toMatchObject({
    id: notDoneTaskId,
    outcome: 'NOT_DONE',
    notDoneReason: 'Synthetic reason: patient was asleep',
  });
  // A task of another visit is a 404, never a cross-visit write.
  const stranger = await db.visit.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      areaId: 'central',
      assignedCaregiverId: caregiverB.id,
      serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
      scheduledStartUtc: new Date('2026-12-03T06:00:00Z'),
      scheduledEndUtc: new Date('2026-12-03T07:00:00Z'),
      timezoneSnapshot: 'Asia/Riyadh',
      status: 'IN_PROGRESS',
      actualStartAt: FIXED_NOW,
    },
  });
  expect(
    (
      await call(
        'put',
        `/caregiver/my/visits/${visitId}/tasks/${optionalTaskId}`,
        caregiverA.session,
        { outcome: 'DONE' },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        'put',
        `/caregiver/my/visits/${stranger.id}/tasks/${optionalTaskId}`,
        caregiverA.session,
        {
          outcome: 'DONE',
        },
      )
    ).status,
  ).toBe(404);
  await db.visitTask.deleteMany({ where: { tenantId, visitId: stranger.id } });
  await db.visit.delete({ where: { tenantId, id: stranger.id } });
});

it('drafts a note during the visit and refuses drafts before completion states settle', async () => {
  const note = await call('put', `/caregiver/my/visits/${visitId}/note`, caregiverA.session, {
    body: 'Synthetic draft note: visit proceeded normally.',
  });
  expect(note.status).toBe(200);
  expect(note.body.data).toMatchObject({ visitId, isDraft: true });
  const updated = await call('put', `/caregiver/my/visits/${visitId}/note`, caregiverA.session, {
    body: 'Synthetic draft note: updated before completion.',
  });
  expect(updated.status).toBe(200);
  expect(updated.body.data.noteId).toBe(note.body.data.noteId);
});

it('completes with validation, finalizes the note snapshot and flags review (U13)', async () => {
  // A fresh in-progress visit with an unclassified required task.
  const pending = await db.visit.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      areaId: 'central',
      assignedCaregiverId: caregiverA.id,
      serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
      scheduledStartUtc: new Date('2026-12-04T06:00:00Z'),
      scheduledEndUtc: new Date('2026-12-04T07:00:00Z'),
      timezoneSnapshot: 'Asia/Riyadh',
      status: 'IN_PROGRESS',
      actualStartAt: FIXED_NOW,
    },
  });
  await db.visitTask.create({
    data: {
      tenantId,
      visitId: pending.id,
      order: 1,
      descriptionSnapshot: 'Synthetic unclassified required task',
      isRequired: true,
    },
  });
  const rejected = await call(
    'post',
    `/caregiver/my/visits/${pending.id}/complete`,
    caregiverA.session,
    {},
    { 'Idempotency-Key': idKey() },
  );
  expect(rejected.status).toBe(422);
  expect(rejected.body.error.code).toBe('VALIDATION_FAILED');
  await db.visitTask.deleteMany({ where: { tenantId, visitId: pending.id } });
  await db.visit.delete({ where: { tenantId, id: pending.id } });

  const key = idKey();
  const completed = await call(
    'post',
    `/caregiver/my/visits/${visitId}/complete`,
    caregiverA.session,
    {},
    { 'Idempotency-Key': key },
  );
  expect(completed.status).toBe(200);
  expect(completed.body.data).toMatchObject({
    visitId,
    status: 'COMPLETED',
    actualStartAt: FIXED_NOW.toISOString(),
    actualEndAt: FIXED_NOW.toISOString(),
    reviewStatus: 'NEEDS_REVIEW',
  });
  // Required NOT_DONE outcome flags the completion for coordinator review.
  const note = await db.visitNote.findFirstOrThrow({ where: { tenantId, visitId } });
  expect(note.isDraft).toBe(false);
  expect(note.finalizedAt).toEqual(FIXED_NOW);
  expect(note.bodyRestricted).toBe('Synthetic draft note: updated before completion.');
  const snapshot = await db.visit.findUniqueOrThrow({ where: { id: visitId } });
  expect(snapshot.completionSnapshotJson).toMatchObject({
    actualStartAt: FIXED_NOW.toISOString(),
    actualEndAt: FIXED_NOW.toISOString(),
    notes: [
      expect.objectContaining({
        bodyRestricted: 'Synthetic draft note: updated before completion.',
      }),
    ],
  });
  await expect(
    db.visitNote.update({
      where: { id: note.id },
      data: { bodyRestricted: 'Forbidden direct rewrite' },
    }),
  ).rejects.toThrow();
  await expect(
    db.visitTask.update({ where: { id: requiredTaskId }, data: { outcome: 'PENDING' } }),
  ).rejects.toThrow();
  await expect(
    db.visit.update({
      where: { id: visitId },
      data: { actualEndAt: new Date('2026-12-01T00:00:00Z') },
    }),
  ).rejects.toThrow();
  // Replay with the same key returns the stored summary; a different key is
  // stable; neither duplicates audit/outbox rows.
  const replay = await call(
    'post',
    `/caregiver/my/visits/${visitId}/complete`,
    caregiverA.session,
    {},
    { 'Idempotency-Key': key },
  );
  expect(replay.status).toBe(200);
  expect(replay.body.data).toEqual(completed.body.data);
  const stable = await call(
    'post',
    `/caregiver/my/visits/${visitId}/complete`,
    caregiverA.session,
    {},
    { 'Idempotency-Key': idKey() },
  );
  expect(stable.status).toBe(200);
  expect(stable.body.data.status).toBe('COMPLETED');
  const events = await db.outboxEvent.findMany({
    where: {
      tenantId,
      aggregateId: visitId,
      eventType: { in: ['visit.completed', 'visit.needs_review'] },
    },
  });
  expect(events.filter((event) => event.eventType === 'visit.completed')).toHaveLength(1);
  expect(events.filter((event) => event.eventType === 'visit.needs_review')).toHaveLength(1);
});

it('freezes execution after completion; corrections are append-only (I17)', async () => {
  expect(
    (
      await call('put', `/caregiver/my/visits/${visitId}/note`, caregiverA.session, {
        body: 'attempted post-completion rewrite',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(
        'put',
        `/caregiver/my/visits/${visitId}/tasks/${requiredTaskId}`,
        caregiverA.session,
        {
          outcome: 'NOT_DONE',
          reason: 'attempted post-completion task rewrite',
        },
      )
    ).status,
  ).toBe(409);
  const version = (await db.visit.findUniqueOrThrow({ where: { id: visitId } })).version;
  const correction = await call('post', `/agency/visits/${visitId}/corrections`, coordinator, {
    expectedVersion: version,
    parentNoteId: null,
    body: 'Synthetic correction addendum: task one completed with assistance.',
    reason: 'Synthetic correction reason: documentation clarification',
  });
  expect(correction.status).toBe(201);
  const notes = await db.visitNote.findMany({
    where: { tenantId, visitId },
    orderBy: { createdAt: 'asc' },
  });
  expect(notes).toHaveLength(2);
  expect(notes[0]!.bodyRestricted).toBe('Synthetic draft note: updated before completion.');
  expect(notes[1]!).toMatchObject({
    isAddendum: true,
    isDraft: false,
    reason: 'Synthetic correction reason: documentation clarification',
  });
  // A correction naming a draft or foreign note as parent is rejected.
  const versionAfter = (await db.visit.findUniqueOrThrow({ where: { id: visitId } })).version;
  expect(
    (
      await call('post', `/agency/visits/${visitId}/corrections`, coordinator, {
        expectedVersion: versionAfter,
        parentNoteId: randomUUID(),
        body: 'Synthetic invalid parent correction',
        reason: 'Synthetic invalid parent reason',
      })
    ).status,
  ).toBe(422);
});

it('reviews the flagged completion without mutating completion data', async () => {
  const detail = await call('get', `/agency/visits/${visitId}/notes`, coordinator);
  expect(detail.status).toBe(200);
  expect(detail.body.data.reviewStatus).toBe('NEEDS_REVIEW');
  const version = (await db.visit.findUniqueOrThrow({ where: { id: visitId } })).version;
  const reviewed = await call('post', `/agency/visits/${visitId}/review`, coordinator, {
    expectedVersion: version,
    note: 'Synthetic review note: outcomes verified with caregiver.',
  });
  expect(reviewed.status).toBe(200);
  expect(reviewed.body.data).toMatchObject({ reviewStatus: 'REVIEWED' });
  const documentation = await call('get', `/agency/visits/${visitId}/notes`, coordinator);
  expect(documentation.body.data.reviews).toEqual([
    expect.objectContaining({
      noteRestricted: 'Synthetic review note: outcomes verified with caregiver.',
    }),
  ]);
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { tenantId, subjectId: visitId, action: 'visit.reviewed' },
  });
  expect(JSON.stringify(audit)).not.toContain(
    'Synthetic review note: outcomes verified with caregiver.',
  );
  const visit = await db.visit.findUniqueOrThrow({ where: { id: visitId } });
  expect(visit.status).toBe('COMPLETED');
  expect(visit.actualEndAt).toEqual(FIXED_NOW);
  expect(
    (
      await call('post', `/agency/visits/${visitId}/review`, coordinator, {
        expectedVersion: visit.version,
      })
    ).status,
  ).toBe(409);
});

it('serializes draft saving against completion without losing a committed note', async () => {
  const visit = await db.visit.create({
    data: {
      tenantId,
      patientId,
      agencyServiceId: serviceId,
      areaId: 'central',
      assignedCaregiverId: caregiverA.id,
      serviceNameSnapshot: { nameAr: 'اصطناعي', nameEn: 'Synthetic' },
      scheduledStartUtc: new Date('2026-12-10T06:00:00Z'),
      scheduledEndUtc: new Date('2026-12-10T07:00:00Z'),
      timezoneSnapshot: 'Asia/Riyadh',
      status: 'SCHEDULED',
    },
  });
  expect(
    (await call('post', `/caregiver/my/visits/${visit.id}/start`, caregiverA.session)).status,
  ).toBe(200);
  const [save, complete] = await Promise.all([
    call('put', `/caregiver/my/visits/${visit.id}/note`, caregiverA.session, {
      body: 'Synthetic concurrently saved note.',
    }),
    call(
      'post',
      `/caregiver/my/visits/${visit.id}/complete`,
      caregiverA.session,
      {},
      { 'Idempotency-Key': idKey() },
    ),
  ]);
  expect(complete.status).toBe(200);
  expect([200, 409]).toContain(save.status);
  const row = await db.visit.findUniqueOrThrow({ where: { id: visit.id } });
  expect(row.status).toBe('COMPLETED');
  expect(await db.visitNote.count({ where: { tenantId, visitId: visit.id, isDraft: true } })).toBe(
    0,
  );
  if (save.status === 200)
    expect(row.completionSnapshotJson).toMatchObject({
      notes: [expect.objectContaining({ bodyRestricted: 'Synthetic concurrently saved note.' })],
    });
});

it('keeps cross-tenant visit IDs invisible (I01)', async () => {
  const otherSlug = `visits-iso-${randomUUID().slice(0, 8)}`;
  const otherTenant = await db.tenant.create({
    data: {
      slug: otherSlug,
      legalName: 'Synthetic Isolation Tenant',
      displayName: 'Synthetic',
      status: 'ACTIVE',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: 'support@example.invalid',
    },
  });
  try {
    const foreign = await db.visit.create({
      data: {
        tenantId: otherTenant.id,
        patientId: (
          await db.patient.create({
            data: {
              tenantId: otherTenant.id,
              displayName: 'Synthetic Foreign Patient',
              normalizedName: 'synthetic foreign patient',
              areaId: 'central',
            },
          })
        ).id,
        agencyServiceId: (
          await db.agencyService.create({
            data: { tenantId: otherTenant.id, slug: `iso-${randomUUID()}`, config: serviceConfig },
          })
        ).id,
        areaId: 'central',
        serviceNameSnapshot: { nameAr: serviceConfig.nameAr, nameEn: serviceConfig.nameEn },
        scheduledStartUtc: new Date('2026-12-05T06:00:00Z'),
        scheduledEndUtc: new Date('2026-12-05T07:00:00Z'),
        timezoneSnapshot: 'Asia/Riyadh',
        status: 'SCHEDULED',
      },
    });
    // Staff see a privacy-safe 404; the caregiver (no agency-read permission)
    // is denied at the permission gate before any lookup.
    for (const actor of [owner, coordinator]) {
      expect((await call('get', `/agency/visits/${foreign.id}`, actor)).status).toBe(404);
      expect((await call('get', `/caregiver/my/visits/${foreign.id}`, actor)).status).toBe(403);
      expect((await call('get', `/agency/visits/${foreign.id}/notes`, actor)).status).toBe(404);
      expect(
        (
          await call('post', `/agency/visits/${foreign.id}/corrections`, actor, {
            expectedVersion: 1,
            body: 'cross-tenant attempt',
            reason: 'cross-tenant attempt reason',
          })
        ).status,
      ).toBe(404);
    }
    expect(
      (await call('get', `/caregiver/my/visits/${foreign.id}`, caregiverA.session)).status,
    ).toBe(404);
    expect(
      (
        await call('post', `/agency/visits/${foreign.id}/review`, caregiverA.session, {
          expectedVersion: 1,
        })
      ).status,
    ).toBe(403);
  } finally {
    await db.visit.deleteMany({ where: { tenantId: otherTenant.id } });
    await db.patient.deleteMany({ where: { tenantId: otherTenant.id } });
    await db.agencyService.deleteMany({ where: { tenantId: otherTenant.id } });
    await db.tenant.delete({ where: { id: otherTenant.id } });
  }
});

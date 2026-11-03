import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';

const db = getPrisma();
const slug = `plan-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
  db,
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => new Date(),
});
let tenantId: string;
let tenantB: string;
let owner: { cookie: string; csrf: string };
let coordinator: { cookie: string; csrf: string };
let reviewer: { cookie: string; csrf: string };
let ownerB: { cookie: string; csrf: string };
let caregiverActor: { cookie: string; csrf: string };
let patientId: string;
let clinicalServiceId: string;
let nonClinicalServiceId: string;
let reviewerCaregiverId: string;

async function session(principalId: string, tenant: string) {
  const created = await createSession(db, {
    principalId,
    principalType: 'AGENCY_STAFF',
    tenantId: tenant,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  return { cookie: `raak_session_agency=${created.sessionToken}`, csrf: created.csrfToken };
}
const post = (path: string, body: object, actor = owner, key?: string) => {
  const request_ = request(app)
    .post(`/v1${path}`)
    .set('Host', host)
    .set('Cookie', actor.cookie)
    .set('X-CSRF-Token', actor.csrf);
  if (key) request_.set('Idempotency-Key', key);
  return request_.send(body);
};
const get = (path: string, actor = owner) =>
  request(app).get(`/v1${path}`).set('Host', host).set('Cookie', actor.cookie);

const serviceConfig = (overrides: Record<string, unknown> = {}) => ({
  nameAr: 'خدمة متكررة',
  nameEn: 'Synthetic recurring service',
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
  ...overrides,
});

const planContent = {
  validFrom: '2026-12-01',
  validUntil: '2026-12-28',
  weekdays: [1, 3],
  localStartTime: '09:00',
  durationMin: 90,
  goalText: 'Synthetic goal',
  taskTemplates: [
    { description: 'Synthetic task A', isRequired: true },
    { description: 'Synthetic task B', isRequired: false },
  ],
  clinicalInstructionsRestricted: 'Synthetic clinical instructions',
  dstResolution: 'REJECT' as const,
};

beforeAll(async () => {
  const base = {
    legalName: 'Synthetic Plan Tests',
    displayName: 'Synthetic',
    status: 'ACTIVE' as const,
    currency: 'SAR',
    supportEmail: 'support@example.invalid',
  };
  tenantId = (await db.tenant.create({ data: { ...base, slug, timezone: 'America/New_York' } })).id;
  tenantB = (
    await db.tenant.create({ data: { ...base, slug: `${slug}-b`, timezone: 'Asia/Riyadh' } })
  ).id;
  const ownerRow = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: 'owner@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      role: 'AGENCY_OWNER',
    },
  });
  const coordinatorRow = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: 'coordinator@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      role: 'CARE_COORDINATOR',
    },
  });
  const reviewerRow = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: 'reviewer@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      role: 'CARE_COORDINATOR',
    },
  });
  const caregiverStaff = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: 'caregiver@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      role: 'CAREGIVER',
    },
  });
  const ownerBRow = await db.staffAccount.create({
    data: {
      tenantId: tenantB,
      emailNormalized: 'owner@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      role: 'AGENCY_OWNER',
    },
  });
  owner = await session(ownerRow.id, tenantId);
  coordinator = await session(coordinatorRow.id, tenantId);
  reviewer = await session(reviewerRow.id, tenantId);
  ownerB = await session(ownerBRow.id, tenantB);
  caregiverActor = await session(caregiverStaff.id, tenantId);
  patientId = (
    await db.patient.create({
      data: {
        tenantId,
        displayName: 'Synthetic Plan Patient',
        normalizedName: 'synthetic plan patient',
        areaId: 'central',
      },
    })
  ).id;
  clinicalServiceId = (
    await db.agencyService.create({
      data: { tenantId, slug: `clinical-${randomUUID()}`, config: serviceConfig() },
    })
  ).id;
  nonClinicalServiceId = (
    await db.agencyService.create({
      data: {
        tenantId,
        slug: `nonclinical-${randomUUID()}`,
        config: serviceConfig({
          clinicalClass: 'NON_CLINICAL',
          requiredQualificationCodes: [],
        }),
      },
    })
  ).id;
  reviewerCaregiverId = (
    await db.caregiver.create({
      data: {
        tenantId,
        staffAccountId: reviewerRow.id,
        name: 'Synthetic Reviewer',
        professionalCategory: 'Nurse',
        operationalStatus: 'ACTIVE',
        serviceAreasJson: ['central'],
      },
    })
  ).id;
  await db.caregiverQualification.create({
    data: {
      tenantId,
      caregiverId: reviewerCaregiverId,
      code: 'SYNTHETIC_LICENSE',
      licenseIssuer: 'Synthetic board',
      licenseNumberRestricted: 'SYN-1',
      validThrough: null,
      status: 'VERIFIED',
      verifiedBy: ownerRow.id,
      verifiedAt: new Date(),
    },
  });
});
afterAll(async () => {
  for (const id of [tenantId, tenantB].filter(Boolean)) {
    await db.visitAssignmentHistory.deleteMany({ where: { tenantId: id } });
    await db.visitTask.deleteMany({ where: { tenantId: id } });
    await db.visit.deleteMany({ where: { tenantId: id } });
    await db.carePlanVersion.deleteMany({ where: { tenantId: id } });
    await db.carePlan.deleteMany({ where: { tenantId: id } });
    await db.caregiverQualification.deleteMany({ where: { tenantId: id } });
    await db.caregiverServiceAuthorization.deleteMany({ where: { tenantId: id } });
    await db.availabilitySlot.deleteMany({ where: { tenantId: id } });
    await db.availabilityException.deleteMany({ where: { tenantId: id } });
    await db.caregiver.deleteMany({ where: { tenantId: id } });
    await db.patient.deleteMany({ where: { tenantId: id } });
    await db.agencyService.deleteMany({ where: { tenantId: id } });
    await db.staffAccount.deleteMany({ where: { tenantId: id } });
    await db.authSession.deleteMany({ where: { tenantId: id } });
    await db.auditEvent.deleteMany({ where: { tenantId: id } });
    await db.outboxEvent.deleteMany({ where: { tenantId: id } });
    await db.idempotencyKey.deleteMany({ where: { tenantId: id } });
    await db.tenant.delete({ where: { id } });
  }
});

async function createPlan(body: Record<string, unknown> = {}) {
  const response = await post(
    `/agency/patients/${patientId}/care-plans`,
    {
      agencyServiceId: clinicalServiceId,
      primaryCaregiverId: null,
      serviceRequestId: null,
      ...planContent,
      ...body,
    },
    coordinator,
  );
  expect(response.status).toBe(201);
  return response.body.data as { id: string; currentVersion: number };
}

it('rejects a 61-day plan with PLAN_DURATION_EXCEEDED (U02 via API)', async () => {
  const response = await post(`/agency/patients/${patientId}/care-plans`, {
    agencyServiceId: clinicalServiceId,
    ...planContent,
    validFrom: '2026-10-03',
    validUntil: '2026-12-02',
  });
  expect(response.status).toBe(422);
  expect(response.body.error.code).toBe('PLAN_DURATION_EXCEEDED');
  expect(
    (
      await post(`/agency/patients/${patientId}/care-plans`, {
        agencyServiceId: clinicalServiceId,
        ...planContent,
        validFrom: '2026-10-03',
        validUntil: '2026-12-01',
      })
    ).status,
  ).toBe(201);
});

it('rejects DST gap and fold occurrences at draft time with RECURRENCE_TIME_INVALID (U03)', async () => {
  // America/New_York 2027-03-14 02:30 does not exist (spring forward).
  const gap = await post(`/agency/patients/${patientId}/care-plans`, {
    agencyServiceId: clinicalServiceId,
    ...planContent,
    validFrom: '2027-03-14',
    validUntil: '2027-03-14',
    weekdays: [0],
    localStartTime: '02:30',
  });
  expect(gap.status).toBe(422);
  expect(gap.body.error.code).toBe('RECURRENCE_TIME_INVALID');
  // 2027-11-07 01:30 happens twice; REJECT policy refuses the ambiguity.
  const fold = await post(`/agency/patients/${patientId}/care-plans`, {
    agencyServiceId: clinicalServiceId,
    ...planContent,
    validFrom: '2027-11-07',
    validUntil: '2027-11-07',
    weekdays: [0],
    localStartTime: '01:30',
  });
  expect(fold.status).toBe(422);
  expect(fold.body.error.code).toBe('RECURRENCE_TIME_INVALID');
  // Explicit EARLIEST resolution is accepted.
  expect(
    (
      await post(`/agency/patients/${patientId}/care-plans`, {
        agencyServiceId: clinicalServiceId,
        ...planContent,
        validFrom: '2027-11-07',
        validUntil: '2027-11-07',
        weekdays: [0],
        localStartTime: '01:30',
        dstResolution: 'EARLIEST',
      })
    ).status,
  ).toBe(201);
});

it('denies clinical approval without a verified qualification for the service', async () => {
  const plan = await createPlan();
  const denial = await post(
    `/agency/care-plans/${plan.id}/approve-clinical`,
    { version: 1 },
    coordinator,
  );
  expect(denial.status).toBe(403);
  expect(denial.body.error.code).toBe('FORBIDDEN');
  const ownerDenial = await post(`/agency/care-plans/${plan.id}/approve-clinical`, {
    version: 1,
  });
  expect(ownerDenial.status).toBe(403);
  // Cross-tenant staff session is rejected by the host-realm boundary.
  const crossTenant = await request(app)
    .post(`/v1/agency/care-plans/${plan.id}/approve-clinical`)
    .set('Host', host)
    .set('Cookie', ownerB.cookie)
    .set('X-CSRF-Token', ownerB.csrf)
    .send({ version: 1 });
  expect([401, 404]).toContain(crossTenant.status);
  // A caregiver without matching independently verified evidence is denied.
  const caregiverDenial = await post(
    `/agency/care-plans/${plan.id}/approve-clinical`,
    { version: 1 },
    caregiverActor,
  );
  expect(caregiverDenial.status).toBe(403);
});

it('allows a qualified caregiver clinician but denies self-verified approval evidence', async () => {
  const staff = await db.staffAccount.findFirstOrThrow({ where: { tenantId, role: 'CAREGIVER' } });
  const ownerStaff = await db.staffAccount.findFirstOrThrow({
    where: { tenantId, role: 'AGENCY_OWNER' },
  });
  const profile = await db.caregiver.create({
    data: {
      tenantId,
      staffAccountId: staff.id,
      name: 'Synthetic clinician',
      professionalCategory: 'Synthetic nurse',
      operationalStatus: 'ACTIVE',
      serviceAreasJson: ['central'],
    },
  });
  const qualification = await db.caregiverQualification.create({
    data: {
      tenantId,
      caregiverId: profile.id,
      code: 'SYNTHETIC_LICENSE',
      licenseIssuer: 'Synthetic board',
      licenseNumberRestricted: 'SYNTHETIC',
      status: 'VERIFIED',
      verifiedBy: staff.id,
      verifiedAt: new Date(),
      validThrough: '2027-12-31',
    },
  });
  const plan = await createPlan();
  expect(
    (await post(`/agency/care-plans/${plan.id}/approve-clinical`, { version: 1 }, caregiverActor))
      .status,
  ).toBe(403);
  await db.caregiverQualification.update({
    where: { id: qualification.id },
    data: { verifiedBy: ownerStaff.id },
  });
  const approved = await post(
    `/agency/care-plans/${plan.id}/approve-clinical`,
    { version: 1 },
    caregiverActor,
  );
  expect(approved.status).toBe(200);
  expect(approved.body.data.status).toBe('APPROVED');
});

it('reviewer with the verified qualification approves the exact version; stale version rejected', async () => {
  const plan = await createPlan();
  const approved = await post(
    `/agency/care-plans/${plan.id}/approve-clinical`,
    { version: 1 },
    reviewer,
  );
  expect(approved.status).toBe(200);
  expect(approved.body.data.status).toBe('APPROVED');
  expect(approved.body.data.approvedAt).toBeTruthy();
  // Re-approving the same (no longer draft) version is a state violation.
  const repeat = await post(
    `/agency/care-plans/${plan.id}/approve-clinical`,
    { version: 1 },
    reviewer,
  );
  expect(repeat.status).toBe(409);
  await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'stale-version-activate-0001',
  );
  // After an activated plan is revised and v2 becomes current, approving v1 is stale.
  await post(`/agency/care-plans/${plan.id}/revise`, planContent, coordinator);
  const stale = await post(
    `/agency/care-plans/${plan.id}/approve-clinical`,
    { version: 1 },
    reviewer,
  );
  expect(stale.status).toBe(409);
  expect(stale.body.error.code).toBe('VERSION_CONFLICT');
});

it('refuses activation of a clinical plan without approval', async () => {
  const plan = await createPlan();
  const response = await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'activate-no-approval-key-0001',
  );
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('STATE_TRANSITION_INVALID');
});

it('activation generates PLANNED unassigned visits with snapshots; replay is stable (U14/I09)', async () => {
  const plan = await createPlan();
  await post(`/agency/care-plans/${plan.id}/approve-clinical`, { version: 1 }, reviewer);
  const preview = await get(`/agency/care-plans/${plan.id}/generation-preview`);
  expect(preview.status).toBe(200);
  expect(preview.body.data.occurrenceCount).toBe(8); // 4 Mondays + 4 Wednesdays
  expect(preview.body.data.clinicalApprovalRequired).toBe(true);
  expect(preview.body.data.occurrences[0].startUtc).toBe('2026-12-02T14:00:00.000Z'); // 09:00 EST

  const activation = await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'activate-replay-key-000000001',
  );
  expect(activation.status).toBe(200);
  expect(activation.body.data).toMatchObject({
    status: 'ACTIVE',
    version: 1,
    generatedVisits: 8,
    cancelledVisits: 0,
    replay: false,
  });
  // Mon/Wed between 2026-12-01 and 2026-12-28 inclusive:
  // Dec 2,7,9,14,16,21,23,28
  const visits = await db.visit.findMany({
    where: { tenantId, carePlanId: plan.id },
    orderBy: { scheduledStartUtc: 'asc' },
    include: { tasks: true },
  });
  expect(visits).toHaveLength(8);
  for (const visit of visits) {
    expect(visit.status).toBe('PLANNED');
    expect(visit.assignedCaregiverId).toBeNull();
    expect(visit.timezoneSnapshot).toBe('America/New_York');
    expect(visit.areaId).toBe('central');
    expect((visit.serviceNameSnapshot as { nameEn: string }).nameEn).toBe(
      'Synthetic recurring service',
    );
    expect(visit.tasks).toHaveLength(2);
    expect(visit.tasks.map((t) => t.descriptionSnapshot)).toEqual([
      'Synthetic task A',
      'Synthetic task B',
    ]);
  }
  // Same idempotency key replays the stored summary.
  const replay = await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'activate-replay-key-000000001',
  );
  expect(replay.status).toBe(200);
  expect(replay.body.data.replay).toBe(false); // stored summary from first run
  expect(replay.body.data.generatedVisits).toBe(8);
  // A different key returns a stable result without duplicating occurrences.
  const parallelKey = await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'activate-replay-key-000000002',
  );
  expect(parallelKey.status).toBe(200);
  expect(parallelKey.body.data.replay).toBe(true);
  expect(await db.visit.count({ where: { tenantId, carePlanId: plan.id } })).toBe(8);
});

it('parallel activation of the same plan yields one occurrence set (I09)', async () => {
  const plan = await createPlan({
    weekdays: [3],
    validFrom: '2026-12-02',
    validUntil: '2026-12-30',
  });
  await post(`/agency/care-plans/${plan.id}/approve-clinical`, { version: 1 }, reviewer);
  const [a, b] = await Promise.all([
    post(
      `/agency/care-plans/${plan.id}/activate`,
      { version: 1 },
      coordinator,
      'i09-key-a-000000000001',
    ),
    post(`/agency/care-plans/${plan.id}/activate`, { version: 1 }, owner, 'i09-key-b-000000000001'),
  ]);
  expect([a.status, b.status]).toEqual([200, 200]);
  // Exactly one writer created the 5 Wednesdays; the loser returned the same
  // stable occurrence set (replay) instead of duplicating rows.
  const replies = [a.body.data, b.body.data];
  expect(replies.filter((r) => r.replay)).toHaveLength(1);
  expect(replies.every((r) => r.generatedVisits === 5)).toBe(true);
  expect(await db.visit.count({ where: { tenantId, carePlanId: plan.id } })).toBe(5);
  const keys = await db.visit.findMany({
    where: { tenantId, carePlanId: plan.id },
    select: { occurrenceKey: true },
  });
  expect(new Set(keys.map((k) => k.occurrenceKey)).size).toBe(5);
});

it('amendment creates a new version, previews impact and replaces only future PLANNED visits', async () => {
  const plan = await createPlan();
  await post(`/agency/care-plans/${plan.id}/approve-clinical`, { version: 1 }, reviewer);
  await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'amend-activate-key-0001',
  );
  // Revise: same pattern, later start time, shorter range from Dec 14.
  const revise = await post(
    `/agency/care-plans/${plan.id}/revise`,
    { ...planContent, validFrom: '2026-12-14', validUntil: '2026-12-28', localStartTime: '10:00' },
    coordinator,
  );
  expect(revise.status).toBe(201);
  expect(revise.body.data.version).toBe(2);
  expect(revise.body.data.status).toBe('DRAFT');
  // Prior approved version is immutable history.
  const v1 = await db.carePlanVersion.findFirst({
    where: { tenantId, carePlanId: plan.id, version: 1 },
  });
  expect(v1!.status).toBe('ACTIVATED');
  const preview = await get(`/agency/care-plans/${plan.id}/generation-preview`);
  expect(preview.status).toBe(200);
  expect(preview.body.data.wouldCancelCount).toBe(5); // Dec 14,16,21,23,28 PLANNED
  await post(`/agency/care-plans/${plan.id}/approve-clinical`, { version: 2 }, reviewer);
  const amended = await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 2 },
    coordinator,
    'amend-activate-key-0002',
  );
  expect(amended.status).toBe(200);
  expect(amended.body.data).toMatchObject({ version: 2, generatedVisits: 5, cancelledVisits: 5 });
  const visits = await db.visit.findMany({
    where: { tenantId, carePlanId: plan.id },
    orderBy: { scheduledStartUtc: 'asc' },
  });
  // Old Dec 2..11 visits stay PLANNED on v1; Dec 14..28 were replaced by v2 at 10:00.
  const statuses = visits.filter((v) => v.scheduledStartUtc < new Date('2026-12-14T00:00:00Z'));
  expect(statuses).toHaveLength(3);
  expect(statuses.every((v) => v.status === 'PLANNED')).toBe(true);
  const replaced = visits.filter((v) => v.status === 'CANCELLED');
  expect(replaced).toHaveLength(5);
  expect(replaced.every((v) => v.cancelledReason === 'Superseded by plan version 2')).toBe(true);
  const active = visits.filter(
    (v) => v.status === 'PLANNED' && v.scheduledStartUtc >= new Date('2026-12-14T00:00:00Z'),
  );
  expect(active).toHaveLength(5);
  expect(active[0]!.scheduledStartUtc.toISOString()).toBe('2026-12-14T15:00:00.000Z'); // 10:00 EST
});

it('pause keeps or cancels future PLANNED visits but never SCHEDULED; resume and lifecycle guards work', async () => {
  const plan = await createPlan();
  await post(`/agency/care-plans/${plan.id}/approve-clinical`, { version: 1 }, reviewer);
  await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'pause-key-00000000001',
  );
  // Mark one visit SCHEDULED directly to represent a confirmed appointment.
  const visits = await db.visit.findMany({
    where: { tenantId, carePlanId: plan.id },
    orderBy: { scheduledStartUtc: 'asc' },
  });
  await db.visit.update({
    where: { id: visits[0]!.id },
    data: { status: 'SCHEDULED', assignedCaregiverId: reviewerCaregiverId },
  });
  const pause = await post(`/agency/care-plans/${plan.id}/pause`, {
    plannedVisitsAction: 'CANCEL',
    reason: 'Synthetic pause with cancellation',
  });
  expect(pause.status).toBe(200);
  expect(pause.body.data.status).toBe('PAUSED');
  expect(pause.body.data.cancelledVisits).toBe(7); // only PLANNED unassigned
  const after = await db.visit.findMany({ where: { tenantId, carePlanId: plan.id } });
  expect(after.filter((v) => v.status === 'SCHEDULED')).toHaveLength(1); // untouched
  expect(after.filter((v) => v.status === 'CANCELLED')).toHaveLength(7);
  const resume = await post(`/agency/care-plans/${plan.id}/resume`, {});
  expect(resume.status).toBe(200);
  expect(resume.body.data.status).toBe('ACTIVE');
  // Completing with a future SCHEDULED visit is refused.
  const complete = await post(`/agency/care-plans/${plan.id}/complete`, {
    reason: 'Synthetic close',
  });
  expect(complete.status).toBe(409);
  await db.visit.update({ where: { id: visits[0]!.id }, data: { status: 'COMPLETED' } });
  const cancel = await post(`/agency/care-plans/${plan.id}/cancel`, {
    reason: 'Synthetic cancellation',
    plannedVisitsAction: 'KEEP',
  });
  expect(cancel.status).toBe(200);
  expect(cancel.body.data.status).toBe('CANCELLED');
  // Terminal plan refuses further activation.
  const reactivate = await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'pause-key-00000000002',
  );
  expect(reactivate.status).toBe(409);
});

it('non-clinical service activates without clinical approval', async () => {
  const response = await post(`/agency/patients/${patientId}/care-plans`, {
    agencyServiceId: nonClinicalServiceId,
    ...planContent,
    weekdays: [4],
    clinicalInstructionsRestricted: null,
  });
  expect(response.status).toBe(201);
  const plan = response.body.data as { id: string };
  const approval = await post(
    `/agency/care-plans/${plan.id}/approve-clinical`,
    { version: 1 },
    reviewer,
  );
  expect(approval.status).toBe(409); // not required for this service
  const activation = await post(
    `/agency/care-plans/${plan.id}/activate`,
    { version: 1 },
    coordinator,
    'nonclinical-key-00000001',
  );
  expect(activation.status).toBe(200);
  expect(activation.body.data.generatedVisits).toBe(4); // Fridays Dec 4,11,18,25
});

it('cross-tenant plan and visit reads are 404 (I01 objects)', async () => {
  const otherPatient = await db.patient.create({
    data: {
      tenantId: tenantB,
      displayName: 'Synthetic Tenant B Patient',
      normalizedName: 'synthetic tenant b patient',
      areaId: 'central',
    },
  });
  const otherService = await db.agencyService.create({
    data: {
      tenantId: tenantB,
      slug: `tenant-b-${randomUUID()}`,
      config: serviceConfig({ clinicalClass: 'NON_CLINICAL', requiredQualificationCodes: [] }),
    },
  });
  const otherPlan = await db.carePlan.create({
    data: {
      tenantId: tenantB,
      patientId: otherPatient.id,
      agencyServiceId: otherService.id,
      status: 'ACTIVE',
      currentVersion: 1,
    },
  });
  const otherVersion = await db.carePlanVersion.create({
    data: {
      tenantId: tenantB,
      carePlanId: otherPlan.id,
      version: 1,
      status: 'ACTIVATED',
      validFrom: '2026-12-01',
      validUntil: '2026-12-01',
      weekdaysJson: [2],
      localStartTime: '09:00',
      durationMin: 60,
      taskTemplatesJson: [],
      timezoneSnapshot: 'Asia/Riyadh',
      dstResolution: 'REJECT',
    },
  });
  const otherVisit = await db.visit.create({
    data: {
      tenantId: tenantB,
      patientId: otherPatient.id,
      agencyServiceId: otherService.id,
      carePlanId: otherPlan.id,
      planVersionId: otherVersion.id,
      occurrenceKey: `v-${otherVersion.id}|2026-12-01|0`,
      areaId: 'central',
      serviceNameSnapshot: { nameAr: 'خدمة', nameEn: 'Synthetic' },
      scheduledStartUtc: new Date('2026-12-01T06:00:00Z'),
      scheduledEndUtc: new Date('2026-12-01T07:00:00Z'),
      timezoneSnapshot: 'Asia/Riyadh',
    },
  });
  const planRead = await get(`/agency/care-plans/${otherPlan.id}`, owner);
  expect(planRead.status).toBe(404);
  const visitRead = await get(`/agency/visits/${otherVisit.id}`, owner);
  expect(visitRead.status).toBe(404);
});

it('caregiver-role principals cannot manage plans or read visits', async () => {
  const plan = await createPlan();
  const create = await post(
    `/agency/patients/${patientId}/care-plans`,
    planContent,
    caregiverActor,
  );
  expect(create.status).toBe(403);
  const list = await get('/agency/visits', caregiverActor);
  expect(list.status).toBe(403);
  const detail = await get(`/agency/care-plans/${plan.id}`, caregiverActor);
  expect(detail.status).toBe(403);
});

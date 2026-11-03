import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';

const db = getPrisma();
const slug = `planlink-${randomUUID().slice(0, 8)}`;
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
let patientId: string;
let otherPatientId: string;
let serviceId: string;
let otherServiceId: string;
let approvedRequestId: string;
let unlinkedRequestId: string;
let wrongPatientRequestId: string;
let wrongServiceRequestId: string;
let submittedRequestId: string;
let crossTenantRequestId: string;

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
const post = (path: string, body: object, actor = owner) =>
  request(app)
    .post(`/v1${path}`)
    .set('Host', host)
    .set('Cookie', actor.cookie)
    .set('X-CSRF-Token', actor.csrf)
    .send(body);

const serviceConfig = {
  nameAr: 'خدمة الارتباط الاصطناعية',
  nameEn: 'Synthetic linkage service',
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

const planContent = {
  validFrom: '2026-12-01',
  validUntil: '2026-12-28',
  weekdays: [2],
  localStartTime: '09:00',
  durationMin: 60,
  goalText: 'Synthetic goal',
  taskTemplates: [{ description: 'Synthetic task A', isRequired: true }],
  clinicalInstructionsRestricted: null,
  dstResolution: 'REJECT' as const,
};

const requestData = {
  requesterName: 'Synthetic Requester',
  requesterEmailNormalized: 'requester@example.invalid',
  requesterPhone: '',
  beneficiaryName: 'Synthetic beneficiary',
  relationship: 'OTHER',
  areaId: 'central',
  preferredWindowJson: { date: '2026-12-05', period: 'MORNING' },
  notesRestricted: '',
  locale: 'en',
  privacyVersion: 'test',
  serviceSnapshot: { pricingType: 'CUSTOM_QUOTE', priceMinor: null },
  priceAcknowledged: true,
};

async function createRequest(data: {
  tenantId: string;
  agencyServiceId: string;
  patientId: string | null;
  status: string;
}) {
  return (
    await db.serviceRequest.create({
      data: {
        ...requestData,
        tenantId: data.tenantId,
        agencyServiceId: data.agencyServiceId,
        patientId: data.patientId,
        status: data.status,
        reference: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash: 'synthetic',
      },
      select: { id: true },
    })
  ).id;
}

beforeAll(async () => {
  const base = {
    legalName: 'Synthetic Linkage Tests',
    displayName: 'Synthetic Link',
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
  owner = await session(ownerRow.id, tenantId);
  coordinator = await session(coordinatorRow.id, tenantId);
  patientId = (
    await db.patient.create({
      data: {
        tenantId,
        displayName: 'Synthetic Linkage Patient',
        normalizedName: 'synthetic linkage patient',
        areaId: 'central',
      },
    })
  ).id;
  otherPatientId = (
    await db.patient.create({
      data: {
        tenantId,
        displayName: 'Synthetic Other Patient',
        normalizedName: 'synthetic other patient',
        areaId: 'central',
      },
    })
  ).id;
  serviceId = (
    await db.agencyService.create({
      data: { tenantId, slug: `link-${randomUUID()}`, config: serviceConfig },
    })
  ).id;
  otherServiceId = (
    await db.agencyService.create({
      data: { tenantId, slug: `other-${randomUUID()}`, config: serviceConfig },
    })
  ).id;
  approvedRequestId = await createRequest({
    tenantId,
    agencyServiceId: serviceId,
    patientId,
    status: 'APPROVED',
  });
  unlinkedRequestId = await createRequest({
    tenantId,
    agencyServiceId: serviceId,
    patientId: null,
    status: 'APPROVED',
  });
  wrongPatientRequestId = await createRequest({
    tenantId,
    agencyServiceId: serviceId,
    patientId: otherPatientId,
    status: 'APPROVED',
  });
  wrongServiceRequestId = await createRequest({
    tenantId,
    agencyServiceId: otherServiceId,
    patientId,
    status: 'APPROVED',
  });
  submittedRequestId = await createRequest({
    tenantId,
    agencyServiceId: serviceId,
    patientId,
    status: 'SUBMITTED',
  });
  const patientB = await db.patient.create({
    data: {
      tenantId: tenantB,
      displayName: 'Synthetic Tenant B Patient',
      normalizedName: 'synthetic tenant b patient',
      areaId: 'central',
    },
  });
  const serviceB = await db.agencyService.create({
    data: { tenantId: tenantB, slug: `tenant-b-${randomUUID()}`, config: serviceConfig },
  });
  crossTenantRequestId = await createRequest({
    tenantId: tenantB,
    agencyServiceId: serviceB.id,
    patientId: patientB.id,
    status: 'APPROVED',
  });
});

afterAll(async () => {
  for (const id of [tenantId, tenantB].filter(Boolean)) {
    await db.visitAssignmentHistory.deleteMany({ where: { tenantId: id } });
    await db.visitTask.deleteMany({ where: { tenantId: id } });
    await db.visit.deleteMany({ where: { tenantId: id } });
    await db.carePlanVersion.deleteMany({ where: { tenantId: id } });
    await db.carePlan.deleteMany({ where: { tenantId: id } });
    await db.requestStatusHistory.deleteMany({ where: { tenantId: id } });
    await db.serviceRequest.deleteMany({ where: { tenantId: id } });
    await db.agencyService.deleteMany({ where: { tenantId: id } });
    await db.patient.deleteMany({ where: { tenantId: id } });
    await db.auditEvent.deleteMany({ where: { tenantId: id } });
    await db.outboxEvent.deleteMany({ where: { tenantId: id } });
    await db.authSession.deleteMany({ where: { tenantId: id } });
    await db.staffAccount.deleteMany({ where: { tenantId: id } });
    await db.tenant.delete({ where: { id } });
  }
});

const createPlanFor = (patient: string, serviceRequestId: string | null) =>
  post(
    `/agency/patients/${patient}/care-plans`,
    {
      agencyServiceId: serviceId,
      primaryCaregiverId: null,
      serviceRequestId,
      ...planContent,
    },
    coordinator,
  );

it('creates a manual plan without a request and a plan linked to an approved matching request', async () => {
  const manual = await createPlanFor(patientId, null);
  expect(manual.status).toBe(201);
  expect(manual.body.data.status).toBe('DRAFT');
  const manualRow = await db.carePlan.findFirst({
    where: { tenantId, id: manual.body.data.id },
    select: { serviceRequestId: true },
  });
  expect(manualRow!.serviceRequestId).toBeNull();
  const linked = await createPlanFor(patientId, approvedRequestId);
  expect(linked.status).toBe(201);
  const linkedRow = await db.carePlan.findFirst({
    where: { tenantId, id: linked.body.data.id },
    select: { serviceRequestId: true },
  });
  expect(linkedRow!.serviceRequestId).toBe(approvedRequestId);
});

it('rejects an approved request that is not linked to the plan patient (unlinked)', async () => {
  const response = await createPlanFor(patientId, unlinkedRequestId);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('STATE_TRANSITION_INVALID');
});

it('rejects an approved request linked to another same-tenant patient', async () => {
  const response = await createPlanFor(patientId, wrongPatientRequestId);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('STATE_TRANSITION_INVALID');
});

it('rejects an approved request for another same-tenant service', async () => {
  const response = await createPlanFor(patientId, wrongServiceRequestId);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('STATE_TRANSITION_INVALID');
});

it('rejects a same-tenant request that has not been approved', async () => {
  const response = await createPlanFor(patientId, submittedRequestId);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('STATE_TRANSITION_INVALID');
});

it('returns a privacy-safe 404 for a cross-tenant request', async () => {
  const response = await createPlanFor(patientId, crossTenantRequestId);
  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
});

it('a failed linkage creates no plan, version, audit or outbox row', async () => {
  const before = {
    plans: await db.carePlan.count({ where: { tenantId } }),
    versions: await db.carePlanVersion.count({ where: { tenantId } }),
    audits: await db.auditEvent.count({ where: { tenantId } }),
    outbox: await db.outboxEvent.count({ where: { tenantId } }),
  };
  const response = await createPlanFor(patientId, wrongPatientRequestId);
  expect(response.status).toBe(409);
  const after = {
    plans: await db.carePlan.count({ where: { tenantId } }),
    versions: await db.carePlanVersion.count({ where: { tenantId } }),
    audits: await db.auditEvent.count({ where: { tenantId } }),
    outbox: await db.outboxEvent.count({ where: { tenantId } }),
  };
  expect(after).toEqual(before);
  expect(
    await db.carePlan.count({ where: { tenantId, serviceRequestId: wrongPatientRequestId } }),
  ).toBe(0);
});

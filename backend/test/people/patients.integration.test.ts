import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { loadApiEnv } from '../../src/config/env';
import { createLogger } from '../../src/logger';
import { createSession } from '../../src/modules/auth/session.service';

const db = getPrisma();
const slug = `pat-${randomUUID().slice(0, 8)}`;
const host = `${slug}.localhost`;
const objects = new Map<string, Buffer>();
let scanOutcome: 'CLEAN' | 'REJECTED' | 'QUARANTINED' = 'CLEAN';
const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
  db,
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
  now: () => new Date(),
  privateStorage: {
    putImmutable: async (key, bytes) => {
      if (objects.has(key)) throw new Error('Immutable');
      objects.set(key, Buffer.from(bytes));
    },
    read: async (key, max) => {
      const bytes = objects.get(key);
      if (!bytes || bytes.length > max) throw new Error('Unavailable');
      return bytes;
    },
  },
  malwareScanner: async () => scanOutcome,
});
let tenantId: string;
let tenantB: string;
let customerId: string;
let owner: { cookie: string; csrf: string };
let customer: { cookie: string; csrf: string };
let caregiver: { cookie: string; csrf: string };
let patientId: string;
const profile = {
  displayName: 'Synthetic Same Person',
  dateOfBirth: '1960-02-20',
  contact: 'synthetic@example.invalid',
  areaId: 'central',
  addressRestricted: 'Restricted address',
  notesRestricted: 'Restricted note',
};
async function session(principalId: string, principalType: 'AGENCY_STAFF' | 'AGENCY_CUSTOMER') {
  const created = await createSession(db, {
    principalId,
    principalType,
    tenantId,
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
const get = (path: string, actor = owner) =>
  request(app).get(`/v1${path}`).set('Host', host).set('Cookie', actor.cookie);
beforeAll(async () => {
  const data = {
    legalName: 'Synthetic Patient Tests',
    displayName: 'Synthetic',
    status: 'ACTIVE' as const,
    timezone: 'Asia/Riyadh',
    currency: 'SAR',
    supportEmail: 'support@example.invalid',
  };
  tenantId = (await db.tenant.create({ data: { ...data, slug } })).id;
  tenantB = (await db.tenant.create({ data: { ...data, slug: `${slug}-b` } })).id;
  const staff = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: 'owner@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      role: 'AGENCY_OWNER',
    },
  });
  owner = await session(staff.id, 'AGENCY_STAFF');
  const cg = await db.staffAccount.create({
    data: {
      tenantId,
      emailNormalized: 'cg@example.invalid',
      passwordHash: 'unused',
      status: 'ACTIVE',
      role: 'CAREGIVER',
    },
  });
  caregiver = await session(cg.id, 'AGENCY_STAFF');
  customerId = (
    await db.customerAccount.create({
      data: {
        tenantId,
        emailNormalized: 'customer@example.invalid',
        passwordHash: 'unused',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    })
  ).id;
  customer = await session(customerId, 'AGENCY_CUSTOMER');
});
afterAll(async () => {
  for (const id of [tenantId, tenantB].filter(Boolean)) {
    await db.documentTicket.deleteMany({ where: { tenantId: id } });
    await db.caregiverQualification.deleteMany({ where: { tenantId: id } });
    await db.caregiverServiceAuthorization.deleteMany({ where: { tenantId: id } });
    await db.availabilitySlot.deleteMany({ where: { tenantId: id } });
    await db.availabilityException.deleteMany({ where: { tenantId: id } });
    await db.caregiver.deleteMany({ where: { tenantId: id } });
    await db.patientDuplicateReview.deleteMany({ where: { tenantId: id } });
    await db.patientAccess.deleteMany({ where: { tenantId: id } });
    await db.document.deleteMany({ where: { tenantId: id } });
    await db.serviceRequest.deleteMany({ where: { tenantId: id } });
    await db.agencyService.deleteMany({ where: { tenantId: id } });
    await db.patient.deleteMany({ where: { tenantId: id } });
    await db.outboxEvent.deleteMany({ where: { tenantId: id } });
    await db.auditEvent.deleteMany({ where: { tenantId: id } });
    await db.authSession.deleteMany({ where: { tenantId: id } });
    await db.customerAccount.deleteMany({ where: { tenantId: id } });
    await db.staffAccount.deleteMany({ where: { tenantId: id } });
    await db.tenant.delete({ where: { id } });
  }
  await db.$disconnect();
});

it('I16 validates private file signatures and quarantine; I01/U12 enforce parent, classification and revoked download authority', async () => {
  const patient = await db.patient.create({
    data: {
      tenantId,
      displayName: 'Synthetic documents',
      normalizedName: 'synthetic documents',
      areaId: 'central',
    },
  });
  const pdf = Buffer.from('%PDF-1.7\nSynthetic test document only\n%%EOF');
  const intent = () =>
    post('/documents/upload-intent', {
      parentType: 'PATIENT',
      parentId: patient.id,
      classification: 'PATIENT_ATTACHMENT',
      originalName: 'synthetic.pdf',
      mime: 'application/pdf',
      sizeBytes: pdf.length,
    });
  const upload = (id: string, bytes: Buffer) =>
    request(app)
      .put(`/v1/documents/${id}/upload`)
      .set('Host', host)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrf)
      .set('Content-Type', 'application/pdf')
      .send(bytes);
  const unsafe = await intent();
  expect(unsafe.status).toBe(201);
  expect((await upload(unsafe.body.data.id, Buffer.alloc(pdf.length, 65))).status).toBe(422);
  expect((await get(`/documents/${unsafe.body.data.id}/download`)).status).toBe(404);
  const quarantined = await intent();
  expect((await upload(quarantined.body.data.id, pdf)).status).toBe(200);
  scanOutcome = 'QUARANTINED';
  expect(
    (await post(`/documents/${quarantined.body.data.id}/finalize`, {})).body.data.scanStatus,
  ).toBe('QUARANTINED');
  expect((await get(`/documents/${quarantined.body.data.id}/download`)).status).toBe(404);
  scanOutcome = 'CLEAN';
  const clean = await intent();
  const id = clean.body.data.id as string;
  await upload(id, pdf);
  expect((await get(`/documents/${id}/download`)).status).toBe(404); // Not scanned yet.
  expect((await post(`/documents/${id}/finalize`, {})).body.data.scanStatus).toBe('CLEAN');
  const ownerDownload = await get(`/documents/${id}/download`);
  const changedDuringRead = buildApp({
    env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
    db,
    now: () => new Date(),
    logger: createLogger({ service: 'test', write: () => {} }),
    health: { checkDatabase: async () => true },
    privateStorage: {
      putImmutable: async () => {
        throw new Error('Unused');
      },
      read: async () => {
        await db.document.update({ where: { id }, data: { scanStatus: 'QUARANTINED' } });
        return pdf;
      },
    },
  });
  expect(
    (
      await request(changedDuringRead)
        .get(ownerDownload.body.data.url)
        .set('Host', host)
        .set('Cookie', owner.cookie)
    ).status,
  ).toBe(404);
  await db.document.update({ where: { id }, data: { scanStatus: 'CLEAN' } }); // Restore the synthetic fixture, not a production rescan.
  expect((await get(`/documents/${id}/download`, customer)).status).toBe(404);
  const grant = await post(`/agency/patients/${patient.id}/access-grants`, {
    customerAccountId: customerId,
    scopes: ['VIEW_DOCUMENTS'],
    authorizationType: 'PATIENT_CONSENT',
  });
  const signed = await get(`/documents/${id}/download`, customer);
  expect(signed.status).toBe(200);
  expect(JSON.stringify(signed.body)).not.toContain(tenantId);
  expect((await get(signed.body.data.url.slice(3), customer)).status).toBe(200);
  await post(`/agency/patient-access/${grant.body.data.id}/revoke`, {
    reason: 'Revoke synthetic document authority',
  });
  expect((await get(signed.body.data.url.slice(3), customer)).status).toBe(404);
  expect((await get(`/documents/${id}/download`, customer)).status).toBe(404);
  const otherPatient = await db.patient.create({
    data: {
      tenantId: tenantB,
      displayName: 'Synthetic documents',
      normalizedName: 'synthetic documents',
      areaId: 'central',
    },
  });
  const other = await db.document.create({
    data: {
      tenantId: tenantB,
      parentId: otherPatient.id,
      parentType: 'PATIENT',
      classification: 'PATIENT_ATTACHMENT',
      storageKey: randomUUID(),
      originalNameRestricted: 'secret.pdf',
      mime: 'application/pdf',
      sizeBytes: 10,
      createdBy: randomUUID(),
      uploadExpiresAt: new Date(),
    },
  });
  expect((await get(`/documents/${other.id}`)).status).toBe(404);
  expect(
    (
      await post('/documents/upload-intent', {
        parentType: 'PATIENT',
        parentId: randomUUID(),
        classification: 'PATIENT_ATTACHMENT',
        originalName: 'synthetic.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
      })
    ).status,
  ).toBe(404);
});

it('denies platform content browsing and every People audience on a suspended tenant', async () => {
  const operator = await db.platformOperator.create({
    data: { emailNormalized: `${slug}@example.invalid`, passwordHash: 'unused' },
  });
  const platform = await createSession(db, {
    principalId: operator.id,
    principalType: 'PLATFORM_OPERATOR',
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
  try {
    expect(
      (
        await request(app)
          .get('/v1/agency/patients')
          .set('Host', 'platform.localhost')
          .set('Cookie', `raak_session_platform=${platform.sessionToken}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(`/v1/documents/${randomUUID()}`)
          .set('Host', 'platform.localhost')
          .set('Cookie', `raak_session_platform=${platform.sessionToken}`)
      ).status,
    ).toBe(404);
    await db.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } });
    for (const [path, actor] of [
      ['/agency/patients', owner],
      ['/agency/caregivers', owner],
      ['/portal/my/patients', customer],
      ['/caregiver/my/profile', caregiver],
    ] as const)
      expect((await get(path, actor)).status).toBe(401);
  } finally {
    await db.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });
    await db.authSession.deleteMany({ where: { principalId: operator.id } });
    await db.platformOperator.delete({ where: { id: operator.id } });
  }
});

it('checks independent qualification verification, expiry, service authority and revised local availability without confirming bookings', async () => {
  const staff = await db.staffAccount.findFirstOrThrow({ where: { tenantId, role: 'CAREGIVER' } });
  await db.staffAccount.update({ where: { id: staff.id }, data: { emailVerifiedAt: new Date() } });
  const cg = await db.caregiver.create({
    data: {
      tenantId,
      staffAccountId: staff.id,
      name: 'Synthetic caregiver',
      professionalCategory: 'Support',
      operationalStatus: 'ACTIVE',
      serviceAreasJson: ['central'],
    },
  });
  const service = await db.agencyService.create({
    data: {
      tenantId,
      slug: `clinical-${randomUUID()}`,
      config: {
        nameAr: 'خدمة اصطناعية',
        nameEn: 'Synthetic service',
        summaryAr: 'ملخص',
        summaryEn: 'Summary',
        descriptionAr: 'للتجربة فقط',
        descriptionEn: 'Synthetic only',
        durationMin: 60,
        clinicalClass: 'CLINICAL',
        requiredQualificationCodes: ['SYNTHETIC_LICENSE'],
        serviceAreaIds: ['central'],
        allowStandalone: true,
        allowRecurring: false,
        pricingType: 'CUSTOM_QUOTE',
        priceMinor: null,
        pricingUnit: null,
      },
    },
  });
  const check = () =>
    post(`/agency/caregivers/${cg.id}/eligibility`, {
      serviceId: service.id,
      localDate: '2026-12-07',
      startLocal: '09:00',
      endLocal: '10:00',
    });
  expect((await check()).body.data.reasons).toContain('QUALIFICATION_INVALID');
  const q = await post(`/agency/caregivers/${cg.id}/qualifications`, {
    code: 'SYNTHETIC_LICENSE',
    licenseIssuer: 'Synthetic issuer',
    licenseNumberRestricted: 'PRIVATE-LICENSE',
    validThrough: '2026-12-07',
  });
  expect(q.status).toBe(201);
  expect(
    (
      await post(
        `/agency/qualifications/${q.body.data.id}/verify`,
        { expectedVersion: 1, decision: 'VERIFIED' },
        caregiver,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await post(`/agency/qualifications/${q.body.data.id}/verify`, {
        expectedVersion: 1,
        decision: 'VERIFIED',
      })
    ).status,
  ).toBe(200);
  const authorized = await request(app)
    .put(`/v1/agency/caregivers/${cg.id}/service-authorizations`)
    .set('Host', host)
    .set('Cookie', owner.cookie)
    .set('X-CSRF-Token', owner.csrf)
    .send({ expectedVersion: 1, serviceIds: [service.id] });
  expect(authorized.status).toBe(200);
  const putSlots = (revision: number) =>
    request(app)
      .put(`/v1/agency/caregivers/${cg.id}/availability`)
      .set('Host', host)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrf)
      .send({
        expectedRevision: revision,
        slots: [{ weekday: 1, localStartTime: '08:00', localEndTime: '16:00' }],
      });
  expect((await putSlots(1)).status).toBe(200);
  expect((await putSlots(1)).status).toBe(409);
  expect((await check()).body.data).toMatchObject({
    foundationEligible: true,
    bookingAvailabilityChecked: false,
    appointmentConfirmed: false,
  });
  expect(
    (
      await post(`/agency/caregivers/${cg.id}/eligibility`, {
        serviceId: service.id,
        localDate: '2026-12-08',
        startLocal: '09:00',
        endLocal: '10:00',
      })
    ).body.data.reasons,
  ).toContain('QUALIFICATION_INVALID');
  expect(
    (
      await post(`/agency/caregivers/${cg.id}/exceptions`, {
        expectedRevision: 2,
        localDate: '2026-12-07',
        type: 'UNAVAILABLE',
        reason: 'Synthetic leave',
      })
    ).status,
  ).toBe(200);
  expect((await check()).body.data.reasons).toContain('OUTSIDE_AVAILABILITY');
  const own = await get('/caregiver/my/profile', caregiver);
  expect(own.status).toBe(200);
  expect(JSON.stringify(own.body)).not.toContain('PRIVATE-LICENSE');
  expect(
    (
      await post(`/agency/qualifications/${q.body.data.id}/verify`, {
        expectedVersion: 2,
        decision: 'REJECTED',
        reason: 'Agency withdrew synthetic verification',
      })
    ).status,
  ).toBe(200);
  expect((await check()).body.data.reasons).toContain('QUALIFICATION_INVALID');
});

it('creates operational profiles and requires explicit reasoned duplicate review; never merges', async () => {
  const first = await post('/agency/patients', { profile, duplicateReviews: [] });
  expect(first.status).toBe(201);
  patientId = first.body.data.id as string;
  const duplicate = await post('/agency/patients', { profile, duplicateReviews: [] });
  expect(duplicate.status).toBe(409);
  const suggestions = await post('/agency/patients/duplicates/check', profile);
  expect(suggestions.status).toBe(200);
  expect(suggestions.body.data.items.map((v: { id: string }) => v.id)).toContain(patientId);
  expect(JSON.stringify(suggestions.body)).not.toContain('Restricted');
  const second = await post('/agency/patients', {
    profile,
    duplicateReviews: [
      { candidateId: patientId, reason: 'Agency reviewed distinct synthetic person' },
    ],
  });
  expect(second.status).toBe(201);
  expect(second.body.data.id).not.toBe(patientId);
  expect(await db.patient.count({ where: { tenantId, displayName: profile.displayName } })).toBe(2);
  expect(await db.patientDuplicateReview.count({ where: { tenantId } })).toBe(1);
});

it('requires independent grants for two summaries and enforces expiry, exact scopes and immediate revocation (U12)', async () => {
  const ids = (
    await db.patient.findMany({
      where: { tenantId, displayName: profile.displayName },
      orderBy: { id: 'asc' },
    })
  ).map((p) => p.id);
  expect((await get('/portal/my/patients', customer)).body.data.items).toEqual([]);
  const grant = await post(`/agency/patients/${ids[0]}/access-grants`, {
    customerAccountId: customerId,
    scopes: ['VIEW_BASIC'],
    authorizationType: 'PATIENT_CONSENT',
  });
  expect(grant.status).toBe(201);
  const second = await post(`/agency/patients/${ids[1]}/access-grants`, {
    customerAccountId: customerId,
    scopes: ['VIEW_DOCUMENTS'],
    authorizationType: 'AGENCY_VERIFIED_AUTHORITY',
  });
  expect(second.status).toBe(201);
  expect((await get('/portal/my/patients', customer)).body.data.items).toHaveLength(1);
  expect((await get(`/portal/my/patients/${ids[1]}`, customer)).status).toBe(404);
  await post(`/agency/patient-access/${second.body.data.id}/revoke`, {
    reason: 'Reissue with separate reviewed scope',
  });
  await post(`/agency/patients/${ids[1]}/access-grants`, {
    customerAccountId: customerId,
    scopes: ['VIEW_BASIC'],
    authorizationType: 'PATIENT_CONSENT',
  });
  const summaries = await get('/portal/my/patients', customer);
  expect(summaries.body.data.items).toHaveLength(2);
  expect(JSON.stringify(summaries.body)).not.toMatch(/Restricted|contact|dateOfBirth|verifiedBy/);
  await post(`/agency/patient-access/${grant.body.data.id}/revoke`, {
    reason: 'Synthetic authority revoked',
  });
  expect((await get(`/portal/my/patients/${ids[0]}`, customer)).status).toBe(404);
  await db.patientAccess.updateMany({
    where: { tenantId, patientId: ids[1] },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  expect((await get('/portal/my/patients', customer)).body.data.items).toHaveLength(0);
});

it('denies ungranted, unauthenticated, wrong-role and cross-tenant object-by-ID access (I01 patient)', async () => {
  const other = await db.patient.create({
    data: {
      tenantId: tenantB,
      displayName: profile.displayName,
      normalizedName: 'synthetic same person',
      areaId: 'central',
    },
  });
  expect((await get(`/agency/patients/${other.id}`)).status).toBe(404);
  expect((await get(`/portal/my/patients/${other.id}`, customer)).status).toBe(404);
  expect((await get('/agency/patients', caregiver)).status).toBe(403);
  expect((await get('/agency/patients', customer)).status).toBe(403);
  expect((await request(app).get('/v1/agency/patients').set('Host', host)).status).toBe(401);
  expect(
    (
      await post(
        `/agency/patients/${patientId}/access-grants`,
        {
          customerAccountId: customerId,
          scopes: ['VIEW_BASIC'],
          authorizationType: 'PATIENT_CONSENT',
        },
        customer,
      )
    ).status,
  ).toBe(403);
});

it('serializes approved-request patient links, returns stable replay and refuses preapproval without creating patients', async () => {
  const service = await db.agencyService.create({
    data: { tenantId, slug: `link-${randomUUID()}`, config: {} },
  });
  const data = {
    tenantId,
    agencyServiceId: service.id,
    payloadHash: 'synthetic',
    requesterName: 'Synthetic',
    requesterEmailNormalized: 'request@example.invalid',
    requesterPhone: '',
    beneficiaryName: 'Unique synthetic link',
    relationship: 'OTHER',
    areaId: 'central',
    preferredWindowJson: {},
    notesRestricted: '',
    locale: 'en',
    privacyVersion: 'test',
    serviceSnapshot: { pricingType: 'FIXED', priceMinor: 0 },
    priceAcknowledged: true,
  };
  const submitted = await db.serviceRequest.create({
    data: { ...data, reference: randomUUID(), idempotencyKey: randomUUID() },
  });
  const patients = await db.patient.findMany({
    where: { tenantId, displayName: profile.displayName },
  });
  expect(
    (
      await post(`/agency/requests/${submitted.id}/link-patient`, {
        patientId: patients[0]!.id,
        expectedVersion: 1,
        reason: 'Agency checked identity',
      })
    ).status,
  ).toBe(409);
  await db.serviceRequest.update({ where: { id: submitted.id }, data: { status: 'APPROVED' } });
  const link = (patientId: string) =>
    post(`/agency/requests/${submitted.id}/link-patient`, {
      patientId,
      expectedVersion: 1,
      reason: 'Agency checked identity',
    });
  const raced = await Promise.all(patients.map((p) => link(p.id)));
  expect(raced.map((r) => r.status).sort()).toEqual([200, 409]);
  const winner = raced.find((r) => r.status === 200)!.body.data.patientId as string;
  expect((await link(winner)).status).toBe(200);
  expect(
    await db.auditEvent.count({
      where: { tenantId, action: 'patient.linked', subjectId: submitted.id },
    }),
  ).toBe(1);
  expect(
    await db.patientAccess.count({
      where: {
        tenantId,
        patientId: winner,
        status: 'ACTIVE',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
  ).toBe(0);
  const approved = await db.serviceRequest.create({
    data: { ...data, status: 'APPROVED', reference: randomUUID(), idempotencyKey: randomUUID() },
  });
  const create = () =>
    post(`/agency/requests/${approved.id}/create-patient`, {
      expectedVersion: 1,
      profile: { displayName: `Distinct ${randomUUID()}`, areaId: 'central' },
      duplicateReviews: [],
    });
  const converted = await Promise.all([create(), create()]);
  expect(converted.map((r) => r.status)).toEqual([201, 201]);
  expect(converted[0]!.body.data.id).toBe(converted[1]!.body.data.id);
});

it('fails closed with unavailable storage/scanner and rejects unauthorized evidence references', async () => {
  const offline = buildApp({
    env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
    db,
    now: () => new Date(),
    health: { checkDatabase: async () => true },
    logger: createLogger({ service: 'test', write: () => {} }),
  });
  const patient = await db.patient.create({
    data: {
      tenantId,
      displayName: 'Offline synthetic',
      normalizedName: 'offline synthetic',
      areaId: 'central',
    },
  });
  const result = await request(offline)
    .post('/v1/documents/upload-intent')
    .set('Host', host)
    .set('Cookie', owner.cookie)
    .set('X-CSRF-Token', owner.csrf)
    .send({
      parentType: 'PATIENT',
      parentId: patient.id,
      classification: 'PATIENT_ATTACHMENT',
      originalName: 'test.pdf',
      mime: 'application/pdf',
      sizeBytes: 100,
    });
  expect(result.status).toBe(503);
  expect(await db.document.count({ where: { tenantId, parentId: patient.id } })).toBe(0);
  expect(
    (
      await post(`/agency/patients/${patient.id}/access-grants`, {
        customerAccountId: customerId,
        scopes: ['VIEW_BASIC'],
        authorizationType: 'PATIENT_CONSENT',
        evidenceDocumentId: randomUUID(),
      })
    ).status,
  ).toBe(404);
  const pdf = Buffer.from('%PDF-1.7\nSynthetic only\n%%EOF');
  const intent = await post('/documents/upload-intent', {
    parentType: 'PATIENT',
    parentId: patient.id,
    classification: 'PATIENT_ATTACHMENT',
    originalName: 'test.pdf',
    mime: 'application/pdf',
    sizeBytes: pdf.length,
  });
  await request(app)
    .put(`/v1/documents/${intent.body.data.id}/upload`)
    .set('Host', host)
    .set('Cookie', owner.cookie)
    .set('X-CSRF-Token', owner.csrf)
    .set('Content-Type', 'application/pdf')
    .send(pdf);
  const finalized = await request(offline)
    .post(`/v1/documents/${intent.body.data.id}/finalize`)
    .set('Host', host)
    .set('Cookie', owner.cookie)
    .set('X-CSRF-Token', owner.csrf)
    .send({});
  expect(finalized.body.data.scanStatus).toBe('QUARANTINED');
});

it('reserves one scan outside the transaction and quarantines abandoned scan reservations', async () => {
  const patient = await db.patient.create({
    data: {
      tenantId,
      displayName: 'Synthetic scan race',
      normalizedName: 'synthetic scan race',
      areaId: 'central',
    },
  });
  const pdf = Buffer.from('%PDF-1.7\nSynthetic scan race only\n%%EOF');
  async function uploaded() {
    const intent = await post('/documents/upload-intent', {
      parentType: 'PATIENT',
      parentId: patient.id,
      classification: 'PATIENT_ATTACHMENT',
      originalName: 'race.pdf',
      mime: 'application/pdf',
      sizeBytes: pdf.length,
    });
    const id = intent.body.data.id as string;
    expect(
      (
        await request(app)
          .put(`/v1/documents/${id}/upload`)
          .set('Host', host)
          .set('Cookie', owner.cookie)
          .set('X-CSRF-Token', owner.csrf)
          .set('Content-Type', 'application/pdf')
          .send(pdf)
      ).status,
    ).toBe(200);
    return id;
  }
  const id = await uploaded();
  let releaseScan!: () => void;
  let signalScan!: () => void;
  const scanning = new Promise<void>((resolve) => {
    signalScan = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseScan = resolve;
  });
  let calls = 0;
  const scanningApp = buildApp({
    env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
    db,
    now: () => new Date(),
    health: { checkDatabase: async () => true },
    logger: createLogger({ service: 'test', write: () => {} }),
    privateStorage: {
      putImmutable: async () => {
        throw new Error('Unused');
      },
      read: async (key) => objects.get(key)!,
    },
    malwareScanner: async () => {
      calls++;
      signalScan();
      await release;
      return 'CLEAN';
    },
  });
  const finalize = () =>
    request(scanningApp)
      .post(`/v1/documents/${id}/finalize`)
      .set('Host', host)
      .set('Cookie', owner.cookie)
      .set('X-CSRF-Token', owner.csrf)
      .send({});
  const first = finalize().then((response) => response);
  try {
    await scanning;
    expect((await finalize()).status).toBe(409);
  } finally {
    releaseScan();
  }
  expect((await first).body.data.scanStatus).toBe('CLEAN');
  expect(calls).toBe(1);
  const abandoned = await uploaded();
  await db.document.update({
    where: { id: abandoned },
    data: { scanStartedAt: new Date(Date.now() - 121_000) },
  });
  expect((await post(`/documents/${abandoned}/finalize`, {})).body.data.scanStatus).toBe(
    'QUARANTINED',
  );
  expect((await get(`/documents/${abandoned}/download`)).status).toBe(404);
});

it('links scanned authorization and qualification evidence only to its exact parent and classification', async () => {
  const first = await db.patient.create({
    data: {
      tenantId,
      displayName: 'Synthetic authority evidence',
      normalizedName: 'synthetic authority evidence',
      areaId: 'central',
    },
  });
  const second = await db.patient.create({
    data: {
      tenantId,
      displayName: 'Synthetic distinct evidence parent',
      normalizedName: 'synthetic distinct evidence parent',
      areaId: 'central',
    },
  });
  const pdf = Buffer.from('%PDF-1.7\nSynthetic evidence only\n%%EOF');
  async function evidence(
    parentId: string,
    parentType: 'PATIENT' | 'CAREGIVER',
    classification: string,
  ) {
    const intent = await post('/documents/upload-intent', {
      parentType,
      parentId,
      classification,
      originalName: 'synthetic-evidence.pdf',
      mime: 'application/pdf',
      sizeBytes: pdf.length,
    });
    expect(intent.status).toBe(201);
    const id = intent.body.data.id as string;
    expect(
      (
        await request(app)
          .put(`/v1/documents/${id}/upload`)
          .set('Host', host)
          .set('Cookie', owner.cookie)
          .set('X-CSRF-Token', owner.csrf)
          .set('Content-Type', 'application/pdf')
          .send(pdf)
      ).status,
    ).toBe(200);
    expect((await post(`/documents/${id}/finalize`, {})).body.data.scanStatus).toBe('CLEAN'); // Injected synthetic scanner, not live proof.
    return id;
  }
  const authorization = await evidence(first.id, 'PATIENT', 'AUTHORIZATION_EVIDENCE');
  const grantBody = {
    customerAccountId: customerId,
    scopes: ['VIEW_BASIC', 'VIEW_DOCUMENTS'],
    authorizationType: 'PATIENT_CONSENT',
    evidenceDocumentId: authorization,
  };
  const issued = await post(`/agency/patients/${first.id}/access-grants`, grantBody);
  expect(issued.status).toBe(201);
  expect(issued.body.data.evidenceDocumentId).toBe(authorization);
  expect((await get(`/documents/${authorization}/download`, customer)).status).toBe(404); // Evidence never becomes a customer attachment.
  expect((await post(`/agency/patients/${second.id}/access-grants`, grantBody)).status).toBe(404);
  const attachment = await evidence(second.id, 'PATIENT', 'PATIENT_ATTACHMENT');
  expect(
    (
      await post(`/agency/patients/${second.id}/access-grants`, {
        ...grantBody,
        evidenceDocumentId: attachment,
      })
    ).status,
  ).toBe(404);
  const caregiverProfile = await db.caregiver.findFirstOrThrow({ where: { tenantId } });
  const qualificationDocument = await evidence(caregiverProfile.id, 'CAREGIVER', 'QUALIFICATION');
  const qualification = {
    code: 'SYNTHETIC_DOCUMENT',
    licenseIssuer: 'Synthetic issuer',
    licenseNumberRestricted: 'SYNTHETIC-ONLY',
    validThrough: '2027-12-31',
  };
  expect(
    (
      await post(`/agency/caregivers/${caregiverProfile.id}/qualifications`, {
        ...qualification,
        documentId: authorization,
      })
    ).status,
  ).toBe(404);
  const submitted = await post(`/agency/caregivers/${caregiverProfile.id}/qualifications`, {
    ...qualification,
    documentId: qualificationDocument,
  });
  expect(submitted.status).toBe(201);
  expect(
    (
      await post(`/agency/qualifications/${submitted.body.data.id}/verify`, {
        expectedVersion: 1,
        decision: 'VERIFIED',
      })
    ).status,
  ).toBe(200);
  // Avoid leaving this unrelated fixture's grant active for other list assertions.
  await post(`/agency/patient-access/${issued.body.data.id}/revoke`, {
    reason: 'Synthetic evidence workflow finished',
  });
});

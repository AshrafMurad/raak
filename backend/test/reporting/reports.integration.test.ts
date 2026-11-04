/**
 * Integration: Session 4 reports and agency audit views (docs 07, docs 12
 * E08/I02). Reconciliation against direct source counts, filter semantics,
 * cross-tenant denial, role/audience gates, safe audit projections and
 * platform "totals only" aggregates. Real PostgreSQL; synthetic tenants A/B
 * with overlapping human-like names.
 */
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getPrisma, disconnectPrisma } from '../../src/db/client';
import { buildApp } from '../../src/server';
import { createLogger } from '../../src/logger';
import { loadApiEnv } from '../../src/config/env';
import { createSession } from '../../src/modules/auth/session.service';

const db = getPrisma();
const suffix = randomUUID().slice(0, 8);
const slugA = `reports-a-${suffix}`;
const slugB = `reports-b-${suffix}`;
const slugS = `reports-s-${suffix}`;
const app: Express = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
  db,
  now: () => new Date(),
  logger: createLogger({ service: 'test', write: () => {} }),
  health: { checkDatabase: async () => true },
});

interface Seeded {
  tenantId: string;
  otherTenantId: string;
  suspendedTenantId: string;
  ownerId: string;
  coordinatorId: string;
  caregiverStaffId: string;
  otherOwnerId: string;
  operatorId: string;
  customerId: string;
  serviceOne: string;
  serviceTwo: string;
  otherService: string;
  caregiverOne: string;
  caregiverTwo: string;
}
let f: Seeded;

function cookies(session: { sessionToken: string }, kind: 'agency' | 'platform' = 'agency') {
  return `${kind === 'agency' ? 'raak_session_agency' : 'raak_session_platform'}=${session.sessionToken}`;
}

const get = (host: string, path: string, cookie?: string): Promise<request.Response> => {
  const req = request(app).get(`/v1${path}`).set('Host', `${host}.localhost`);
  if (cookie) req.set('Cookie', cookie);
  return req;
};

const WINDOW = { from: '2026-11-01', to: '2026-11-07' };

async function staffSession(tenantId: string, staffId: string) {
  return createSession(db, {
    principalType: 'AGENCY_STAFF',
    principalId: staffId,
    tenantId,
    sessionVersion: 0,
    ttlSeconds: 3600,
  });
}

async function seedTenant(prefix: 'a' | 'b' | 's', status: 'ACTIVE' | 'SUSPENDED') {
  const slug = prefix === 'a' ? slugA : prefix === 'b' ? slugB : slugS;
  const tenant = await db.tenant.create({
    data: {
      slug,
      legalName: `Synthetic Reports ${prefix.toUpperCase()}`,
      displayName: `Reports ${prefix.toUpperCase()}`,
      status,
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      supportEmail: `support-${prefix}@example.invalid`,
    },
  });
  const owner = await db.staffAccount.create({
    data: {
      tenantId: tenant.id,
      role: 'AGENCY_OWNER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      emailNormalized: `owner-${prefix}-${suffix}@example.invalid`,
      passwordHash: 'unused',
    },
  });
  return { tenant, owner };
}

const requestBase = (tenantId: string, serviceId: string) => ({
  tenantId,
  agencyServiceId: serviceId,
  requesterName: 'Synthetic requester',
  requesterEmailNormalized: `requester-${randomUUID().slice(0, 8)}@example.invalid`,
  requesterPhone: '+966500000000',
  beneficiaryName: 'Synthetic beneficiary',
  relationship: 'OTHER',
  areaId: 'central',
  preferredWindowJson: {},
  notesRestricted: '',
  locale: 'en',
  privacyVersion: 'test',
  serviceSnapshot: { pricingType: 'FIXED', priceMinor: 0 },
  priceAcknowledged: true,
});

const visitBase = (tenantId: string, serviceId: string, start: string, end: string) => ({
  tenantId,
  agencyServiceId: serviceId,
  areaId: 'central',
  serviceNameSnapshot: { nameAr: 'زيارة اصطناعية', nameEn: 'Synthetic visit' },
  scheduledStartUtc: new Date(start),
  scheduledEndUtc: new Date(end),
  timezoneSnapshot: 'Asia/Riyadh',
});

describe('reports and audit views', () => {
  let ownerCookie: string;
  let coordinatorCookie: string;
  let caregiverCookie: string;
  let customerCookie: string;
  let otherOwnerCookie: string;
  let suspendedOwnerCookie: string;
  let operatorCookie: string;
  const auditIds: string[] = [];

  beforeAll(async () => {
    const a = await seedTenant('a', 'ACTIVE');
    const b = await seedTenant('b', 'ACTIVE');
    const s = await seedTenant('s', 'SUSPENDED');

    const coordinator = await db.staffAccount.create({
      data: {
        tenantId: a.tenant.id,
        role: 'CARE_COORDINATOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        emailNormalized: `coordinator-${suffix}@example.invalid`,
        passwordHash: 'unused',
      },
    });
    const caregiverStaff = await db.staffAccount.create({
      data: {
        tenantId: a.tenant.id,
        role: 'CAREGIVER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        emailNormalized: `caregiver-${suffix}@example.invalid`,
        passwordHash: 'unused',
      },
    });
    const customer = await db.customerAccount.create({
      data: {
        tenantId: a.tenant.id,
        emailNormalized: `customer-${suffix}@example.invalid`,
        passwordHash: 'unused',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    const operator = await db.platformOperator.create({
      data: {
        emailNormalized: `operator-reports-${suffix}@example.invalid`,
        passwordHash: 'unused',
        status: 'ACTIVE',
      },
    });

    const patientA = await db.patient.create({
      data: {
        tenantId: a.tenant.id,
        displayName: 'Synthetic beneficiary A',
        normalizedName: 'synthetic beneficiary a',
        areaId: 'central',
      },
    });
    const patientB = await db.patient.create({
      data: {
        tenantId: b.tenant.id,
        displayName: 'Synthetic beneficiary A',
        normalizedName: 'synthetic beneficiary a',
        areaId: 'central',
      },
    });

    const config = { nameAr: 'رعاية منزلية', nameEn: 'Home care' };
    const serviceOne = await db.agencyService.create({
      data: { tenantId: a.tenant.id, slug: 'home-care', config },
    });
    const serviceTwo = await db.agencyService.create({
      data: { tenantId: a.tenant.id, slug: 'physiotherapy', config },
    });
    // Tenant B deliberately reuses A's slug and display names (docs 12).
    const otherService = await db.agencyService.create({
      data: { tenantId: b.tenant.id, slug: 'home-care', config },
    });

    const caregiverOne = await db.caregiver.create({
      data: {
        tenantId: a.tenant.id,
        name: 'Caregiver One',
        professionalCategory: 'NURSE',
        operationalStatus: 'ACTIVE',
      },
    });
    const caregiverTwo = await db.caregiver.create({
      data: {
        tenantId: a.tenant.id,
        name: 'Caregiver Two',
        professionalCategory: 'NURSE',
        operationalStatus: 'ACTIVE',
      },
    });
    const otherCaregiver = await db.caregiver.create({
      data: {
        tenantId: b.tenant.id,
        name: 'Caregiver One',
        professionalCategory: 'NURSE',
        operationalStatus: 'ACTIVE',
      },
    });

    // Tenant A requests: four inside the window, one outside.
    for (const [status, serviceId, submittedAt] of [
      ['SUBMITTED', serviceOne.id, '2026-11-02T09:00:00Z'],
      ['UNDER_REVIEW', serviceOne.id, '2026-11-03T09:00:00Z'],
      ['APPROVED', serviceTwo.id, '2026-11-04T09:00:00Z'],
      ['REJECTED', serviceTwo.id, '2026-11-05T09:00:00Z'],
      ['SUBMITTED', serviceOne.id, '2026-11-20T09:00:00Z'],
    ] as const) {
      await db.serviceRequest.create({
        data: {
          ...requestBase(a.tenant.id, serviceId),
          status,
          submittedAt: new Date(submittedAt),
          reference: randomUUID(),
          idempotencyKey: randomUUID(),
          payloadHash: 'synthetic',
        },
      });
    }
    await db.serviceRequest.create({
      data: {
        ...requestBase(b.tenant.id, otherService.id),
        status: 'APPROVED',
        submittedAt: new Date('2026-11-04T09:00:00Z'),
        reference: randomUUID(),
        idempotencyKey: randomUUID(),
        payloadHash: 'synthetic',
      },
    });

    // Tenant A visits inside the window (v1..v5, v7) plus one outside (v6).
    await db.visit.create({
      data: {
        ...visitBase(a.tenant.id, serviceOne.id, '2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z'),
        patientId: patientA.id,
        status: 'SCHEDULED',
        assignedCaregiverId: caregiverOne.id,
      },
    });
    await db.visit.create({
      data: {
        ...visitBase(a.tenant.id, serviceOne.id, '2026-11-03T08:00:00Z', '2026-11-03T09:00:00Z'),
        patientId: patientA.id,
        status: 'COMPLETED',
        assignedCaregiverId: caregiverOne.id,
        actualStartAt: new Date('2026-11-03T08:00:00Z'),
        actualEndAt: new Date('2026-11-03T09:05:00Z'),
      },
    });
    await db.visit.create({
      data: {
        ...visitBase(a.tenant.id, serviceTwo.id, '2026-11-04T08:00:00Z', '2026-11-04T10:00:00Z'),
        patientId: patientA.id,
        status: 'COMPLETED',
        assignedCaregiverId: caregiverTwo.id,
        actualStartAt: new Date('2026-11-04T08:10:00Z'),
        actualEndAt: new Date('2026-11-04T10:00:00Z'),
      },
    });
    await db.visit.create({
      data: {
        ...visitBase(a.tenant.id, serviceTwo.id, '2026-11-05T08:00:00Z', '2026-11-05T09:00:00Z'),
        patientId: patientA.id,
        status: 'PLANNED',
      },
    });
    await db.visit.create({
      data: {
        ...visitBase(a.tenant.id, serviceOne.id, '2026-11-06T08:00:00Z', '2026-11-06T09:00:00Z'),
        patientId: patientA.id,
        status: 'CANCELLED',
        assignedCaregiverId: caregiverOne.id,
        cancelledAt: new Date('2026-11-06T07:00:00Z'),
        cancelledReason: 'Synthetic cancellation',
      },
    });
    await db.visit.create({
      data: {
        ...visitBase(a.tenant.id, serviceOne.id, '2026-11-20T08:00:00Z', '2026-11-20T09:00:00Z'),
        patientId: patientA.id,
        status: 'SCHEDULED',
        assignedCaregiverId: caregiverOne.id,
      },
    });
    await db.visit.create({
      data: {
        ...visitBase(a.tenant.id, serviceTwo.id, '2026-11-02T12:00:00Z', '2026-11-02T13:00:00Z'),
        patientId: patientA.id,
        status: 'MISSED',
        assignedCaregiverId: caregiverTwo.id,
      },
    });
    await db.visit.create({
      data: {
        ...visitBase(b.tenant.id, otherService.id, '2026-11-03T08:00:00Z', '2026-11-03T09:00:00Z'),
        patientId: patientB.id,
        status: 'COMPLETED',
        assignedCaregiverId: otherCaregiver.id,
        actualStartAt: new Date('2026-11-03T08:00:00Z'),
        actualEndAt: new Date('2026-11-03T09:00:00Z'),
      },
    });

    // Audit rows: 25 for A, 1 for B; metadata must never surface in views.
    for (let i = 0; i < 25; i++) {
      const row = await db.auditEvent.create({
        data: {
          tenantId: a.tenant.id,
          actorType: 'AGENCY_STAFF',
          actorId: a.owner.id,
          action: `synthetic.reports.${i}`,
          subjectType: 'visit',
          subjectId: randomUUID(),
          reason: `Synthetic reason ${i}`,
          at: new Date(Date.UTC(2026, 10, 4, 10, 0, Math.floor(i / 2))),
          metadataJson: { internalSecret: 'never-surface' },
        },
      });
      auditIds.unshift(row.id);
    }
    await db.auditEvent.create({
      data: {
        tenantId: b.tenant.id,
        actorType: 'AGENCY_STAFF',
        actorId: b.owner.id,
        action: 'synthetic.reports.other',
        subjectType: 'visit',
        reason: 'Other tenant',
        metadataJson: { internalSecret: 'never-surface' },
      },
    });

    ownerCookie = cookies(await staffSession(a.tenant.id, a.owner.id));
    coordinatorCookie = cookies(await staffSession(a.tenant.id, coordinator.id));
    caregiverCookie = cookies(await staffSession(a.tenant.id, caregiverStaff.id));
    otherOwnerCookie = cookies(await staffSession(b.tenant.id, b.owner.id));
    suspendedOwnerCookie = cookies(await staffSession(s.tenant.id, s.owner.id));
    const customerSession = await createSession(db, {
      principalType: 'AGENCY_CUSTOMER',
      principalId: customer.id,
      tenantId: a.tenant.id,
      sessionVersion: 0,
      ttlSeconds: 3600,
    });
    customerCookie = cookies(customerSession);
    const operatorSession = await createSession(db, {
      principalType: 'PLATFORM_OPERATOR',
      principalId: operator.id,
      sessionVersion: 0,
      ttlSeconds: 3600,
    });
    operatorCookie = cookies(operatorSession, 'platform');

    f = {
      tenantId: a.tenant.id,
      otherTenantId: b.tenant.id,
      suspendedTenantId: s.tenant.id,
      ownerId: a.owner.id,
      coordinatorId: coordinator.id,
      caregiverStaffId: caregiverStaff.id,
      otherOwnerId: b.owner.id,
      operatorId: operator.id,
      customerId: customer.id,
      serviceOne: serviceOne.id,
      serviceTwo: serviceTwo.id,
      otherService: otherService.id,
      caregiverOne: caregiverOne.id,
      caregiverTwo: caregiverTwo.id,
    };
  });

  afterAll(async () => {
    for (const tenantId of [f.tenantId, f.otherTenantId, f.suspendedTenantId]) {
      await db.visit.deleteMany({ where: { tenantId } });
      await db.serviceRequest.deleteMany({ where: { tenantId } });
      await db.caregiver.deleteMany({ where: { tenantId } });
      await db.agencyService.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.auditEvent.deleteMany({ where: { tenantId } });
      await db.authSession.deleteMany({ where: { tenantId } });
      await db.staffAccount.deleteMany({ where: { tenantId } });
      await db.customerAccount.deleteMany({ where: { tenantId } });
      await db.tenant.deleteMany({ where: { id: tenantId } });
    }
    await db.authSession.deleteMany({ where: { principalId: f.operatorId } });
    await db.platformOperator.deleteMany({ where: { id: f.operatorId } });
    await disconnectPrisma();
  });

  it('reconciles the request funnel with source rows and safe service breakdowns', async () => {
    const response = await get(
      slugA,
      `/agency/reports/requests?from=${WINDOW.from}&to=${WINDOW.to}`,
      ownerCookie,
    );
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.total).toBe(4);
    expect(data.byStatus).toEqual({
      SUBMITTED: 1,
      UNDER_REVIEW: 1,
      AWAITING_CUSTOMER: 0,
      APPROVED: 1,
      REJECTED: 1,
      WITHDRAWN: 0,
    });
    expect(Object.values(data.byStatus).reduce<number>((sum, n) => sum + Number(n), 0)).toBe(
      data.total,
    );
    expect(data.byService.map((s: { slug: string }) => s.slug).sort()).toEqual([
      'home-care',
      'physiotherapy',
    ]);
    expect(data.byService.reduce((sum: number, s: { count: number }) => sum + s.count, 0)).toBe(4);
    expect(data.byService.find((s: { slug: string }) => s.slug === 'home-care')).toMatchObject({
      nameAr: 'رعاية منزلية',
      nameEn: 'Home care',
    });
    expect(data.byServiceTruncated).toBe(false);
    // Reconciliation against the live source table (E08).
    const direct = await db.serviceRequest.count({
      where: {
        tenantId: f.tenantId,
        submittedAt: {
          gte: new Date('2026-10-31T21:00:00Z'),
          lt: new Date('2026-11-07T21:00:00Z'),
        },
      },
    });
    expect(data.total).toBe(direct);
  });

  it('narrows request reports by status and tenant service, denying cross-tenant filters', async () => {
    const byStatus = await get(
      slugA,
      `/agency/reports/requests?from=${WINDOW.from}&to=${WINDOW.to}&status=APPROVED`,
      coordinatorCookie,
    );
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.total).toBe(1);
    expect(byStatus.body.data.byStatus.APPROVED).toBe(1);

    const byService = await get(
      slugA,
      `/agency/reports/requests?from=${WINDOW.from}&to=${WINDOW.to}&serviceId=${f.serviceTwo}`,
      ownerCookie,
    );
    expect(byService.status).toBe(200);
    expect(byService.body.data.total).toBe(2);
    expect(byService.body.data.byService).toHaveLength(1);

    // I02: crafted B filters never return B data — foreign service is a 404,
    // unknown params fail validation, and B rows never merge into A totals.
    const foreign = await get(
      slugA,
      `/agency/reports/requests?serviceId=${f.otherService}`,
      ownerCookie,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('RESOURCE_NOT_FOUND');
    const crafted = await get(
      slugA,
      `/agency/reports/requests?tenantId=${f.otherTenantId}`,
      ownerCookie,
    );
    expect(crafted.status).toBe(422);
    const malformed = await get(slugA, '/agency/reports/requests?from=2026-13-01', ownerCookie);
    expect(malformed.status).toBe(422);
    const allA = await get(slugA, '/agency/reports/requests', ownerCookie);
    expect(allA.body.data.total).toBe(5);
  });

  it('keeps tenant B completely separate even with identical names and slugs', async () => {
    const response = await get(
      slugB,
      `/agency/reports/requests?from=${WINDOW.from}&to=${WINDOW.to}`,
      otherOwnerCookie,
    );
    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.byStatus.APPROVED).toBe(1);
    const visits = await get(
      slugB,
      `/agency/reports/visits?from=${WINDOW.from}&to=${WINDOW.to}`,
      otherOwnerCookie,
    );
    expect(visits.body.data.total).toBe(1);
    expect(visits.body.data.byStatus.COMPLETED).toBe(1);
  });

  it('reports visit statuses, unassigned count and start-based timeliness', async () => {
    const response = await get(
      slugA,
      `/agency/reports/visits?from=${WINDOW.from}&to=${WINDOW.to}`,
      ownerCookie,
    );
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.total).toBe(6);
    expect(data.byStatus).toEqual({
      PLANNED: 1,
      SCHEDULED: 1,
      IN_PROGRESS: 0,
      COMPLETED: 2,
      CANCELLED: 1,
      MISSED: 1,
    });
    expect(data.unassigned).toBe(1);
    expect(data.timeliness).toEqual({ started: 2, onTime: 1, late: 1, notStarted: 4 });
    const direct = await db.visit.count({
      where: {
        tenantId: f.tenantId,
        scheduledStartUtc: {
          gte: new Date('2026-10-31T21:00:00Z'),
          lt: new Date('2026-11-07T21:00:00Z'),
        },
      },
    });
    expect(data.total).toBe(direct);

    const filtered = await get(
      slugA,
      `/agency/reports/visits?from=${WINDOW.from}&to=${WINDOW.to}&status=COMPLETED&serviceId=${f.serviceOne}`,
      coordinatorCookie,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.total).toBe(1);
    expect(filtered.body.data.timeliness).toEqual({
      started: 1,
      onTime: 1,
      late: 0,
      notStarted: 0,
    });

    const foreign = await get(
      slugA,
      `/agency/reports/visits?serviceId=${f.otherService}`,
      ownerCookie,
    );
    expect(foreign.status).toBe(404);
    const crafted = await get(
      slugA,
      `/agency/reports/visits?tenantId=${f.otherTenantId}`,
      ownerCookie,
    );
    expect(crafted.status).toBe(422);
  });

  it('reports caregiver load as operational aggregates with cancelled visits excluded from minutes', async () => {
    const response = await get(
      slugA,
      `/agency/reports/caregivers?from=${WINDOW.from}&to=${WINDOW.to}`,
      coordinatorCookie,
    );
    expect(response.status).toBe(200);
    const items = response.body.data.items as Array<{
      caregiverId: string;
      scheduledMinutes: number;
      byStatus: Record<string, number>;
    }>;
    expect(items).toHaveLength(2);
    const one = items.find((i) => i.caregiverId === f.caregiverOne)!;
    const two = items.find((i) => i.caregiverId === f.caregiverTwo)!;
    // Caregiver One: SCHEDULED 60 + COMPLETED 60 minutes (cancelled excluded).
    expect(one.scheduledMinutes).toBe(120);
    expect(one.byStatus).toMatchObject({ SCHEDULED: 1, COMPLETED: 1, CANCELLED: 1 });
    // Caregiver Two: 120 + 60 minutes, higher load sorts first.
    expect(two.scheduledMinutes).toBe(180);
    expect(items[0]!.caregiverId).toBe(f.caregiverTwo);
    expect(response.body.data.truncated).toBe(false);
    expect(
      (await get(slugA, `/agency/reports/caregivers?serviceId=${f.otherService}`, ownerCookie))
        .status,
    ).toBe(404);
    expect(
      (await get(slugA, `/agency/reports/caregivers?tenantId=${f.otherTenantId}`, ownerCookie))
        .status,
    ).toBe(422);
    // Never any tenant B caregiver (same name) or patient identity in rows.
    expect(JSON.stringify(response.body.data)).not.toContain('beneficiary');
  });

  it('denies wrong audiences and suspended tenants on every reports route', async () => {
    for (const path of [
      `/agency/reports/requests?from=${WINDOW.from}&to=${WINDOW.to}`,
      `/agency/reports/visits?from=${WINDOW.from}&to=${WINDOW.to}`,
      `/agency/reports/caregivers?from=${WINDOW.from}&to=${WINDOW.to}`,
    ]) {
      expect((await get(slugA, path)).status).toBe(401);
      expect((await get(slugA, path, caregiverCookie)).status).toBe(403);
      expect((await get(slugA, path, customerCookie)).status).toBe(403);
      // A platform operator session is not valid on any agency host.
      expect((await get(slugA, path, operatorCookie)).status).toBe(401);
      // Session resolution denies suspended tenants outright (I15 semantics).
      expect((await get(slugS, path, suspendedOwnerCookie)).status).toBe(401);
    }
  });

  it('pages the append-only agency audit view with safe summaries only', async () => {
    const source = await db.auditEvent.findMany({
      where: { tenantId: f.tenantId },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      select: { id: true, at: true },
    });
    const ordered = source.map((row) => row.id);
    const first = await get(slugA, '/agency/audit?limit=10', ownerCookie);
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(10);
    expect(first.body.data.items[0]!.id).toBe(ordered[0]);
    expect(Object.keys(first.body.data.items[0]).sort()).toEqual([
      'action',
      'actorId',
      'actorType',
      'at',
      'id',
      'reason',
      'subjectId',
      'subjectType',
    ]);
    expect(JSON.stringify(first.body.data)).not.toContain('never-surface');
    expect(first.body.data.nextCursor).toBe(`${source[9]!.at.toISOString()}~${ordered[9]}`);

    const second = await get(
      slugA,
      `/agency/audit?limit=20&cursor=${first.body.data.nextCursor}`,
      ownerCookie,
    );
    expect(second.body.data.items.map((r: { id: string }) => r.id)).toEqual(ordered.slice(10, 25));
    expect(second.body.data.nextCursor).toBeNull();
    // Tenant B's rows never appear in A's audit view.
    expect(JSON.stringify(second.body.data)).not.toContain('Other tenant');

    expect((await get(slugA, '/agency/audit?limit=101', ownerCookie)).status).toBe(422);
    expect((await get(slugA, '/agency/audit?cursor=invalid', ownerCookie)).status).toBe(422);
    expect((await get(slugA, '/agency/audit?action=tenant.suspended', ownerCookie)).status).toBe(
      422,
    );
    expect((await get(slugA, '/agency/audit', coordinatorCookie)).status).toBe(403);
    expect((await get(slugA, '/agency/audit', caregiverCookie)).status).toBe(403);
    expect((await get(slugA, '/agency/audit', customerCookie)).status).toBe(403);
    expect((await get(slugA, '/agency/audit')).status).toBe(401);
    expect((await get(slugS, '/agency/audit', suspendedOwnerCookie)).status).toBe(401);
  });

  it('exposes only all-time aggregate totals to the platform operator', async () => {
    const response = await request(app)
      .get(`/v1/platform/tenants/${f.tenantId}`)
      .set('Host', 'platform.localhost')
      .set('Cookie', operatorCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.reportTotals).toEqual({
      requests: { SUBMITTED: 2, UNDER_REVIEW: 1, APPROVED: 1, REJECTED: 1 },
      visits: { SCHEDULED: 2, COMPLETED: 2, PLANNED: 1, CANCELLED: 1, MISSED: 1 },
    });
    // The detail projection carries no patient/row data beyond aggregates.
    expect(JSON.stringify(response.body.data)).not.toContain('beneficiary');
    // And operators have no agency-host analytics route at all.
    expect(
      (
        await request(app)
          .get('/v1/agency/reports/visits')
          .set('Host', `${slugA}.localhost`)
          .set('Cookie', operatorCookie)
      ).status,
    ).toBe(401);
  });

  it('caps service breakdowns without truncating aggregate totals', async () => {
    const ids = Array.from({ length: 101 }, () => randomUUID());
    try {
      await db.agencyService.createMany({
        data: ids.map((id, index) => ({
          id,
          tenantId: f.tenantId,
          slug: `synthetic-cap-${index}`,
          config: {},
        })),
      });
      await db.serviceRequest.createMany({
        data: ids.map((id) => ({
          ...requestBase(f.tenantId, id),
          reference: randomUUID(),
          idempotencyKey: randomUUID(),
          payloadHash: 'synthetic',
        })),
      });
      const page = await get(slugA, '/agency/reports/requests', ownerCookie);
      expect(page.status).toBe(200);
      expect(page.body.data.total).toBe(106);
      expect(page.body.data.byService).toHaveLength(100);
      expect(page.body.data.byServiceTruncated).toBe(true);
    } finally {
      await db.serviceRequest.deleteMany({
        where: { tenantId: f.tenantId, agencyServiceId: { in: ids } },
      });
      await db.agencyService.deleteMany({ where: { tenantId: f.tenantId, id: { in: ids } } });
    }
  });
});

// Sprint 7 Session 5 — docs 12 performance-budget measurement (development
// environment, loopback HTTP, synthetic data only). Not part of npm test.
// Budgets: paginated visit list p95 <= 500 ms (10 tenants x 1000 visits);
// candidate suggestion median <= 1 s (100 caregivers, two-week horizon).
import '../src/env-load';
import http from 'node:http';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/server';
import { loadApiEnv } from '../src/config/env';
import { createLogger } from '../src/logger';
import { getPrisma, disconnectPrisma } from '../src/db/client';
import { createSession } from '../src/modules/auth/session.service';

const db = getPrisma();
const runTag = randomUUID().slice(0, 8);
const TENANTS = 10;
const VISITS_PER_TENANT = 1000;
const CAREGIVERS = 100;
const LIST_WARMUP = 10;
const LIST_SAMPLES = 30;
const CANDIDATE_WARMUP = 3;
const CANDIDATE_SAMPLES = 30;
const LIST_BUDGET_MS = 500;
const CANDIDATE_BUDGET_MS = 1000;
const ZONE = 'Asia/Riyadh';

const app = buildApp({
  env: loadApiEnv({ BASE_DOMAIN: 'localhost' }),
  db,
  now: () => new Date(),
  logger: createLogger({ service: 'perf-budgets', write: () => {} }),
  health: { checkDatabase: async () => true },
});
const server = http.createServer((req, res) => app(req, res));

interface Sample {
  status: number;
  ms: number;
}

function timedRequest(
  port: number,
  slug: string,
  method: 'GET' | 'POST',
  path: string,
  session?: { cookie: string; csrf: string },
  body?: object,
): Promise<Sample> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: `/v1${path}`,
        headers: {
          host: `${slug}.localhost`,
          'content-type': 'application/json',
          ...(session ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}),
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            ms: performance.now() - started,
          });
        });
      },
    );
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index] ?? 0);
}

async function main() {
  const startedAt = new Date();
  await new Promise<void>((resolve) => server.listen(3160, '127.0.0.1', resolve));
  const slugs: string[] = [];
  const tenantIds: string[] = [];
  let targetVisitId = '';
  let perfSlug = '';
  let perfSession: { cookie: string; csrf: string } | undefined;
  const sessions = new Map<string, { cookie: string; csrf: string }>();
  try {
    for (let index = 0; index < TENANTS; index++) {
      const slug = `perf-${runTag}-${index}`;
      const tenant = await db.tenant.create({
        data: {
          slug,
          legalName: `Synthetic performance tenant ${index}`,
          displayName: 'Synthetic',
          status: 'ACTIVE',
          timezone: ZONE,
          currency: 'SAR',
          supportEmail: 'support@example.invalid',
        },
      });
      slugs.push(slug);
      tenantIds.push(tenant.id);
      const owner = await db.staffAccount.create({
        data: {
          tenantId: tenant.id,
          emailNormalized: 'owner@example.invalid',
          passwordHash: 'unused',
          role: 'AGENCY_OWNER',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
      const session = await createSession(db, {
        principalId: owner.id,
        principalType: 'AGENCY_STAFF',
        tenantId: tenant.id,
        sessionVersion: 0,
        ttlSeconds: 3600,
      });
      sessions.set(slug, {
        cookie: `raak_session_agency=${session.sessionToken}`,
        csrf: session.csrfToken,
      });
      const service = await db.agencyService.create({
        data: {
          tenantId: tenant.id,
          slug: 'perf-service',
          config: {
            nameAr: 'زيارة أداء اصطناعية',
            nameEn: 'Synthetic performance visit',
            summaryAr: 'للقياس فقط',
            summaryEn: 'Measurement only',
            descriptionAr: 'بيانات تجريبية',
            descriptionEn: 'Synthetic fixture',
            durationMin: 60,
            clinicalClass: 'NON_CLINICAL',
            requiredQualificationCodes: [],
            serviceAreaIds: ['central'],
            allowStandalone: true,
            allowRecurring: true,
            pricingType: 'CUSTOM_QUOTE',
            priceMinor: null,
            pricingUnit: null,
          },
        },
      });
      const patients = await db.patient.createManyAndReturn({
        data: Array.from({ length: 10 }, (_, p) => ({
          tenantId: tenant.id,
          displayName: `Synthetic perf patient ${index}-${p}`,
          normalizedName: `synthetic perf patient ${index}-${p}`,
          areaId: 'central',
        })),
      });
      const isLoadTenant = index === 0;
      const caregiverRows = isLoadTenant ? CAREGIVERS : 1;
      const caregiverIds: string[] = [];
      for (let c = 0; c < caregiverRows; c++) {
        const staff = await db.staffAccount.create({
          data: {
            tenantId: tenant.id,
            emailNormalized: `caregiver-${c}@example.invalid`,
            passwordHash: 'unused',
            role: 'CAREGIVER',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
          },
        });
        const caregiver = await db.caregiver.create({
          data: {
            tenantId: tenant.id,
            staffAccountId: staff.id,
            name: `Synthetic perf caregiver ${index}-${c}`,
            professionalCategory: 'NURSE',
            operationalStatus: 'ACTIVE',
            serviceAreasJson: ['central'],
          },
        });
        caregiverIds.push(caregiver.id);
        await db.caregiverServiceAuthorization.create({
          data: {
            tenantId: tenant.id,
            caregiverId: caregiver.id,
            agencyServiceId: service.id,
            authorizedBy: owner.id,
            authorizedAt: new Date(),
          },
        });
        await db.availabilitySlot.createMany({
          data: Array.from({ length: 7 }, (_, weekday) => ({
            tenantId: tenant.id,
            caregiverId: caregiver.id,
            weekday,
            localStartTime: '08:00',
            localEndTime: '18:00',
          })),
        });
      }
      const now = Date.now();
      const visits = Array.from({ length: VISITS_PER_TENANT }, (_, v) => {
        const assigned = v % 10 === 0 && caregiverIds.length > 0;
        const start = new Date(now + (v - VISITS_PER_TENANT / 2) * 90 * 60_000);
        return {
          tenantId: tenant.id,
          patientId: patients[v % patients.length]!.id,
          agencyServiceId: service.id,
          assignedCaregiverId: assigned ? caregiverIds[v % caregiverIds.length]! : null,
          areaId: 'central',
          status: assigned ? 'SCHEDULED' : 'PLANNED',
          scheduledStartUtc: start,
          scheduledEndUtc: new Date(start.getTime() + 3_600_000),
          timezoneSnapshot: ZONE,
          serviceNameSnapshot: { nameAr: 'زيارة أداء', nameEn: 'Synthetic performance visit' },
        };
      });
      for (let chunk = 0; chunk < visits.length; chunk += 250) {
        await db.visit.createMany({ data: visits.slice(chunk, chunk + 250) });
      }
      if (isLoadTenant) {
        const target = await db.visit.create({
          data: {
            tenantId: tenant.id,
            patientId: patients[0]!.id,
            agencyServiceId: service.id,
            areaId: 'central',
            status: 'PLANNED',
            scheduledStartUtc: new Date(now + 3 * 86_400_000),
            scheduledEndUtc: new Date(now + 3 * 86_400_000 + 3_600_000),
            timezoneSnapshot: ZONE,
            serviceNameSnapshot: { nameAr: 'زيارة أداء', nameEn: 'Synthetic performance visit' },
          },
        });
        targetVisitId = target.id;
        perfSlug = slug;
        perfSession = sessions.get(slug);
      }
      process.stdout.write(`seeded ${slug} (visits=${visits.length}, caregivers=${caregiverRows})\n`);
    }

    const listSamples: number[] = [];
    const listStatuses = new Set<number>();
    for (let index = 0; index < TENANTS; index++) {
      const slug = slugs[index]!;
      const session = sessions.get(slug)!;
      for (let warm = 0; warm < LIST_WARMUP; warm++) {
        await timedRequest(3160, slug, 'GET', '/agency/visits', session);
      }
      for (let sample = 0; sample < LIST_SAMPLES; sample++) {
        const result = await timedRequest(3160, slug, 'GET', '/agency/visits', session);
        listStatuses.add(result.status);
        listSamples.push(result.ms);
      }
    }
    const candidateSamples: number[] = [];
    const candidateStatuses = new Set<number>();
    for (let warm = 0; warm < CANDIDATE_WARMUP; warm++) {
      await timedRequest(3160, perfSlug, 'POST', `/agency/visits/${targetVisitId}/candidates`, perfSession, {});
    }
    for (let sample = 0; sample < CANDIDATE_SAMPLES; sample++) {
      const result = await timedRequest(
        3160,
        perfSlug,
        'POST',
        `/agency/visits/${targetVisitId}/candidates`,
        perfSession,
        {},
      );
      candidateStatuses.add(result.status);
      candidateSamples.push(result.ms);
    }

    const listP95 = percentile(listSamples, 95);
    const listMedian = percentile(listSamples, 50);
    const candidateMedian = percentile(candidateSamples, 50);
    const candidateP95 = percentile(candidateSamples, 95);
    const totalVisits = await db.visit.count({ where: { tenantId: { in: tenantIds } } });
    const results = {
      startedAt: startedAt.toISOString(),
      environment: {
        os: `${os.type()} ${os.release()} ${os.arch()}`,
        cpus: `${os.cpus().length}x ${os.cpus()[0]?.model ?? 'unknown'}`,
        memoryTotalBytes: os.totalmem(),
        node: process.version,
        database: (await db.$queryRaw<{ version: string }[]>`SELECT version()`)[0]?.version ?? '',
        network: 'loopback (127.0.0.1 HTTP, direct in-process app)',
      },
      dataset: {
        tenants: TENANTS,
        visitsPerTenant: VISITS_PER_TENANT,
        visitsTotal: totalVisits,
        candidateCaregivers: CAREGIVERS,
      },
      method: {
        list: `GET /v1/agency/visits repeated sequentially; warmup ${LIST_WARMUP} per tenant, ${LIST_SAMPLES} samples per tenant (${listSamples.length} total)`,
        candidates: `POST /v1/agency/visits/:id/candidates repeated sequentially; warmup ${CANDIDATE_WARMUP}, ${CANDIDATE_SAMPLES} samples`,
      },
      paginatedList: {
        samples: listSamples.length,
        statuses: [...listStatuses].sort(),
        medianMs: listMedian,
        p95Ms: listP95,
        maxMs: Math.round(Math.max(...listSamples)),
        budgetMs: LIST_BUDGET_MS,
        budgetMet: [...listStatuses].every((s) => s === 200) && listP95 <= LIST_BUDGET_MS,
      },
      candidateSuggestion: {
        samples: candidateSamples.length,
        statuses: [...candidateStatuses].sort(),
        medianMs: candidateMedian,
        p95Ms: candidateP95,
        maxMs: Math.round(Math.max(...candidateSamples)),
        budgetMs: CANDIDATE_BUDGET_MS,
        budgetMet: [...candidateStatuses].every((s) => s === 200) && candidateMedian <= CANDIDATE_BUDGET_MS,
      },
    };
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    if (!results.paginatedList.budgetMet || !results.candidateSuggestion.budgetMet) {
      process.exitCode = 1;
    }
  } finally {
    server.close();
    for (const tenantId of tenantIds) {
      await db.visit.deleteMany({ where: { tenantId } });
      await db.patient.deleteMany({ where: { tenantId } });
      await db.availabilitySlot.deleteMany({ where: { tenantId } });
      await db.caregiverServiceAuthorization.deleteMany({ where: { tenantId } });
      await db.caregiver.deleteMany({ where: { tenantId } });
      await db.agencyService.deleteMany({ where: { tenantId } });
      await db.authSession.deleteMany({ where: { tenantId } });
      await db.staffAccount.deleteMany({ where: { tenantId } });
      await db.tenant.delete({ where: { id: tenantId } });
    }
    await disconnectPrisma();
  }
}

await main();

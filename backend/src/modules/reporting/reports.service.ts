/**
 * Tenant-scoped operational reports (docs 04 BR-AUD context, docs 07 reports
 * routes, docs 12 E08/I02). Aggregate-only projections: no visit/request rows,
 * no patient identity, no caregiver clinical detail. Every call re-runs the
 * central `reports.read` policy at the transaction boundary with live
 * account/session/tenant checks; the tenant comes from the server-resolved
 * host realm, never from client input. Aggregates use one grouped query per
 * dimension (no N+1); breakdown rows are capped with explicit truncation
 * flags, never silently dropped.
 *
 * Timeliness (start-based, defined in docs 07): among in-scope visits,
 * `started` counts rows with an actual start; `onTime` those starting at or
 * before their scheduled start; `late` the started remainder; `notStarted`
 * the rest.
 */
import type { DatabaseClient } from '../../db/client';
import { Prisma } from '../../db/generated/prisma/client';
import {
  REQUEST_REPORT_STATUSES,
  VISIT_REPORT_STATUSES,
  type CaregiversReportQuery,
  type RequestsReportQuery,
  type VisitsReportQuery,
} from '../../contracts/reports';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { visitDateWindow } from '../common/visit-date-window';

const SERVICE_ROWS_CAP = 100;
const CAREGIVER_ROWS_CAP = 200;

type VisitWhere = Prisma.VisitWhereInput;
type RequestWhere = Prisma.ServiceRequestWhereInput;

export interface RequestsReport {
  timezone: string;
  from: string | null;
  to: string | null;
  status: string | null;
  serviceId: string | null;
  total: number;
  byStatus: Record<(typeof REQUEST_REPORT_STATUSES)[number], number>;
  byService: Array<{
    serviceId: string;
    slug: string;
    nameAr: string | null;
    nameEn: string | null;
    count: number;
  }>;
  byServiceTruncated: boolean;
}

export interface VisitsReport {
  timezone: string;
  from: string | null;
  to: string | null;
  status: string | null;
  serviceId: string | null;
  total: number;
  byStatus: Record<(typeof VISIT_REPORT_STATUSES)[number], number>;
  unassigned: number;
  timeliness: { started: number; onTime: number; late: number; notStarted: number };
}

export interface CaregiverLoadRow {
  caregiverId: string;
  name: string;
  operationalStatus: string;
  scheduledMinutes: number;
  byStatus: Record<(typeof VISIT_REPORT_STATUSES)[number], number>;
}

export interface CaregiversReport {
  timezone: string;
  from: string | null;
  to: string | null;
  status: string | null;
  serviceId: string | null;
  items: CaregiverLoadRow[];
  truncated: boolean;
}

function zeroStatuses<T extends string>(statuses: readonly T[]): Record<T, number> {
  return Object.fromEntries(statuses.map((status) => [status, 0])) as Record<T, number>;
}

/** Service display names are read defensively from config JSON; slug always exists. */
function serviceName(config: Prisma.JsonValue, key: 'nameAr' | 'nameEn'): string | null {
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const value = (config as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export function createReportsService(db: DatabaseClient) {
  async function resolveServiceScope(
    tx: Prisma.TransactionClient,
    tenantId: string,
    serviceId: string | undefined,
  ) {
    if (serviceId === undefined) return null;
    // A filter naming another tenant's (or no) service is indistinguishable
    // from a missing resource: generic 404, no enumeration (I01/I02).
    const service = await tx.agencyService.findFirst({
      where: { tenantId, id: serviceId },
      select: { id: true },
    });
    if (!service) throw missing();
    return service.id;
  }

  /** Shared scoped where-builder for visit aggregates. */
  function visitWhere(
    query: VisitsReportQuery,
    tenantId: string,
    serviceId: string | null,
    window: { gte?: Date; lt?: Date },
  ): VisitWhere {
    return {
      tenantId,
      ...(serviceId ? { agencyServiceId: serviceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(Object.keys(window).length > 0 ? { scheduledStartUtc: window } : {}),
    };
  }

  return {
    requests: (auth: AuthState, query: RequestsReportQuery) =>
      db.$transaction(async (tx): Promise<RequestsReport> => {
        const tenantId = await agencyAction(tx, auth, 'reports.read');
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const serviceId = await resolveServiceScope(tx, tenantId, query.serviceId);
        const window = visitDateWindow(query, tenant.timezone);
        const where: RequestWhere = {
          tenantId,
          ...(serviceId ? { agencyServiceId: serviceId } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(Object.keys(window).length > 0 ? { submittedAt: window } : {}),
        };
        const [statusGroups, serviceGroups, total] = await Promise.all([
          tx.serviceRequest.groupBy({ by: ['status'], where, _count: { _all: true } }),
          tx.serviceRequest.groupBy({
            by: ['agencyServiceId'],
            where,
            _count: { _all: true },
            orderBy: [{ _count: { agencyServiceId: 'desc' } }, { agencyServiceId: 'asc' }],
            take: SERVICE_ROWS_CAP + 1,
          }),
          tx.serviceRequest.count({ where }),
        ]);
        const byStatus = zeroStatuses(REQUEST_REPORT_STATUSES);
        for (const group of statusGroups) {
          if ((REQUEST_REPORT_STATUSES as readonly string[]).includes(group.status))
            byStatus[group.status as (typeof REQUEST_REPORT_STATUSES)[number]] = group._count._all;
        }
        const capped = serviceGroups.slice(0, SERVICE_ROWS_CAP);
        const services = await tx.agencyService.findMany({
          where: { tenantId, id: { in: capped.map((g) => g.agencyServiceId) } },
          select: { id: true, slug: true, config: true },
        });
        const serviceMap = new Map(services.map((service) => [service.id, service]));
        const byService = capped
          .map((group) => {
            const service = serviceMap.get(group.agencyServiceId);
            // Same-tenant FK guarantees presence; keep a defensive skip.
            if (!service) return null;
            return {
              serviceId: service.id,
              slug: service.slug,
              nameAr: serviceName(service.config, 'nameAr'),
              nameEn: serviceName(service.config, 'nameEn'),
              count: group._count._all,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        return {
          timezone: tenant.timezone,
          from: query.from ?? null,
          to: query.to ?? null,
          status: query.status ?? null,
          serviceId: serviceId ?? null,
          total,
          byStatus,
          byService,
          byServiceTruncated: serviceGroups.length > capped.length,
        };
      }),

    visits: (auth: AuthState, query: VisitsReportQuery) =>
      db.$transaction(async (tx): Promise<VisitsReport> => {
        const tenantId = await agencyAction(tx, auth, 'reports.read');
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const serviceId = await resolveServiceScope(tx, tenantId, query.serviceId);
        const window = visitDateWindow(query, tenant.timezone);
        const base: VisitWhere = visitWhere(query, tenantId, serviceId, window);
        const [statusGroups, total, unassigned, timeliness] = await Promise.all([
          tx.visit.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
          tx.visit.count({ where: base }),
          tx.visit.count({ where: { ...base, assignedCaregiverId: null } }),
          (async () => {
            // One grouped raw query (column-to-column comparison is not
            // expressible in Prisma where); fully parameterized fragments.
            const conditions = [Prisma.sql`v.tenant_id = ${tenantId}::uuid`];
            if (window.gte) conditions.push(Prisma.sql`v.scheduled_start_utc >= ${window.gte}`);
            if (window.lt) conditions.push(Prisma.sql`v.scheduled_start_utc < ${window.lt}`);
            if (serviceId) conditions.push(Prisma.sql`v.agency_service_id = ${serviceId}::uuid`);
            if (query.status) conditions.push(Prisma.sql`v.status = ${query.status}::text`);
            const rows = await tx.$queryRaw<
              Array<{ started: bigint; on_time: bigint; late: bigint }>
            >(
              Prisma.sql`SELECT
                  count(*) FILTER (WHERE v.actual_start_at IS NOT NULL) AS started,
                  count(*) FILTER (WHERE v.actual_start_at IS NOT NULL AND v.actual_start_at <= v.scheduled_start_utc) AS on_time,
                  count(*) FILTER (WHERE v.actual_start_at IS NOT NULL AND v.actual_start_at > v.scheduled_start_utc) AS late
                FROM visits v WHERE ${Prisma.join(conditions, ' AND ')}`,
            );
            const row = rows[0];
            return {
              started: Number(row?.started ?? 0n),
              onTime: Number(row?.on_time ?? 0n),
              late: Number(row?.late ?? 0n),
            };
          })(),
        ]);
        const byStatus = zeroStatuses(VISIT_REPORT_STATUSES);
        for (const group of statusGroups) {
          if ((VISIT_REPORT_STATUSES as readonly string[]).includes(group.status))
            byStatus[group.status as (typeof VISIT_REPORT_STATUSES)[number]] = group._count._all;
        }
        return {
          timezone: tenant.timezone,
          from: query.from ?? null,
          to: query.to ?? null,
          status: query.status ?? null,
          serviceId: serviceId ?? null,
          total,
          byStatus,
          unassigned,
          timeliness: {
            ...timeliness,
            notStarted: total - timeliness.started,
          },
        };
      }),

    caregivers: (auth: AuthState, query: CaregiversReportQuery) =>
      db.$transaction(async (tx): Promise<CaregiversReport> => {
        const tenantId = await agencyAction(tx, auth, 'reports.read');
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        const serviceId = await resolveServiceScope(tx, tenantId, query.serviceId);
        const window = visitDateWindow(query, tenant.timezone);
        const conditions = [
          Prisma.sql`v.tenant_id = ${tenantId}::uuid`,
          Prisma.sql`v.assigned_caregiver_id IS NOT NULL`,
        ];
        if (window.gte) conditions.push(Prisma.sql`v.scheduled_start_utc >= ${window.gte}`);
        if (window.lt) conditions.push(Prisma.sql`v.scheduled_start_utc < ${window.lt}`);
        if (serviceId) conditions.push(Prisma.sql`v.agency_service_id = ${serviceId}::uuid`);
        if (query.status) conditions.push(Prisma.sql`v.status = ${query.status}::text`);
        const statusColumns = VISIT_REPORT_STATUSES.map(
          (status) =>
            Prisma.sql`count(*) FILTER (WHERE v.status = ${status}::text) AS ${Prisma.raw(`"${status.toLowerCase()}_count"`)}`,
        );
        const rows = await tx.$queryRaw<
          Array<{
            caregiver_id: string;
            scheduled_seconds: bigint;
            [key: string]: string | bigint;
          }>
        >(
          Prisma.sql`SELECT v.assigned_caregiver_id AS caregiver_id,
              COALESCE(sum(EXTRACT(EPOCH FROM (v.scheduled_end_utc - v.scheduled_start_utc)))
                FILTER (WHERE v.status <> 'CANCELLED'), 0) AS scheduled_seconds,
              ${Prisma.join(statusColumns, ', ')}
            FROM visits v
            WHERE ${Prisma.join(conditions, ' AND ')}
            GROUP BY v.assigned_caregiver_id
            ORDER BY scheduled_seconds DESC, caregiver_id ASC
            LIMIT ${CAREGIVER_ROWS_CAP + 1}`,
        );
        const truncated = rows.length > CAREGIVER_ROWS_CAP;
        const pageRows = rows.slice(0, CAREGIVER_ROWS_CAP);
        const caregivers = await tx.caregiver.findMany({
          where: { tenantId, id: { in: pageRows.map((r) => r.caregiver_id) } },
          select: { id: true, name: true, operationalStatus: true },
        });
        const byId = new Map(caregivers.map((c) => [c.id, c]));
        const items = pageRows.flatMap((row) => {
          const caregiver = byId.get(row.caregiver_id);
          if (!caregiver) return [];
          const byStatus = zeroStatuses(VISIT_REPORT_STATUSES);
          for (const status of VISIT_REPORT_STATUSES) {
            const value = row[`${status.toLowerCase()}_count`];
            byStatus[status] = Number(value ?? 0n);
          }
          return [
            {
              caregiverId: caregiver.id,
              name: caregiver.name,
              operationalStatus: caregiver.operationalStatus,
              scheduledMinutes: Math.round(Number(row.scheduled_seconds) / 60),
              byStatus,
            },
          ];
        });
        return {
          timezone: tenant.timezone,
          from: query.from ?? null,
          to: query.to ?? null,
          status: query.status ?? null,
          serviceId: serviceId ?? null,
          items,
          truncated,
        };
      }),
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;

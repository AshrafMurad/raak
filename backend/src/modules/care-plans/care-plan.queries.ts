/**
 * Care-plan queries (docs 07 Sprint 5): tenant-scoped list, detail and the
 * read-only activation preview. Queries project data only — they never mutate
 * plan, version or visit state — and each owns its `careplans.read`
 * authorization gate and privacy-safe 404 exactly as characterized before
 * extraction from the facade.
 */
import type { DatabaseClient } from '../../db/client';
import { ServiceConfigSchema } from '../../contracts/catalog';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { localDateWeekday, utcLocalDate } from '../common/local-time';
import { expandOccurrences } from './recurrence';
import { serviceSnapshot, versionProjection } from './care-plan.repository';
import { versionRecurrenceSpec } from './care-plan-content';
import type { CarePlanService } from './care-plan.types';

export function createCarePlanQueries(
  db: DatabaseClient,
): Pick<CarePlanService, 'list' | 'detail' | 'preview'> {
  return {
    list: (auth: AuthState, filter: { patientId?: string; status?: string; cursor?: string }) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.read');
        const rows = await tx.carePlan.findMany({
          where: {
            tenantId,
            ...(filter.patientId ? { patientId: filter.patientId } : {}),
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.cursor ? { id: { gt: filter.cursor } } : {}),
          },
          select: {
            id: true,
            status: true,
            currentVersion: true,
            primaryCaregiverId: true,
            startedAt: true,
            closedAt: true,
            createdAt: true,
            patient: { select: { id: true, displayName: true } },
            service: { select: { id: true, config: true } },
            _count: { select: { visits: { where: { status: 'PLANNED' } } } },
          },
          orderBy: { id: 'asc' },
          take: 21,
        });
        const items = rows.slice(0, 20).map((row) => {
          const config = ServiceConfigSchema.parse(row.service.config);
          return {
            id: row.id,
            status: row.status,
            currentVersion: row.currentVersion,
            primaryCaregiverId: row.primaryCaregiverId,
            startedAt: row.startedAt,
            closedAt: row.closedAt,
            createdAt: row.createdAt,
            patient: row.patient,
            serviceId: row.service.id,
            serviceNameAr: config.nameAr,
            serviceNameEn: config.nameEn,
            plannedVisits: row._count.visits,
          };
        });
        return { items, nextCursor: rows.length > 20 ? rows[19]!.id : null };
      }),

    detail: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.read');
        const plan = await tx.carePlan.findFirst({
          where: { tenantId, id },
          select: {
            id: true,
            status: true,
            currentVersion: true,
            primaryCaregiverId: true,
            startedAt: true,
            closedAt: true,
            createdAt: true,
            patient: { select: { id: true, displayName: true, areaId: true } },
            service: { select: { id: true, config: true } },
            versions: { select: versionProjection, orderBy: { version: 'desc' } },
          },
        });
        if (!plan) throw missing();
        const plannedVisits = await tx.visit.count({
          where: { tenantId, carePlanId: id, status: 'PLANNED' },
        });
        const scheduledVisits = await tx.visit.count({
          where: { tenantId, carePlanId: id, status: 'SCHEDULED' },
        });
        const config = ServiceConfigSchema.parse(plan.service.config);
        return {
          id: plan.id,
          status: plan.status,
          currentVersion: plan.currentVersion,
          primaryCaregiverId: plan.primaryCaregiverId,
          startedAt: plan.startedAt,
          closedAt: plan.closedAt,
          createdAt: plan.createdAt,
          patient: plan.patient,
          serviceId: plan.service.id,
          serviceNameAr: config.nameAr,
          serviceNameEn: config.nameEn,
          clinicalClass: config.clinicalClass,
          requiredQualificationCodes: config.requiredQualificationCodes,
          plannedVisits,
          scheduledVisits,
          versions: plan.versions,
        };
      }),

    /** Read-only activation preview (occurrences + amendment impact). */
    preview: (auth: AuthState, id: string, versionNumber?: number) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'careplans.read');
        const plan = await tx.carePlan.findFirst({ where: { tenantId, id } });
        if (!plan) throw missing();
        const version = await tx.carePlanVersion.findFirst({
          where: { tenantId, carePlanId: id, ...(versionNumber ? { version: versionNumber } : {}) },
          orderBy: { version: 'desc' },
        });
        if (!version) throw missing();
        const { config } = await serviceSnapshot(tx, tenantId, plan.agencyServiceId);
        const occurrences = expandOccurrences(versionRecurrenceSpec(version), version.id);
        // Amendment impact: future unassigned PLANNED visits of other versions.
        const future = await tx.visit.findMany({
          where: {
            tenantId,
            carePlanId: id,
            status: 'PLANNED',
            assignedCaregiverId: null,
            planVersionId: { not: version.id },
          },
          select: { id: true, scheduledStartUtc: true, planVersionId: true },
        });
        const wouldCancel = future.filter(
          (visit) =>
            utcLocalDate(visit.scheduledStartUtc, version.timezoneSnapshot) >= version.validFrom,
        );
        return {
          planId: id,
          version: version.version,
          versionStatus: version.status,
          clinicalApprovalRequired: config.clinicalClass === 'CLINICAL',
          spanDays: Math.round(
            (Date.UTC(
              +version.validUntil.slice(0, 4),
              +version.validUntil.slice(5, 7) - 1,
              +version.validUntil.slice(8, 10),
            ) -
              Date.UTC(
                +version.validFrom.slice(0, 4),
                +version.validFrom.slice(5, 7) - 1,
                +version.validFrom.slice(8, 10),
              )) /
              86_400_000 +
              1,
          ),
          occurrenceCount: occurrences.length,
          occurrences: occurrences.map((o) => ({
            localDate: o.localDate,
            weekday: localDateWeekday(o.localDate),
            startUtc: o.scheduledStartUtc,
            endUtc: o.scheduledEndUtc,
          })),
          wouldCancelCount: wouldCancel.length,
          wouldCancel: wouldCancel.map((v) => ({
            visitId: v.id,
            localDate: utcLocalDate(v.scheduledStartUtc, version.timezoneSnapshot),
          })),
        };
      }),
  };
}

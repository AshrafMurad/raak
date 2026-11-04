/**
 * Visit queries (docs 07 Sprint 5): tenant-scoped visit list and detail reads
 * for the agency workspace. Queries project data only — they never mutate
 * visit state — and each owns its `visits.read` authorization gate, tenant
 * scope, local-date window conversion and privacy-safe 404 exactly as
 * characterized before extraction from the assignment service. Response
 * projections stay explicit and carry no full patient rows.
 */
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import type { VisitListQuery } from '../../contracts/careplans';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { visitDateWindow } from '../common/visit-date-window';

/** Visit list projection (docs 07): safe operational fields only. */
export interface VisitListItem {
  id: string;
  status: string;
  assignmentHealth: string;
  reviewStatus: string;
  scheduledStartUtc: Date;
  scheduledEndUtc: Date;
  timezoneSnapshot: string;
  version: number;
  areaId: string;
  carePlanId: string | null;
  patient: { id: string; displayName: string };
  assignedCaregiver: { id: string; name: string } | null;
}

export interface VisitListResult {
  timezone: string;
  bufferMinutes: number;
  items: VisitListItem[];
  nextCursor: string | null;
}

export interface VisitTaskProjection {
  id: string;
  order: number;
  descriptionSnapshot: string;
  isRequired: boolean;
  outcome: string;
  notDoneReason: string | null;
}

export interface VisitAssignmentHistoryEntry {
  id: string;
  oldCaregiverId: string | null;
  newCaregiverId: string;
  reason: string | null;
  createdAt: Date;
  oldCaregiverName: string | null;
  newCaregiverName: string | null;
}

export interface VisitDetail {
  id: string;
  status: string;
  assignmentHealth: string;
  reviewStatus: string;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  scheduledStartUtc: Date;
  scheduledEndUtc: Date;
  timezoneSnapshot: string;
  areaId: string;
  occurrenceKey: string | null;
  version: number;
  cancelledReason: string | null;
  cancelledAt: Date | null;
  serviceNameSnapshot: Prisma.JsonValue;
  patient: { id: string; displayName: string };
  assignedCaregiver: { id: string; name: string } | null;
  carePlan: { id: string; status: string; currentVersion: number } | null;
  tasks: VisitTaskProjection[];
  assignmentHistory: VisitAssignmentHistoryEntry[];
}

/**
 * The controller-facing visit read workflows (docs 07). The controller
 * composes `createVisitQueries(db)` for reads and
 * `createAssignmentService(db, now)` for assign/reassign/bulk commands;
 * authorization, tenant scope and projection ownership stay inside this
 * module.
 */
export interface VisitQueries {
  visitList(auth: AuthState, query: VisitListQuery): Promise<VisitListResult>;
  visitDetail(auth: AuthState, visitId: string): Promise<VisitDetail>;
}

export function createVisitQueries(db: DatabaseClient): VisitQueries {
  return {
    visitList: (auth: AuthState, query: VisitListQuery) =>
      db.$transaction(async (tx): Promise<VisitListResult> => {
        const tenantId = await agencyAction(tx, auth, 'visits.read');
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true, travelBufferMin: true },
        });
        // Window bounds are local calendar days resolved in the tenant zone.
        const rows = await tx.visit.findMany({
          where: {
            tenantId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.assignmentHealth ? { assignmentHealth: query.assignmentHealth } : {}),
            ...(query.carePlanId ? { carePlanId: query.carePlanId } : {}),
            ...(query.patientId ? { patientId: query.patientId } : {}),
            ...(query.caregiverId ? { assignedCaregiverId: query.caregiverId } : {}),
            scheduledStartUtc: visitDateWindow(query, tenant.timezone),
            ...(query.cursor ? { id: { gt: query.cursor } } : {}),
          },
          select: {
            id: true,
            status: true,
            assignmentHealth: true,
            reviewStatus: true,
            scheduledStartUtc: true,
            scheduledEndUtc: true,
            timezoneSnapshot: true,
            version: true,
            areaId: true,
            carePlanId: true,
            patient: { select: { id: true, displayName: true } },
            assignedCaregiver: { select: { id: true, name: true } },
          },
          orderBy: { id: 'asc' },
          take: 21,
        });
        return {
          timezone: tenant.timezone,
          bufferMinutes: tenant.travelBufferMin,
          items: rows.slice(0, 20),
          nextCursor: rows.length > 20 ? rows[19]!.id : null,
        };
      }),

    visitDetail: (auth: AuthState, visitId: string) =>
      db.$transaction(async (tx): Promise<VisitDetail> => {
        const tenantId = await agencyAction(tx, auth, 'visits.read');
        const visit = await tx.visit.findFirst({
          where: { tenantId, id: visitId },
          select: {
            id: true,
            status: true,
            assignmentHealth: true,
            reviewStatus: true,
            actualStartAt: true,
            actualEndAt: true,
            scheduledStartUtc: true,
            scheduledEndUtc: true,
            timezoneSnapshot: true,
            areaId: true,
            occurrenceKey: true,
            version: true,
            cancelledReason: true,
            cancelledAt: true,
            serviceNameSnapshot: true,
            patient: { select: { id: true, displayName: true } },
            assignedCaregiver: { select: { id: true, name: true } },
            carePlan: { select: { id: true, status: true, currentVersion: true } },
            tasks: {
              select: {
                id: true,
                order: true,
                descriptionSnapshot: true,
                isRequired: true,
                outcome: true,
                notDoneReason: true,
              },
              orderBy: { order: 'asc' },
            },
            assignmentHistory: {
              select: {
                id: true,
                oldCaregiverId: true,
                newCaregiverId: true,
                reason: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        });
        if (!visit) throw missing();
        const names = new Map(
          (
            await tx.caregiver.findMany({
              where: { tenantId },
              select: { id: true, name: true },
            })
          ).map((c) => [c.id, c.name]),
        );
        return {
          ...visit,
          assignmentHistory: visit.assignmentHistory.map((h) => ({
            ...h,
            oldCaregiverName: h.oldCaregiverId ? (names.get(h.oldCaregiverId) ?? null) : null,
            newCaregiverName: names.get(h.newCaregiverId) ?? null,
          })),
        };
      }),
  };
}

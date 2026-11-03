/**
 * Advisory candidate search (docs 04 BR-SCH, D12): evaluates every tenant
 * caregiver against the visit with the shared hard filters, ranks eligible
 * candidates deterministically and returns safe exclusion reasons. Reads are
 * advisory only — assignment revalidates everything at commit time.
 */
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { utcLocalDate } from '../common/local-time';
import { isCarePlanAssignable } from '../care-plans/care-plan-assignment-policy';
import { hardFilterReasons, loadFilterContext } from './filters';

export interface RankedCandidate {
  caregiverId: string;
  name: string;
  isPrimary: boolean;
  load: number;
  sameArea: boolean;
  serviceAreas: string[];
}

export function createCandidateService(db: DatabaseClient) {
  return {
    candidates: async (auth: AuthState, visitId: string) => {
      const run = db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'scheduling.manage');
        const visit = await tx.visit.findFirst({ where: { tenantId, id: visitId } });
        if (!visit) throw missing();
        if (visit.status !== 'PLANNED' && visit.status !== 'SCHEDULED')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Candidates are available for planned or scheduled visits only.',
          );
        // Advisory only (ADR-0012 decision 8): never advertise candidates for
        // a visit whose parent plan is not ACTIVE; commit revalidates.
        if (visit.carePlanId) {
          const plan = await tx.carePlan.findFirst({
            where: { tenantId, id: visit.carePlanId },
            select: { status: true },
          });
          if (!plan) throw missing();
          if (!isCarePlanAssignable(plan.status))
            throw new ApiError(
              409,
              'STATE_TRANSITION_INVALID',
              'Candidates are available only for visits under an active plan.',
            );
        }
        const ctx = await loadFilterContext(tx, tenantId, visit);
        const caregivers = await tx.caregiver.findMany({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            operationalStatus: true,
            serviceAreasJson: true,
            staffAccount: { select: { status: true, role: true, emailVerifiedAt: true } },
            serviceAuthorizations: { select: { agencyServiceId: true } },
            qualifications: {
              select: {
                code: true,
                status: true,
                validThrough: true,
                verifiedBy: true,
                verifiedAt: true,
              },
            },
          },
          take: 200,
          orderBy: { id: 'asc' },
        });
        const loads = new Map<string, number>();
        for (const row of await tx.visit.groupBy({
          by: ['assignedCaregiverId'],
          where: {
            tenantId,
            assignedCaregiverId: { not: null },
            status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          },
          _count: { _all: true },
        }))
          if (row.assignedCaregiverId) loads.set(row.assignedCaregiverId, row._count._all);

        let primaryCaregiverId: string | null = null;
        if (visit.carePlanId)
          primaryCaregiverId = (
            await tx.carePlan.findFirstOrThrow({
              where: { tenantId, id: visit.carePlanId },
              select: { primaryCaregiverId: true },
            })
          ).primaryCaregiverId;

        const eligible: RankedCandidate[] = [];
        const excluded: { caregiverId: string; name: string; reasons: string[] }[] = [];
        for (const caregiver of caregivers) {
          const reasons = await hardFilterReasons(tx, ctx, caregiver, { excludeVisitId: visit.id });
          const areas = (caregiver.serviceAreasJson as string[]) ?? [];
          if (reasons.length === 0) {
            eligible.push({
              caregiverId: caregiver.id,
              name: caregiver.name,
              isPrimary: caregiver.id === primaryCaregiverId,
              load: loads.get(caregiver.id) ?? 0,
              sameArea: areas.includes(visit.areaId),
              serviceAreas: areas,
            });
          } else {
            excluded.push({ caregiverId: caregiver.id, name: caregiver.name, reasons });
          }
        }
        // Deterministic ranking (ADR-0012): primary preference, lighter load,
        // same patient area, stable caregiver-ID tie-break.
        eligible.sort(
          (a, b) =>
            Number(b.isPrimary) - Number(a.isPrimary) ||
            a.load - b.load ||
            Number(b.sameArea) - Number(a.sameArea) ||
            (a.caregiverId < b.caregiverId ? -1 : 1),
        );
        return {
          visitId: visit.id,
          visitStatus: visit.status,
          visitLocalDate: utcLocalDate(visit.scheduledStartUtc, visit.timezoneSnapshot),
          bufferMinutes: ctx.bufferMinutes,
          advisory: true,
          items: eligible,
          excluded,
        };
      });
      return run;
    },
  };
}

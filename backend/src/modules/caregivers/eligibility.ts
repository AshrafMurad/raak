/** Public caregiver foundation policy shared by setup and scheduling. This
 * proves qualifications/coverage, never conflict-free booking by itself. */
import type { Prisma } from '../../db/generated/prisma/client';
import type { CandidateExclusionReason } from '../../contracts/careplans';

export interface CaregiverFoundation {
  id: string;
  operationalStatus: string;
  serviceAreasJson: Prisma.JsonValue;
  staffAccount: { status: string; role: string; emailVerifiedAt: Date | null } | null;
  serviceAuthorizations: { agencyServiceId: string }[];
  qualifications: {
    code: string;
    status: string;
    validThrough: string | null;
    verifiedBy: string | null;
    verifiedAt: Date | null;
  }[];
}

export function foundationReasons(
  caregiver: CaregiverFoundation,
  serviceId: string,
  config: { requiredQualificationCodes: string[]; serviceAreaIds: string[] },
  localDate: string,
): CandidateExclusionReason[] {
  const reasons: CandidateExclusionReason[] = [];
  const account = caregiver.staffAccount;
  if (
    caregiver.operationalStatus !== 'ACTIVE' ||
    !account ||
    account.role !== 'CAREGIVER' ||
    account.status !== 'ACTIVE' ||
    !account.emailVerifiedAt
  )
    reasons.push('ACCOUNT_INACTIVE');
  if (
    !caregiver.serviceAuthorizations.some(
      (authorization) => authorization.agencyServiceId === serviceId,
    )
  )
    reasons.push('SERVICE_NOT_AUTHORIZED');
  const verified = new Set(
    caregiver.qualifications
      .filter(
        (qualification) =>
          qualification.status === 'VERIFIED' &&
          qualification.verifiedBy !== null &&
          qualification.verifiedAt !== null &&
          (qualification.validThrough === null || qualification.validThrough >= localDate),
      )
      .map((qualification) => qualification.code),
  );
  if (config.requiredQualificationCodes.some((code) => !verified.has(code)))
    reasons.push('QUALIFICATION_INVALID');
  const areas = Array.isArray(caregiver.serviceAreasJson) ? caregiver.serviceAreasJson : [];
  if (!config.serviceAreaIds.some((area) => areas.includes(area))) reasons.push('AREA_NOT_COVERED');
  return reasons;
}

export async function effectiveIntervals(
  tx: Prisma.TransactionClient,
  tenantId: string,
  caregiverId: string,
  localDate: string,
) {
  const exception = await tx.availabilityException.findFirst({
    where: { tenantId, caregiverId, localDate },
  });
  if (exception)
    return exception.type === 'UNAVAILABLE'
      ? []
      : [{ start: exception.startLocal!, end: exception.endLocal! }];
  const slots = await tx.availabilitySlot.findMany({
    where: {
      tenantId,
      caregiverId,
      weekday: new Date(`${localDate}T00:00:00Z`).getUTCDay(),
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: localDate } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: localDate } }] },
      ],
    },
  });
  return slots.map((slot) => ({ start: slot.localStartTime, end: slot.localEndTime }));
}

export async function loadCaregiverFoundation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  caregiverId: string,
) {
  return tx.caregiver.findFirst({
    where: { tenantId, id: caregiverId },
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
  });
}

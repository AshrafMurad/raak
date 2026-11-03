import { validatePlanContent } from './validation';
import type { CarePlanDetail, CarePlanStatus, CarePlanVersion, PlanContent } from './contracts';

export function resolveSelectedPlanVersion(
  versions: CarePlanVersion[],
  selectedVersion: number | null,
  currentVersion?: number,
): CarePlanVersion | null {
  return (
    versions.find((version) => version.version === selectedVersion) ??
    versions.find((version) => version.version === currentVersion) ??
    versions.find((version) => version.status === 'DRAFT') ??
    versions[0] ??
    null
  );
}

export function canReviseCarePlan(plan: CarePlanDetail): boolean {
  return (
    !['DRAFT', 'COMPLETED', 'CANCELLED'].includes(plan.status) &&
    !plan.versions.some((version) => version.status === 'DRAFT')
  );
}

export function isClinicalApprovalApplicable(
  plan: CarePlanDetail,
  version: CarePlanVersion,
): boolean {
  return (
    plan.clinicalClass === 'CLINICAL' &&
    !['COMPLETED', 'CANCELLED'].includes(plan.status) &&
    version.version === plan.currentVersion &&
    version.status === 'DRAFT'
  );
}

export function canActivatePlanVersion(
  plan: CarePlanDetail,
  version: CarePlanVersion,
  hasCurrentPreview: boolean,
): boolean {
  return (
    hasCurrentPreview &&
    plan.status !== 'COMPLETED' &&
    plan.status !== 'CANCELLED' &&
    version.version === plan.currentVersion &&
    (plan.clinicalClass !== 'CLINICAL' || version.status === 'APPROVED') &&
    ['DRAFT', 'APPROVED'].includes(version.status)
  );
}

export function lifecycleActions(
  status: CarePlanStatus,
): ('pause' | 'resume' | 'complete' | 'cancel')[] {
  switch (status) {
    case 'ACTIVE':
      return ['pause', 'complete', 'cancel'];
    case 'PAUSED':
      return ['resume', 'complete', 'cancel'];
    case 'DRAFT':
      return ['cancel'];
    case 'COMPLETED':
    case 'CANCELLED':
      return [];
  }
}

export function canSubmitPlanContent(content: PlanContent, pending: boolean): boolean {
  return !pending && validatePlanContent(content).length === 0;
}

export function carePlanStatusTone(status: string) {
  if (status === 'ACTIVE' || status === 'SCHEDULED' || status === 'APPROVED')
    return 'scheduled' as const;
  if (status === 'COMPLETED' || status === 'ACTIVATED') return 'completed' as const;
  if (status === 'CANCELLED' || status === 'MISSED' || status === 'NEEDS_REASSIGNMENT')
    return 'cancelled' as const;
  if (status === 'IN_PROGRESS') return 'in_progress' as const;
  return 'planned' as const;
}

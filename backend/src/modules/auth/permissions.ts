/**
 * Permission gate (docs 05 enforcement rule 1): deny by default; roles are
 * never sufficient alone — the principal's tenant status is part of every
 * staff decision. This is the single authorize() registry for Sprint 1;
 * later sprints extend the action list, never bypass this gate.
 */
export const PERMISSION_ACTIONS = [
  'platform.tenants.read',
  'platform.tenants.activate',
  'platform.tenants.suspend',
  'platform.audit.read',
  'staff.invitations.create',
  'catalog.read',
  'catalog.draft',
  'catalog.publish',
  'branding.manage',
  'requests.review',
  'quotes.manage',
  'customers.claim',
  'patients.read',
  'patients.manage',
  'patients.grants',
  'patients.granted_read',
  'caregivers.read',
  'caregivers.manage',
  'caregivers.verify',
  'caregivers.self_read',
  'documents.manage',
  'documents.read_granted',
  'careplans.read',
  'careplans.manage',
  'careplans.clinical_approve',
  'visits.read',
  'scheduling.manage',
  'visits.self_execute',
  'visits.review',
  'visits.customer_change',
  'agency.settings.read',
  'agency.settings.manage',
  'notifications.policy.read',
  'notifications.policy.manage',
  'notifications.deliveries.read',
  'notifications.receive',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type AuthzPrincipal = {
  principalType: 'PLATFORM_OPERATOR' | 'AGENCY_STAFF' | 'AGENCY_CUSTOMER';
  /** Staff role (docs 05 roles); undefined for operator/customer principals. */
  role?: string;
  /** Status of the tenant resolved from the trusted host. */
  tenantStatus?: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';
};

export interface AuthzDecision {
  allowed: boolean;
}

const PLATFORM_ACTIONS: ReadonlySet<string> = new Set([
  'platform.tenants.read',
  'platform.tenants.activate',
  'platform.tenants.suspend',
  'platform.audit.read',
]);

const INVITATION_ROLES: ReadonlySet<string> = new Set(['AGENCY_OWNER', 'AGENCY_ADMIN']);

export function authorize(
  principal: AuthzPrincipal | null | undefined,
  action: PermissionAction,
): AuthzDecision {
  if (!principal) return { allowed: false };

  if (principal.principalType === 'PLATFORM_OPERATOR') {
    return { allowed: PLATFORM_ACTIONS.has(action) };
  }

  if (principal.principalType === 'AGENCY_STAFF') {
    if (principal.tenantStatus === 'ACTIVE') {
      const admin = principal.role === 'AGENCY_OWNER' || principal.role === 'AGENCY_ADMIN';
      if (
        [
          'catalog.read',
          'catalog.draft',
          'requests.review',
          'quotes.manage',
          'patients.read',
          'patients.manage',
          'caregivers.read',
          'caregivers.manage',
          'documents.manage',
          'careplans.read',
          'careplans.manage',
          'visits.read',
          'scheduling.manage',
          'visits.review',
          'agency.settings.read',
          'notifications.policy.read',
        ].includes(action)
      )
        return { allowed: admin || principal.role === 'CARE_COORDINATOR' };
      if (
        action === 'catalog.publish' ||
        action === 'branding.manage' ||
        action === 'patients.grants' ||
        action === 'caregivers.verify' ||
        action === 'agency.settings.manage' ||
        action === 'notifications.policy.manage' ||
        action === 'notifications.deliveries.read'
      )
        return { allowed: admin };
      if (action === 'caregivers.self_read') return { allowed: principal.role === 'CAREGIVER' };
      if (action === 'notifications.receive')
        return { allowed: admin || principal.role === 'CARE_COORDINATOR' || principal.role === 'CAREGIVER' };
      // Sprint 6 caregiver execution audience gate: the visits service must
      // additionally verify the visit is assigned to the caller's own
      // caregiver profile (deny by default; never a role-only grant).
      if (action === 'visits.self_execute') return { allowed: principal.role === 'CAREGIVER' };
      // A06 audience gate only: the care-plan service must additionally verify
      // the approver's agency-verified qualification for the exact service
      // (denies by default; titles never confer clinical authority).
      if (action === 'careplans.clinical_approve')
        return {
          allowed: admin || principal.role === 'CARE_COORDINATOR' || principal.role === 'CAREGIVER',
        };
    }
    if (action === 'staff.invitations.create') {
      return {
        allowed:
          principal.tenantStatus === 'ACTIVE' &&
          !!principal.role &&
          INVITATION_ROLES.has(principal.role),
      };
    }
    return { allowed: false };
  }

  if (principal.principalType === 'AGENCY_CUSTOMER' && principal.tenantStatus === 'ACTIVE')
    return {
      allowed:
        action === 'customers.claim' ||
        action === 'notifications.receive' ||
        action === 'patients.granted_read' ||
        action === 'documents.read_granted' ||
        // Audience gate only: the change-request service additionally requires
        // an active MANAGE_VISITS PatientAccess grant for the visit's patient.
        action === 'visits.customer_change',
    };
  return { allowed: false };
}

import type { AuthState } from './guards';

/**
 * Build the policy principal from an authenticated request state. Shared by
 * the HTTP permission gate and the service-boundary re-check (docs 05 rule 5)
 * so both enforcement points always evaluate the same central registry.
 */
export function principalFromAuth(auth: AuthState): AuthzPrincipal {
  return {
    principalType: auth.session.principalType,
    ...(auth.staff?.role !== undefined ? { role: auth.staff.role } : {}),
    ...(auth.realm.kind === 'AGENCY' ? { tenantStatus: auth.realm.tenant.status } : {}),
  };
}

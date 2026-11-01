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
      if (['catalog.read', 'catalog.draft', 'requests.review'].includes(action))
        return { allowed: admin || principal.role === 'CARE_COORDINATOR' };
      if (action === 'catalog.publish' || action === 'branding.manage') return { allowed: admin };
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

  // Customers hold no Sprint 1 actions.
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

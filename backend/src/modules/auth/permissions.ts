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

export function authorize(principal: AuthzPrincipal | null | undefined, action: PermissionAction): AuthzDecision {
  if (!principal) return { allowed: false };

  if (principal.principalType === 'PLATFORM_OPERATOR') {
    return { allowed: PLATFORM_ACTIONS.has(action) };
  }

  if (principal.principalType === 'AGENCY_STAFF') {
    if (action === 'staff.invitations.create') {
      return {
        allowed:
          principal.tenantStatus === 'ACTIVE' && !!principal.role && INVITATION_ROLES.has(principal.role),
      };
    }
    return { allowed: false };
  }

  // Customers hold no Sprint 1 actions.
  return { allowed: false };
}

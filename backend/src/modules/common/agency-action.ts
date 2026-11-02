/** Shared live-principal/tenant policy gate; no catalog-specific dependency. */
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import type { AuthState } from '../auth/guards';
import { authorize, type PermissionAction } from '../auth/permissions';

export async function lockActiveTenant(tx: Prisma.TransactionClient, tenantId: string) {
  const rows = await tx.$queryRaw<
    Array<{ status: string }>
  >`SELECT status FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
  if (rows[0]?.status !== 'ACTIVE')
    throw new ApiError(409, 'TENANT_INACTIVE', 'Agency is unavailable.');
}
export async function agencyAction(
  tx: Prisma.TransactionClient,
  auth: AuthState,
  action: PermissionAction,
) {
  if (
    auth.realm.kind !== 'AGENCY' ||
    auth.session.principalType !== 'AGENCY_STAFF' ||
    auth.session.tenantId !== auth.realm.tenant.tenantId
  )
    throw new ApiError(403, 'FORBIDDEN', 'Action unavailable.');
  const tenantId = auth.realm.tenant.tenantId;
  await lockActiveTenant(tx, tenantId);
  const staff = await tx.staffAccount.findFirst({
    where: {
      id: auth.session.principalId,
      tenantId,
      status: 'ACTIVE',
      sessionVersion: auth.session.sessionVersion,
    },
  });
  const session = await tx.authSession.findFirst({
    where: {
      id: auth.sessionId,
      tenantId,
      principalId: auth.session.principalId,
      principalType: 'AGENCY_STAFF',
      sessionVersion: auth.session.sessionVersion,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (
    !staff ||
    !session ||
    !authorize({ principalType: 'AGENCY_STAFF', role: staff.role, tenantStatus: 'ACTIVE' }, action)
      .allowed
  )
    throw new ApiError(403, 'FORBIDDEN', 'Action unavailable.');
  return tenantId;
}
export const missing = () => new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
export const stale = () =>
  new ApiError(409, 'VERSION_CONFLICT', 'This record changed. Reload and try again.');

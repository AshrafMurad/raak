import type { Prisma } from '../../db/generated/prisma/client';
import type { AuthState } from '../auth/guards';
import { authorize, type PermissionAction } from '../auth/permissions';
import { ApiError } from '../../api-error';
import { lockActiveTenant } from './agency-action';

/** Current customer authority; never accepts an email as an ownership grant. */
export async function customerAction(
  tx: Prisma.TransactionClient,
  auth: AuthState,
  action: PermissionAction,
  now: () => Date,
) {
  if (
    auth.realm.kind !== 'AGENCY' ||
    auth.session.principalType !== 'AGENCY_CUSTOMER' ||
    auth.session.tenantId !== auth.realm.tenant.tenantId
  )
    throw new ApiError(403, 'FORBIDDEN', 'Action unavailable.');
  const tenantId = auth.realm.tenant.tenantId;
  await lockActiveTenant(tx, tenantId);
  const customer = await tx.customerAccount.findFirst({
    where: {
      tenantId,
      id: auth.session.principalId,
      status: 'ACTIVE',
      emailVerifiedAt: { not: null },
      sessionVersion: auth.session.sessionVersion,
    },
  });
  const session = await tx.authSession.findFirst({
    where: {
      id: auth.sessionId,
      tenantId,
      principalId: auth.session.principalId,
      principalType: 'AGENCY_CUSTOMER',
      revokedAt: null,
      expiresAt: { gt: now() },
      sessionVersion: auth.session.sessionVersion,
    },
  });
  if (
    !customer ||
    !session ||
    !authorize({ principalType: 'AGENCY_CUSTOMER', tenantStatus: 'ACTIVE' }, action).allowed
  )
    throw new ApiError(403, 'FORBIDDEN', 'Action unavailable.');
  return customer;
}

import type { Prisma, TenantStatus } from './generated/prisma/client';

/** Serializes tenant-scoped writes with lifecycle changes such as suspension. */
export async function lockTenantStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<TenantStatus | null> {
  const rows = await tx.$queryRaw<Array<{ status: TenantStatus }>>`
    SELECT "status"
    FROM "tenants"
    WHERE "id" = ${tenantId}::uuid
    FOR SHARE
  `;
  return rows[0]?.status ?? null;
}

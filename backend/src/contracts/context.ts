import { z } from 'zod';
import { PrincipalType, TenantStatus } from './enums';

/**
 * Sprint 0 boundary declarations, NOT authentication or authorization.
 * Sprint 1 must construct these only from verified server-side session records
 * and tenant registry lookups. Parsing client JSON does not establish trust.
 * Current account/tenant status and resource permissions still need checking
 * on every private operation; this contract grants no patient access.
 */
export const ResolvedTenantContextSchema = z
  .strictObject({
    tenantId: z.uuid(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    status: z.enum(TenantStatus),
  })
  .readonly();
export type ResolvedTenantContext = z.infer<typeof ResolvedTenantContextSchema>;

const sessionFields = {
  principalId: z.uuid(),
  sessionVersion: z.number().int().nonnegative(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
};

export const ServerSessionContextSchema = z
  .discriminatedUnion('principalType', [
    z.strictObject({ ...sessionFields, principalType: z.literal(PrincipalType.PLATFORM_OPERATOR) }),
    z.strictObject({
      ...sessionFields,
      principalType: z.literal(PrincipalType.AGENCY_STAFF),
      tenantId: z.uuid(),
    }),
    z.strictObject({
      ...sessionFields,
      principalType: z.literal(PrincipalType.AGENCY_CUSTOMER),
      tenantId: z.uuid(),
    }),
  ])
  .refine((session) => Date.parse(session.expiresAt) > Date.parse(session.issuedAt), {
    message: 'Session expiry must follow issue time',
  })
  .readonly();
export type ServerSessionContext = z.infer<typeof ServerSessionContextSchema>;

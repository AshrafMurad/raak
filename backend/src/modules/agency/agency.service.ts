/**
 * Agency registration (docs 05 registration/invitation): creates a
 * PENDING_APPROVAL tenant plus an unverified owner account, queues the owner
 * verification email via the outbox and audits — all in one transaction.
 */
import type { DatabaseClient } from '../../db/client';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { ApiError } from '../../api-error';
import type { RegisterAgencyDto } from '../../contracts';
import { generateToken, hashPassword } from '../auth/crypto';
import { Prisma } from '../../db/generated/prisma/client';

export const OWNER_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;

export interface RegisterResult {
  tenantId: string;
  slug: string;
  status: 'PENDING_APPROVAL';
}

export interface AgencyServiceDeps {
  db: DatabaseClient;
  now(): Date;
  /** Builds the email action link embedded in the outbox payload. */
  buildLink(kind: 'owner_verification', token: string): string;
}

export function createAgencyService(deps: AgencyServiceDeps) {
  return {
    async register(input: RegisterAgencyDto): Promise<RegisterResult> {
      const passwordHash = await hashPassword(input.ownerPassword);
      const verification = generateToken();
      const issuedAt = deps.now();

      try {
        return await deps.db.$transaction(async (tx) => {
        const existing = await tx.tenant.findUnique({ where: { slug: input.slug } });
        if (existing) {
          throw new ApiError(409, 'TENANT_SLUG_TAKEN', 'This agency slug is already taken.');
        }
        const tenant = await tx.tenant.create({
          data: {
            slug: input.slug,
            legalName: input.legalName,
            displayName: input.displayName,
            status: 'PENDING_APPROVAL',
            timezone: input.timezone,
            currency: input.currency,
            supportEmail: input.supportEmail.trim().toLowerCase(),
          },
        });
        const owner = await tx.staffAccount.create({
          data: {
            tenantId: tenant.id,
            emailNormalized: input.ownerEmail.trim().toLowerCase(),
            passwordHash,
            role: 'AGENCY_OWNER',
            status: 'PENDING_VERIFICATION',
          },
        });
        await tx.emailToken.create({
          data: {
            tenantId: tenant.id,
            purpose: 'OWNER_VERIFICATION',
            principalType: 'AGENCY_STAFF',
            principalId: owner.id,
            tokenHash: verification.tokenHash,
            expiresAt: new Date(issuedAt.getTime() + OWNER_VERIFICATION_TTL_SECONDS * 1000),
            createdAt: issuedAt,
          },
        });
        await enqueueOutbox(tx, {
          tenantId: tenant.id,
          eventType: 'email.owner_verification',
          aggregateId: owner.id,
          payloadMinimal: {
            to: owner.emailNormalized,
            action: 'owner_verification',
            link: deps.buildLink('owner_verification', verification.token),
          },
        });
        await appendAudit(tx, {
          tenantId: tenant.id,
          action: 'tenant.registered',
          subjectType: 'tenant',
          subjectId: tenant.id,
          metadata: { slug: tenant.slug },
        });
        return { tenantId: tenant.id, slug: tenant.slug, status: 'PENDING_APPROVAL' as const };
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ApiError(409, 'TENANT_SLUG_TAKEN', 'This agency slug is already taken.');
        }
        throw error;
      }
    },
  };
}

export type AgencyService = ReturnType<typeof createAgencyService>;

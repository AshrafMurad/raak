/**
 * Staff invitations (docs 05): Owner/Admin create tenant-bound invitations
 * with hashed single-use 48h tokens; acceptance creates an ACTIVE staff
 * account (plus a caregiver profile row, INACTIVE until qualification
 * workflow in a later sprint). Never assigns care work before checks pass.
 */
import type { DatabaseClient } from '../../db/client';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import { ApiError } from '../../api-error';
import type { CreateInvitationDto, AcceptInvitationDto } from '../../contracts';
import { generateToken, hashPassword, hashToken } from '../auth/crypto';
import type { AuthState } from '../auth/guards';

export const INVITATION_TTL_SECONDS = 48 * 60 * 60;

export interface StaffServiceDeps {
  db: DatabaseClient;
  now(): Date;
  buildLink(kind: 'staff_invitation', token: string, context: { slug: string }): string;
}

export function createStaffService(deps: StaffServiceDeps) {
  const db = deps.db;

  return {
    async createInvitation(auth: AuthState, input: CreateInvitationDto): Promise<{ invitationId: string; expiresAt: Date }> {
      if (auth.realm.kind !== 'AGENCY' || !auth.staff) {
        throw new ApiError(403, 'FORBIDDEN', 'You are not allowed to perform this action.');
      }
      const tenantId = auth.realm.tenant.tenantId;
      const slug = auth.realm.tenant.slug;
      const creatorId = auth.staff.id;
      const email = input.email.trim().toLowerCase();
      const token = generateToken();
      const issuedAt = deps.now();
      const expiresAt = new Date(issuedAt.getTime() + INVITATION_TTL_SECONDS * 1000);

      const invitation = await db.$transaction(async (tx) => {
        const created = await tx.staffInvitation.create({
          data: {
            tenantId,
            emailNormalized: email,
            role: input.role,
            ...(input.caregiverProfile !== undefined
              ? { caregiverProfileJson: input.caregiverProfile }
              : {}),
            tokenHash: token.tokenHash,
            expiresAt,
            createdByStaffId: creatorId,
            createdAt: issuedAt,
          },
        });
        await enqueueOutbox(tx, {
          tenantId,
          eventType: 'email.staff_invitation',
          aggregateId: created.id,
          payloadMinimal: {
            to: email,
            action: 'staff_invitation',
            link: deps.buildLink('staff_invitation', token.token, { slug }),
          },
        });
        await appendAudit(tx, {
          tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: creatorId,
          action: 'staff.invited',
          subjectType: 'staff_invitation',
          subjectId: created.id,
          metadata: { role: input.role },
        });
        return created;
      });

      return { invitationId: invitation.id, expiresAt };
    },

    async acceptInvitation(input: AcceptInvitationDto): Promise<void> {
      const passwordHash = await hashPassword(input.password);
      const row = await db.staffInvitation.findUnique({ where: { tokenHash: hashToken(input.token) } });
      if (!row) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'This invitation link is not valid.');
      }
      if (row.consumedAt) {
        throw new ApiError(409, 'TOKEN_ALREADY_USED', 'This invitation link was already used.');
      }
      if (row.expiresAt.getTime() <= deps.now().getTime()) {
        throw new ApiError(401, 'TOKEN_EXPIRED', 'This invitation link has expired.');
      }

      await db.$transaction(async (tx) => {
        const consumed = await tx.staffInvitation.updateMany({
          where: { id: row.id, consumedAt: null },
          data: { consumedAt: deps.now() },
        });
        if (consumed.count !== 1) {
          throw new ApiError(409, 'TOKEN_ALREADY_USED', 'This invitation link was already used.');
        }
        const existing = await tx.staffAccount.findUnique({
          where: { tenantId_emailNormalized: { tenantId: row.tenantId, emailNormalized: row.emailNormalized } },
        });
        if (existing) {
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'An account with this email already exists.');
        }
        const account = await tx.staffAccount.create({
          data: {
            tenantId: row.tenantId,
            emailNormalized: row.emailNormalized,
            passwordHash,
            role: row.role,
            status: 'ACTIVE',
            emailVerifiedAt: deps.now(),
          },
        });
        const profile = row.caregiverProfileJson as { name?: string; professionalCategory?: string } | null;
        if (row.role === 'CAREGIVER' && profile?.name && profile.professionalCategory) {
          await tx.caregiver.create({
            data: {
              tenantId: row.tenantId,
              staffAccountId: account.id,
              name: profile.name,
              professionalCategory: profile.professionalCategory,
              operationalStatus: 'INACTIVE',
            },
          });
        }
        await appendAudit(tx, {
          tenantId: row.tenantId,
          actorType: 'AGENCY_STAFF',
          actorId: account.id,
          action: 'staff.invitation_accepted',
          subjectType: 'staff_account',
          subjectId: account.id,
          metadata: { role: row.role },
        });
      });
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;

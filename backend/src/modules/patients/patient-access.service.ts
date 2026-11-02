import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { ApiError } from '../../api-error';
import { GrantSchema, PeopleEvents } from '../../contracts/people';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { customerAction } from '../common/customer-action';
import { hasPatientGrant, patientSummary } from './patient.repository';
import { recordChange as patientChanged } from '../common/record-change';
import { appendAudit } from '../../db/audit';

export function createPatientAccessService(db: DatabaseClient, now: () => Date) {
  return {
    lookupCustomer: (auth: AuthState, email: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.grants');
        const customer = await tx.customerAccount.findFirst({
          where: {
            tenantId,
            emailNormalized: email,
            status: 'ACTIVE',
            emailVerifiedAt: { not: null },
          },
          select: { id: true },
        });
        if (!customer) throw missing();
        return customer;
      }),
    issue: (auth: AuthState, patientId: string, input: z.infer<typeof GrantSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.grants');
        const patient = await tx.patient.findFirst({
          where: { tenantId, id: patientId, status: 'ACTIVE' },
        });
        const customer = await tx.customerAccount.findFirst({
          where: {
            tenantId,
            id: input.customerAccountId,
            status: 'ACTIVE',
            emailVerifiedAt: { not: null },
          },
        });
        if (!patient || !customer) throw missing();
        if (
          input.evidenceDocumentId &&
          !(await tx.document.findFirst({
            where: {
              tenantId,
              id: input.evidenceDocumentId,
              parentType: 'PATIENT',
              parentId: patientId,
              classification: 'AUTHORIZATION_EVIDENCE',
              scanStatus: 'CLEAN',
              archivedAt: null,
            },
            select: { id: true },
          }))
        )
          throw missing();
        if (input.expiresAt && new Date(input.expiresAt) <= now())
          throw new ApiError(422, 'VALIDATION_FAILED', 'Choose a future expiry.');
        const existing = await tx.patientAccess.findFirst({
          where: {
            tenantId,
            patientId,
            customerAccountId: customer.id,
            status: 'ACTIVE',
            revokedAt: null,
          },
        });
        if (existing)
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Revoke the existing grant before issuing another.',
          );
        const grant = await tx.patientAccess.create({
          data: {
            tenantId,
            patientId,
            customerAccountId: customer.id,
            scopes: input.scopes,
            authorizationType: input.authorizationType,
            verifiedByStaffId: auth.session.principalId,
            verifiedAt: now(),
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            evidenceDocumentId: input.evidenceDocumentId ?? null,
          },
        });
        await patientChanged(
          tx,
          auth,
          tenantId,
          grant.id,
          PeopleEvents.GRANT_ISSUED,
          'patient_access',
        );
        return grant;
      }),
    list: (auth: AuthState, patientId: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.grants');
        if (
          !(await tx.patient.findFirst({
            where: { tenantId, id: patientId },
            select: { id: true },
          }))
        )
          throw missing();
        const rows = await tx.patientAccess.findMany({
          where: { tenantId, patientId },
          take: 100,
          orderBy: { verifiedAt: 'desc' },
        });
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { timezone: true },
        });
        return {
          timezone: tenant.timezone,
          items: rows.map((row) => ({
            ...row,
            effectiveStatus: row.revokedAt
              ? 'REVOKED'
              : row.expiresAt && row.expiresAt <= now()
                ? 'EXPIRED'
                : row.status,
          })),
        };
      }),
    revoke: (auth: AuthState, id: string, reason: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'patients.grants');
        const row = await tx.patientAccess.findFirst({ where: { tenantId, id } });
        if (!row) throw missing();
        if (!row.revokedAt) {
          await tx.patientAccess.update({
            where: { id, tenantId },
            data: { status: 'REVOKED', revokedAt: now() },
          });
          await patientChanged(
            tx,
            auth,
            tenantId,
            id,
            PeopleEvents.GRANT_REVOKED,
            'patient_access',
          );
          // Reason is the operational revocation justification, never relationship/clinical data.
          await appendAudit(tx, {
            tenantId,
            actorType: 'AGENCY_STAFF',
            actorId: auth.session.principalId,
            action: 'patient_access.revocation_reason',
            subjectType: 'patient_access',
            subjectId: id,
            reason,
          });
        }
        return { id, status: 'REVOKED' };
      }),
    portal: (auth: AuthState, patientId?: string, cursor?: string) =>
      db.$transaction(async (tx) => {
        const customer = await customerAction(tx, auth, 'patients.granted_read', now);
        if (
          patientId &&
          !(await hasPatientGrant(tx, customer.tenantId, customer.id, patientId, 'VIEW_BASIC', now))
        )
          throw missing();
        const rows = await tx.patient.findMany({
          where: {
            tenantId: customer.tenantId,
            ...(patientId ? { id: patientId } : cursor ? { id: { gt: cursor } } : {}),
            grants: {
              some: {
                tenantId: customer.tenantId,
                customerAccountId: customer.id,
                scopes: { has: 'VIEW_BASIC' },
                status: 'ACTIVE',
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
              },
            },
          },
          select: patientSummary,
          orderBy: { id: 'asc' },
          take: 21,
        });
        if (patientId) {
          if (!rows[0]) throw missing();
          return rows[0];
        }
        return { items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19]!.id : null };
      }),
  };
}

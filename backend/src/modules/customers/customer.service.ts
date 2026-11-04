import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import { RegisterCustomerSchema, PeopleEvents } from '../../contracts/people';
import { generateToken, hashPassword, hashToken } from '../auth/crypto';
import type { AuthState } from '../auth/guards';
import { customerAction } from '../common/customer-action';
import { lockActiveTenant, missing } from '../common/agency-action';
import { sealSecret } from '../requesting/secrets';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';

export function createCustomerService(db: DatabaseClient, now: () => Date, encryptionKey?: string) {
  async function issue(
    tx: Prisma.TransactionClient,
    tenantId: string,
    customerId: string,
    email: string,
    locale: string,
    requestId?: string,
  ) {
    if (!encryptionKey)
      throw new ApiError(503, 'INTERNAL_ERROR', 'Verification temporarily unavailable.');
    const secret = generateToken();
    const row = await tx.customerCapability.create({
      data: {
        tenantId,
        customerId,
        requestId: requestId ?? null,
        purpose: requestId ? 'CLAIM_REQUEST' : 'VERIFY_EMAIL',
        tokenHash: secret.tokenHash,
        emailHash: hashToken(email),
        locale,
        expiresAt: new Date(now().getTime() + 15 * 60_000),
        createdAt: now(),
      },
    });
    await tx.customerCapability.update({
      where: { id: row.id },
      data: {
        encryptedSecret: sealSecret(secret.token, encryptionKey, `${tenantId}:${row.id}`),
      },
    });
    await enqueueOutbox(tx, {
      tenantId,
      eventType: requestId ? PeopleEvents.CLAIM_EMAIL : PeopleEvents.VERIFICATION_EMAIL,
      aggregateId: row.id,
      payloadMinimal: {},
    });
  }
  async function tokenRow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    token: string,
    purpose: string,
  ) {
    const row = await tx.customerCapability.findFirst({
      where: { tenantId, tokenHash: hashToken(token), purpose },
    });
    if (!row) throw new ApiError(401, 'UNAUTHENTICATED', 'Verification required.');
    if (row.consumedAt) throw new ApiError(409, 'TOKEN_ALREADY_USED', 'Link already used.');
    if (row.expiresAt <= now()) throw new ApiError(401, 'TOKEN_EXPIRED', 'Link expired.');
    return row;
  }
  async function consume(tx: Prisma.TransactionClient, id: string, tenantId: string) {
    const count = await tx.customerCapability.updateMany({
      where: { id, tenantId, consumedAt: null, expiresAt: { gt: now() } },
      data: { consumedAt: now(), encryptedSecret: null },
    });
    if (count.count !== 1)
      throw new ApiError(409, 'TOKEN_ALREADY_USED', 'Verification unavailable.');
  }
  async function changed(
    tx: Prisma.TransactionClient,
    tenantId: string,
    customerId: string,
    subjectId: string,
    action: string,
  ) {
    await appendAudit(tx, {
      tenantId,
      actorType: 'AGENCY_CUSTOMER',
      actorId: customerId,
      action,
      subjectType: action === PeopleEvents.CLAIMED ? 'service_request' : 'customer_account',
      subjectId,
    });
    await enqueueOutbox(tx, {
      tenantId,
      eventType: action,
      aggregateId: subjectId,
      payloadMinimal: {},
    });
  }
  return {
    resend: (tenantId: string, email: string, locale: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const customer = await tx.customerAccount.findFirst({
          where: { tenantId, emailNormalized: email, status: 'PENDING_VERIFICATION' },
        });
        if (!customer) return;
        const count = await tx.customerCapability.count({
          where: {
            tenantId,
            customerId: customer.id,
            purpose: 'VERIFY_EMAIL',
            createdAt: { gt: new Date(now().getTime() - 3600_000) },
          },
        });
        if (count >= 4) return;
        await issue(tx, tenantId, customer.id, email, locale);
      }),
    async register(tenantId: string, input: z.infer<typeof RegisterCustomerSchema>) {
      const passwordHash = await hashPassword(input.password);
      await db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const existing = await tx.customerAccount.findFirst({
          where: { tenantId, emailNormalized: input.email },
        });
        if (existing) return;
        const customer = await tx.customerAccount.create({
          data: { tenantId, emailNormalized: input.email, passwordHash, notificationLocale: input.locale },
        });
        await issue(tx, tenantId, customer.id, input.email, input.locale);
        await appendAudit(tx, {
          tenantId,
          action: 'customer.registered',
          subjectType: 'customer_account',
          subjectId: customer.id,
        });
      });
    },
    verify: (tenantId: string, token: string) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const row = await tokenRow(tx, tenantId, token, 'VERIFY_EMAIL');
        const customer = await tx.customerAccount.findFirst({
          where: { tenantId, id: row.customerId, status: 'PENDING_VERIFICATION' },
        });
        if (!customer || hashToken(customer.emailNormalized) !== row.emailHash) throw missing();
        await consume(tx, row.id, tenantId);
        await tx.customerCapability.updateMany({
          where: { tenantId, customerId: customer.id, purpose: 'VERIFY_EMAIL', consumedAt: null },
          data: { consumedAt: now(), encryptedSecret: null },
        });
        await tx.customerAccount.update({
          where: { id: customer.id, tenantId },
          data: { status: 'ACTIVE', emailVerifiedAt: now() },
        });
        await changed(tx, tenantId, customer.id, customer.id, PeopleEvents.VERIFIED);
      }),
    claimLink: (auth: AuthState, reference: string, locale: string) =>
      db.$transaction(async (tx) => {
        const customer = await customerAction(tx, auth, 'customers.claim', now);
        const tenantId = customer.tenantId;
        const request = await tx.serviceRequest.findFirst({
          where: {
            tenantId,
            reference,
            requesterEmailNormalized: customer.emailNormalized,
            customerAccountId: null,
          },
        });
        if (!request) return;
        const count = await tx.customerCapability.count({
          where: {
            tenantId,
            customerId: customer.id,
            createdAt: { gt: new Date(now().getTime() - 3600_000) },
            purpose: 'CLAIM_REQUEST',
          },
        });
        if (count >= 4) return;
        await issue(
          tx,
          tenantId,
          customer.id,
          request.requesterEmailNormalized,
          locale,
          request.id,
        );
      }),
    claim: (auth: AuthState, requestId: string, token: string) =>
      db.$transaction(async (tx) => {
        const customer = await customerAction(tx, auth, 'customers.claim', now);
        const tenantId = customer.tenantId;
        const row = await tokenRow(tx, tenantId, token, 'CLAIM_REQUEST');
        if (row.customerId !== customer.id || row.requestId !== requestId) throw missing();
        const request = await tx.serviceRequest.findFirst({ where: { tenantId, id: requestId } });
        if (
          !request ||
          row.emailHash !== hashToken(request.requesterEmailNormalized) ||
          row.emailHash !== hashToken(customer.emailNormalized)
        )
          throw missing();
        if (request.customerAccountId && request.customerAccountId !== customer.id)
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'Request cannot be claimed.');
        await consume(tx, row.id, tenantId);
        if (!request.customerAccountId) {
          await tx.serviceRequest.update({
            where: { tenantId_id: { tenantId, id: requestId } },
            data: { customerAccountId: customer.id, version: { increment: 1 } },
          });
          await changed(tx, tenantId, customer.id, requestId, PeopleEvents.CLAIMED);
        }
        return { id: requestId };
      }),
  };
}

import type { DatabaseClient } from '../../db/client';
import { openSecret } from '../requesting/secrets';
import { hashToken } from '../auth/crypto';
import { RequestEvents } from '../../contracts/events';

export interface RequestEmail {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}
export type EmailSender = (email: RequestEmail) => Promise<void>;

/** Durable lease + bounded retry. Sender must honor the stable event key. */
export async function deliverRequestEmail(deps: {
  db: DatabaseClient;
  eventId: string;
  encryptionKey: string;
  now(): Date;
  buildLink(slug: string, locale: string, token: string): string;
  send: EmailSender;
}) {
  const { db, eventId } = deps;
  const work = await db.$transaction(async (tx) => {
    const event = await tx.outboxEvent.findFirst({
      where: { id: eventId, eventType: RequestEvents.ACCESS_EMAIL, processedAt: null },
    });
    if (!event?.tenantId) return null;
    const tenant = await tx.tenant.findFirst({
      where: { id: event.tenantId, status: 'ACTIVE' },
      select: { slug: true },
    });
    if (!tenant) return null;
    await tx.emailDelivery.updateMany({
      where: {
        eventId,
        tenantId: event.tenantId,
        status: 'SENDING',
        attempts: { gte: 5 },
        leaseUntil: { lt: deps.now() },
      },
      data: { status: 'FAILED', leaseUntil: null, lastErrorCode: 'LEASE_EXHAUSTED' },
    });
    await tx.emailDelivery.upsert({
      where: { eventId },
      create: { eventId, tenantId: event.tenantId },
      update: {},
    });
    const claimed = await tx.emailDelivery.updateMany({
      where: {
        eventId,
        tenantId: event.tenantId,
        status: { in: ['PENDING', 'SENDING'] },
        attempts: { lt: 5 },
        retryAt: { lte: deps.now() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: deps.now() } }],
      },
      data: {
        status: 'SENDING',
        leaseUntil: new Date(deps.now().getTime() + 120_000),
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    const token = await tx.guestActionToken.findFirst({
      where: { id: event.aggregateId, tenantId: event.tenantId, purpose: 'REQUEST_STATUS' },
      include: { request: { select: { requesterEmailNormalized: true, locale: true } } },
    });
    if (
      !token ||
      token.consumedAt ||
      token.expiresAt <= deps.now() ||
      !token.encryptedSecret ||
      token.emailHash !== hashToken(token.request.requesterEmailNormalized)
    ) {
      await tx.emailDelivery.update({
        where: { eventId },
        data: { status: 'EXPIRED', leaseUntil: null },
      });
      await tx.outboxEvent.update({ where: { id: eventId }, data: { processedAt: deps.now() } });
      return null;
    }
    return { tenantId: event.tenantId, slug: tenant.slug, token };
  });
  if (!work) return;
  try {
    // Fresh state/recipient check immediately before the external delivery.
    const current = await db.guestActionToken.findFirst({
      where: {
        id: work.token.id,
        tenantId: work.tenantId,
        consumedAt: null,
        expiresAt: { gt: deps.now() },
        request: {
          requesterEmailNormalized: work.token.request.requesterEmailNormalized,
          service: { tenant: { status: 'ACTIVE' } },
        },
      },
    });
    if (!current) {
      await db.emailDelivery.update({
        where: { eventId },
        data: {
          status: 'PENDING',
          leaseUntil: null,
          retryAt: new Date(deps.now().getTime() + 60_000),
        },
      });
      return;
    }
    const secret = openSecret(
      work.token.encryptedSecret!,
      deps.encryptionKey,
      `${work.tenantId}:${work.token.id}`,
    );
    const ar = work.token.request.locale === 'ar';
    const link = deps.buildLink(work.slug, ar ? 'ar' : 'en', secret);
    await deps.send({
      to: work.token.request.requesterEmailNormalized,
      idempotencyKey: eventId,
      subject: ar ? 'تأكيد الوصول إلى طلبك' : 'Verify access to your request',
      text: ar
        ? `تم استلام طلبك. لم يتم تأكيد أي موعد. للتحقق والوصول الآمن خلال 15 دقيقة:\n${link}`
        : `Your request was received. No appointment is confirmed. Verify secure access within 15 minutes:\n${link}`,
    });
    await db.$transaction(async (tx) => {
      await tx.emailDelivery.update({
        where: { eventId },
        data: { status: 'SENT', leaseUntil: null, lastErrorCode: null },
      });
      await tx.outboxEvent.update({ where: { id: eventId }, data: { processedAt: deps.now() } });
      await tx.guestActionToken.updateMany({
        where: { id: work.token.id, tenantId: work.tenantId },
        data: { encryptedSecret: null },
      });
    });
  } catch {
    const delivery = await db.emailDelivery.findUniqueOrThrow({ where: { eventId } });
    await db.emailDelivery.update({
      where: { eventId },
      data: {
        status: delivery.attempts >= 5 ? 'FAILED' : 'PENDING',
        lastErrorCode: 'DELIVERY_FAILED',
        leaseUntil: null,
        retryAt: new Date(deps.now().getTime() + 1000 * 2 ** delivery.attempts),
      },
    });
  }
}

export function resendSender(apiKey: string, from: string): EmailSender {
  return async (email) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': email.idempotencyKey,
      },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('DELIVERY_FAILED');
  };
}

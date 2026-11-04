import '../env-load';
import http from 'node:http';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { getPrisma, disconnectPrisma } from '../db/client';
import { deliverRequestEmail, resendSender } from '../modules/notifications/request-email';
import { enqueueRequestEmail } from '../modules/notifications/request-email-queue';
import { RequestEvents } from '../contracts/events';
import { PeopleEvents } from '../contracts/people';
import { createLogger, parseLogLevel } from '../logger';
import { loadWorkerEnv } from './env';
import { QUEUES } from './queues';
import { workerHealthHandler } from './health';
import { startNotifications } from './notifications';

const env = loadWorkerEnv();
const logger = createLogger({ service: 'worker', level: parseLogLevel(env.LOG_LEVEL) });

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.warn('redis connection error', { err: String(error) });
});

const queue = new Queue(QUEUES.REQUEST_EMAIL, { connection });
const emailConfigured = !!(
  env.EMAIL_API_KEY &&
  env.EMAIL_FROM &&
  env.SESSION_SECRET &&
  env.BASE_DOMAIN
);
const emailWorker = emailConfigured
  ? new Worker<{ eventId: string }>(
      QUEUES.REQUEST_EMAIL,
      async (job) => {
        await deliverRequestEmail({
          db: getPrisma(),
          eventId: job.data.eventId,
          encryptionKey: env.SESSION_SECRET!,
          now: () => new Date(),
          buildLink: (slug, locale, token, context) =>
            `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${slug}.${env.BASE_DOMAIN}${env.PORTAL_PORT ? `:${env.PORTAL_PORT}` : env.NODE_ENV === 'production' ? '' : ':3000'}/${locale}/${context ? 'account' : 'track'}#token=${token}${context ? `&purpose=${context.purpose}${context.requestId ? `&request=${context.requestId}` : ''}` : ''}`,
          send: resendSender(env.EMAIL_API_KEY!, env.EMAIL_FROM!),
        });
      },
      { connection },
    )
  : null;
emailWorker?.on('error', () => logger.error('email worker unavailable', { code: 'WORKER_ERROR' }));
let polling = false;
const poller = emailConfigured
  ? setInterval(() => {
      void (async () => {
        if (polling) return;
        polling = true;
        try {
          await getPrisma().emailDelivery.updateMany({
            where: { status: 'SENDING', attempts: { gte: 5 }, leaseUntil: { lt: new Date() } },
            data: { status: 'FAILED', leaseUntil: null, lastErrorCode: 'LEASE_EXHAUSTED' },
          });
          const events = await getPrisma().$queryRaw<Array<{ id: string }>>`
      SELECT e.id FROM outbox_events e JOIN tenants t ON t.id = e.tenant_id
      LEFT JOIN email_deliveries d ON d.event_id = e.id
          WHERE e.event_type IN (${RequestEvents.ACCESS_EMAIL}, ${PeopleEvents.VERIFICATION_EMAIL}, ${PeopleEvents.CLAIM_EMAIL}) AND e.processed_at IS NULL AND t.status = 'ACTIVE'
      AND (d.id IS NULL OR (d.status IN ('PENDING','SENDING') AND d.attempts < 5
        AND d.retry_at <= CURRENT_TIMESTAMP AND (d.lease_until IS NULL OR d.lease_until < CURRENT_TIMESTAMP)))
      ORDER BY e.created_at ASC LIMIT 100`;
          for (const event of events) await enqueueRequestEmail(queue, event.id);
        } catch {
          logger.warn('email dispatch unavailable', { code: 'DISPATCH_FAILED' });
        } finally {
          polling = false;
        }
      })();
    }, 5000)
  : null;
if (!emailConfigured)
  logger.warn('request email delivery is not configured', { code: 'EMAIL_NOT_CONFIGURED' });

const notifications = startNotifications({ db: getPrisma(), connection, now: () => new Date(),
  onError: () => logger.warn('notification dispatch unavailable', { code: 'NOTIFICATION_DISPATCH_FAILED' }),
  ...(emailConfigured ? { send: resendSender(env.EMAIL_API_KEY!, env.EMAIL_FROM!) } : {}),
});
// Session 3 registers business renderers. Unsupported/legacy event kinds retain
// their existing ownership; absent renderers leave email deliveries pending.

const healthServer = http.createServer((req, res) => {
  void workerHealthHandler({
    ping: () => connection.ping(),
    now: () => new Date(),
  })(req, res);
});

healthServer.listen(env.WORKER_HEALTH_PORT, () => {
  logger.info('worker started', {
    queue: QUEUES.REQUEST_EMAIL,
    healthPort: env.WORKER_HEALTH_PORT,
    nodeEnv: env.NODE_ENV,
  });
});

async function shutdown(signal: NodeJS.Signals) {
  logger.info('worker shutting down', { signal });
  healthServer.close();
  if (poller) clearInterval(poller);
  await notifications.close();
  await emailWorker?.close();
  await disconnectPrisma();
  await queue.close().catch((error: unknown) => {
    logger.warn('queue close failed', { err: String(error) });
  });
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

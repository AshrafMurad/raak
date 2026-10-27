import '../env-load';
import http from 'node:http';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { createLogger, parseLogLevel } from '../logger';
import { loadWorkerEnv } from './env';
import { QUEUES } from './queues';
import { workerHealthHandler } from './health';

const env = loadWorkerEnv();
const logger = createLogger({ service: 'worker', level: parseLogLevel(env.LOG_LEVEL) });

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (error) => {
  logger.warn('redis connection error', { err: String(error) });
});

const queue = new Queue(QUEUES.OUTBOX_DISPATCH, { connection });

/**
 * Sprint 0 stub processor: proves the pipeline end to end (Redis + BullMQ +
 * health + graceful shutdown). Real outbox dispatch (docs 08 delivery
 * pipeline) is implemented in the notifications sprint — no business
 * processing, no email, no external calls here.
 */
// No consumer is registered until dispatch is implemented. This prevents a
// stub from acknowledging and silently discarding future business jobs.

const healthServer = http.createServer((req, res) => {
  void workerHealthHandler({
    ping: () => connection.ping(),
    now: () => new Date(),
  })(req, res);
});

healthServer.listen(env.WORKER_HEALTH_PORT, () => {
  logger.info('worker started', {
    queue: QUEUES.OUTBOX_DISPATCH,
    healthPort: env.WORKER_HEALTH_PORT,
    nodeEnv: env.NODE_ENV,
  });
});

async function shutdown(signal: NodeJS.Signals) {
  logger.info('worker shutting down', { signal });
  healthServer.close();
  await queue.close().catch((error: unknown) => {
    logger.warn('queue close failed', { err: String(error) });
  });
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

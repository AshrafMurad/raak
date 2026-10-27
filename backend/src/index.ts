import './env-load';
import { loadApiEnv } from './config/env';
import { disconnectPrisma, getPrisma, type DatabaseClient } from './db/client';
import { createLogger, parseLogLevel } from './logger';
import { buildApp } from './server';
import { createHealthService } from './modules/health/service';

const env = loadApiEnv();
const logger = createLogger({ service: 'api', level: parseLogLevel(env.LOG_LEVEL) });

// Boot resiliently: without DATABASE_URL the API still serves liveness while
// readiness reports db DOWN (docs 08 failure behaviour).
let prisma: DatabaseClient | undefined;
if (env.DATABASE_URL) {
  prisma = getPrisma();
}

const app = buildApp({
  env,
  logger,
  health: createHealthService({ prisma }),
  now: () => new Date(),
  ...(prisma ? { db: prisma } : {}),
});

const server = app.listen(env.API_PORT, () => {
  logger.info('api listening', { port: env.API_PORT, nodeEnv: env.NODE_ENV });
});

async function shutdown(signal: NodeJS.Signals) {
  logger.info('api shutting down', { signal });
  server.close();
  await disconnectPrisma().catch((error: unknown) => {
    logger.warn('prisma disconnect failed during shutdown', { err: String(error) });
  });
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

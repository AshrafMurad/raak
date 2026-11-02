import './env-load';
import { loadApiEnv } from './config/env';
import { disconnectPrisma, getPrisma, type DatabaseClient } from './db/client';
import { createLogger, parseLogLevel } from './logger';
import { buildApp } from './server';
import { createHealthService } from './modules/health/service';
import { createS3Storage } from './modules/documents/s3-storage';
import { createClamAvScanner } from './modules/documents/clamav';

const env = loadApiEnv();
const logger = createLogger({ service: 'api', level: parseLogLevel(env.LOG_LEVEL) });
if (
  env.NODE_ENV === 'production' &&
  env.OBJECT_STORAGE_ENDPOINT &&
  !env.OBJECT_STORAGE_ENDPOINT.startsWith('https://')
)
  throw new Error('Private object storage requires TLS in production');
const storageCandidate =
  env.OBJECT_STORAGE_ENDPOINT &&
  env.OBJECT_STORAGE_BUCKET &&
  env.OBJECT_STORAGE_ACCESS_KEY &&
  env.OBJECT_STORAGE_SECRET_KEY
    ? createS3Storage({
        endpoint: env.OBJECT_STORAGE_ENDPOINT,
        bucket: env.OBJECT_STORAGE_BUCKET,
        accessKey: env.OBJECT_STORAGE_ACCESS_KEY,
        secretKey: env.OBJECT_STORAGE_SECRET_KEY,
        region: env.OBJECT_STORAGE_REGION,
      })
    : undefined;
let privateStorage: typeof storageCandidate;
if (storageCandidate) {
  try {
    await storageCandidate.verifyPrivacy();
    privateStorage = storageCandidate;
  } catch {
    logger.warn('private storage remains disabled', { code: 'STORAGE_PRIVACY_CHECK_FAILED' });
  }
}

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
  ...(privateStorage ? { privateStorage } : {}),
  ...(env.CLAMAV_HOST
    ? { malwareScanner: createClamAvScanner(env.CLAMAV_HOST, env.CLAMAV_PORT) }
    : {}),
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

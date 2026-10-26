import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { loadDbEnv } from './env';

export type DatabaseClient = PrismaClient;

let cached: PrismaClient | undefined;

/**
 * Lazily created process-wide Prisma client (driver adapter, ADR-0001).
 * Lazy so the API process can boot for liveness even without DATABASE_URL.
 */
export function getPrisma(): DatabaseClient {
  if (!cached) {
    const env = loadDbEnv();
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    cached = new PrismaClient({ adapter });
  }
  return cached;
}

export async function disconnectPrisma(): Promise<void> {
  if (cached) {
    await cached.$disconnect();
    cached = undefined;
  }
}

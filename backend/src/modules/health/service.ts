import type { DatabaseClient } from '../../db/client';

export interface HealthService {
  /** True when the database answers a trivial query within the probe. */
  checkDatabase(): Promise<boolean>;
}

export function createHealthService(deps: { prisma?: DatabaseClient | undefined }): HealthService {
  return {
    async checkDatabase() {
      if (!deps.prisma) return false;
      try {
        await deps.prisma.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },
  };
}

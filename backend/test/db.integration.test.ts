/**
 * Integration: skipped only when DATABASE_URL is absent. Configured but
 * unreachable databases must fail, including in CI.
 * Also verifies the outbox append stub inside a transaction and rolls it back.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const hasDatabase = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDatabase)('database integration', () => {
  it('connects and serves a trivial query', async () => {
    const { getPrisma, disconnectPrisma } = await import('../src/db/client');
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<Array<{ one: number }>>`SELECT 1 AS one`;
    expect(rows[0]?.one).toBe(1);
    await disconnectPrisma();
  });

  it('tenant table exists after migration', async () => {
    const { getPrisma, disconnectPrisma } = await import('../src/db/client');
    const prisma = getPrisma();
    const count = await prisma.tenant.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await disconnectPrisma();
  });

  it('outbox append stub writes within a transaction (and rolls back cleanly)', async () => {
    const { getPrisma, disconnectPrisma } = await import('../src/db/client');
    const { enqueueOutbox } = await import('../src/db/outbox');
    const prisma = getPrisma();
    const aggregateId = randomUUID();
    const rollback = new Error('intentional test rollback');
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueOutbox(tx, {
          eventType: 'TEST_SYNTHETIC_EVENT',
          aggregateId,
          payloadMinimal: { synthetic: true },
        });
        // Prove the insert happened before rolling back; insert failures cannot
        // accidentally satisfy this test.
        expect(await tx.outboxEvent.count({ where: { aggregateId } })).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    const leftovers = await prisma.outboxEvent.count({
      where: { aggregateId },
    });
    expect(leftovers).toBe(0);
    await disconnectPrisma();
  });
});

/** Durable, fenced bulk execution. Callers lock the live tenant before this
 * row and commit each successful item with its checkpoint in one transaction. */
import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';

const BULK_LEASE_MS = 60_000;
export const BULK_RESULT_TTL_MS = 24 * 3_600_000;

interface BulkCheckpoint {
  state: 'IN_PROGRESS' | 'COMPLETED';
  checkpoint: Array<Record<string, unknown>>;
  leaseExpiresAt?: string;
  executionToken?: string;
}

/** Legacy completed summaries have no state field. */
function parseBulkCheckpoint(summary: Prisma.JsonValue): BulkCheckpoint {
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    const record = summary as Record<string, unknown>;
    if (record.state === 'IN_PROGRESS')
      return {
        state: 'IN_PROGRESS',
        checkpoint: Array.isArray(record.checkpoint)
          ? record.checkpoint.filter(
              (entry): entry is Record<string, unknown> =>
                !!entry && typeof entry === 'object' && !Array.isArray(entry),
            )
          : [],
        leaseExpiresAt:
          typeof record.leaseExpiresAt === 'string' ? record.leaseExpiresAt : undefined,
        executionToken:
          typeof record.executionToken === 'string' ? record.executionToken : undefined,
      };
  }
  return { state: 'COMPLETED', checkpoint: [] };
}

type BulkReservation =
  { mode: 'execute'; executionToken: string } | { mode: 'replay'; summary: Prisma.JsonValue };

export async function reserveBulkExecution(
  db: DatabaseClient,
  now: () => Date,
  tenantId: string,
  principalId: string,
  key: string,
  requestHash: string,
): Promise<BulkReservation> {
  const lease = () => new Date(now().getTime() + BULK_LEASE_MS).toISOString();
  const executionToken = randomUUID();
  try {
    await db.idempotencyKey.create({
      data: {
        tenantId,
        principalId,
        key,
        requestHash,
        responseSummary: {
          state: 'IN_PROGRESS',
          checkpoint: [],
          leaseExpiresAt: lease(),
          executionToken,
        },
        expiresAt: new Date(now().getTime() + BULK_RESULT_TTL_MS),
      },
    });
    return { mode: 'execute', executionToken };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
      throw error;
  }
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{ id: string; request_hash: string; response_summary: Prisma.JsonValue }>
    >`
      SELECT id, request_hash, response_summary FROM idempotency_keys
      WHERE tenant_id = ${tenantId}::uuid AND principal_id = ${principalId} AND key = ${key}
      FOR UPDATE`;
    const prior = locked[0];
    if (!prior)
      throw new ApiError(
        409,
        'IDEMPOTENCY_IN_PROGRESS',
        'A matching bulk request is reserving execution.',
      );
    if (prior.request_hash !== requestHash)
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key already used for another action.');
    const existing = parseBulkCheckpoint(prior.response_summary);
    if (existing.state === 'COMPLETED') return { mode: 'replay', summary: prior.response_summary };
    if (existing.leaseExpiresAt !== undefined && new Date(existing.leaseExpiresAt) > now())
      throw new ApiError(
        409,
        'IDEMPOTENCY_IN_PROGRESS',
        'A matching bulk request is still executing.',
      );
    await tx.idempotencyKey.update({
      where: { id: prior.id },
      data: {
        responseSummary: {
          state: 'IN_PROGRESS',
          checkpoint: existing.checkpoint,
          leaseExpiresAt: lease(),
          executionToken,
        } as Prisma.InputJsonValue,
      },
    });
    return { mode: 'execute', executionToken };
  });
}

/** Lock + token check fences all item commits and final writes from stale owners. */
export async function lockBulkExecution(
  tx: Prisma.TransactionClient,
  tenantId: string,
  principalId: string,
  key: string,
  executionToken: string,
) {
  const rows = await tx.$queryRaw<Array<{ response_summary: Prisma.JsonValue }>>`
    SELECT response_summary FROM idempotency_keys
    WHERE tenant_id = ${tenantId}::uuid AND principal_id = ${principalId} AND key = ${key}
    FOR UPDATE`;
  const state = rows[0] ? parseBulkCheckpoint(rows[0].response_summary) : null;
  if (!state || state.state !== 'IN_PROGRESS' || state.executionToken !== executionToken)
    throw new ApiError(
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      'Bulk execution ownership changed. Replay the request.',
    );
  return state.checkpoint;
}

/** Must be called within the same transaction after lockBulkExecution. */
export async function checkpointBulkResults(
  tx: Prisma.TransactionClient,
  now: () => Date,
  tenantId: string,
  principalId: string,
  key: string,
  executionToken: string,
  results: Array<Record<string, unknown>>,
) {
  await tx.idempotencyKey.update({
    where: { tenantId_principalId_key: { tenantId, principalId, key } },
    data: {
      responseSummary: {
        state: 'IN_PROGRESS',
        executionToken,
        checkpoint: results,
        leaseExpiresAt: new Date(now().getTime() + BULK_LEASE_MS).toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

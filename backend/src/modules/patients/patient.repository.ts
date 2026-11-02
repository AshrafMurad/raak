import type { z } from 'zod';
import type { Prisma } from '../../db/generated/prisma/client';
import type { PatientProfileSchema, PatientScopes } from '../../contracts/people';
import { ApiError } from '../../api-error';

export type PatientProfile = z.infer<typeof PatientProfileSchema>;
export const normalizedName = (name: string) =>
  name
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** Advisory cues only. No matching cue is a unique identity key. */
export async function duplicateCandidates(
  tx: Prisma.TransactionClient,
  tenantId: string,
  profile: PatientProfile,
  excludeId?: string,
) {
  const name = normalizedName(profile.displayName);
  const words = name.split(' ').filter((w) => w.length >= 3);
  const rows = await tx.patient.findMany({
    where: {
      tenantId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { normalizedName: name },
        ...(words.length >= 2
          ? [{ AND: words.map((word) => ({ normalizedName: { contains: word } })) }]
          : []),
        ...(profile.dateOfBirth ? [{ dateOfBirth: profile.dateOfBirth }] : []),
        ...(profile.contact
          ? [{ contact: { equals: profile.contact, mode: 'insensitive' as const } }]
          : []),
      ],
    },
    orderBy: { id: 'asc' },
    take: 101,
    select: { id: true, displayName: true, dateOfBirth: true, areaId: true, version: true },
  });
  if (rows.length > 100)
    throw new ApiError(
      409,
      'STATE_TRANSITION_INVALID',
      'Narrow the operational profile before duplicate review.',
    );
  return rows;
}
export async function hasPatientGrant(
  tx: Prisma.TransactionClient,
  tenantId: string,
  customerAccountId: string,
  patientId: string,
  scope: (typeof PatientScopes)[number],
  now: () => Date,
) {
  return !!(await tx.patientAccess.findFirst({
    where: {
      tenantId,
      customerAccountId,
      patientId,
      scopes: { has: scope },
      status: 'ACTIVE',
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }],
    },
    select: { id: true },
  }));
}
export const patientSummary = { id: true, displayName: true, status: true } as const;
export const patientOperationalProjection = {
  ...patientSummary,
  dateOfBirth: true,
  contact: true,
  areaId: true,
  addressRestricted: true,
  notesRestricted: true,
  version: true,
} as const;

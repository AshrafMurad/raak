/**
 * Synthetic dev/CI seed (docs 12 — test data requirements; docs README — synthetic only).
 * Two fictional agencies with overlapping human-like Arabic names so later tenant-isolation
 * tests cannot rely on global name uniqueness. NO real patient/PHI data in any environment.
 *
 * Identity fixtures (Sprint 1): one platform operator, staff/customer accounts per tenant,
 * and invitation samples. The same email intentionally exists in both tenants under
 * different roles (I05 — duplicate email across tenants is allowed, never a shared sign-in).
 *
 * Idempotent: safe to run repeatedly (`npm run seed`).
 */
import { createHash } from 'node:crypto';
import { getPrisma, disconnectPrisma } from '../src/db/client';
import { hashPassword } from '../src/modules/auth/crypto';

const TENANT_AFIYA_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ALNADWA_ID = '22222222-2222-4222-8222-222222222222';

/** Synthetic dev-only credentials; never real secrets. */
const PLATFORM_OPERATOR_EMAIL = 'operator@example.invalid';
const SHARED_EMAIL = 'shared.person@example.invalid';
const DEV_PASSWORD = 'Synthetic-Dev-Only-1!';

/** Stable sha-256 hex digests for the two synthetic invitation sample tokens. */
function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
const CONSUMED_INVITATION_TOKEN_HASH = sha256('synthetic-consumed-invitation-token');
const EXPIRED_INVITATION_TOKEN_HASH = sha256('synthetic-expired-invitation-token');

async function main() {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(DEV_PASSWORD);

  // --- Tenants (Sprint 0 fixtures, unchanged) ---
  await prisma.tenant.upsert({
    where: { slug: 'afiya' },
    update: {},
    create: {
      id: TENANT_AFIYA_ID,
      slug: 'afiya',
      legalName: 'Afiya Home Care (synthetic fixture)',
      displayName: 'عافية للرعاية المنزلية',
      status: 'ACTIVE',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      travelBufferMin: 30,
      supportEmail: 'support@afiya.example.invalid',
    },
  });

  await prisma.tenant.upsert({
    where: { slug: 'alnadwa' },
    update: {},
    create: {
      id: TENANT_ALNADWA_ID,
      slug: 'alnadwa',
      legalName: 'Al-Nadwa Care Services (synthetic fixture)',
      displayName: 'الندوة للرعاية المنزلية',
      status: 'PENDING_APPROVAL',
      timezone: 'Asia/Riyadh',
      currency: 'SAR',
      travelBufferMin: 30,
      supportEmail: 'support@alnadwa.example.invalid',
    },
  });

  // --- Platform operator (separate realm) ---
  await prisma.platformOperator.upsert({
    where: { emailNormalized: PLATFORM_OPERATOR_EMAIL },
    update: {},
    create: {
      emailNormalized: PLATFORM_OPERATOR_EMAIL,
      passwordHash,
      status: 'ACTIVE',
    },
  });

  const afiyaOwner = await prisma.staffAccount.upsert({
    where: { tenantId_emailNormalized: { tenantId: TENANT_AFIYA_ID, emailNormalized: 'owner.afiya@example.invalid' } },
    update: {},
    create: {
      tenantId: TENANT_AFIYA_ID,
      emailNormalized: 'owner.afiya@example.invalid',
      passwordHash,
      role: 'AGENCY_OWNER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-02T09:00:00Z'),
    },
  });

  await prisma.staffAccount.upsert({
    where: { tenantId_emailNormalized: { tenantId: TENANT_AFIYA_ID, emailNormalized: SHARED_EMAIL } },
    update: {},
    create: {
      tenantId: TENANT_AFIYA_ID,
      emailNormalized: SHARED_EMAIL,
      passwordHash,
      role: 'CARE_COORDINATOR',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-02T09:05:00Z'),
    },
  });

  await prisma.staffAccount.upsert({
    where: { tenantId_emailNormalized: { tenantId: TENANT_ALNADWA_ID, emailNormalized: SHARED_EMAIL } },
    update: {},
    create: {
      tenantId: TENANT_ALNADWA_ID,
      emailNormalized: SHARED_EMAIL,
      passwordHash,
      role: 'AGENCY_OWNER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-03T10:00:00Z'),
    },
  });

  await prisma.customerAccount.upsert({
    where: { tenantId_emailNormalized: { tenantId: TENANT_AFIYA_ID, emailNormalized: 'customer.afiya@example.invalid' } },
    update: {},
    create: {
      tenantId: TENANT_AFIYA_ID,
      emailNormalized: 'customer.afiya@example.invalid',
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-04T11:00:00Z'),
    },
  });

  // --- Invitation samples: one already consumed, one expired (I06 fixtures) ---
  await prisma.staffInvitation.upsert({
    where: { tokenHash: CONSUMED_INVITATION_TOKEN_HASH },
    update: {},
    create: {
      tenantId: TENANT_AFIYA_ID,
      emailNormalized: 'former.caregiver@example.invalid',
      role: 'CAREGIVER',
      caregiverProfileJson: { name: 'سلمى السابقة (synthetic)', professionalCategory: 'NURSE' },
      tokenHash: CONSUMED_INVITATION_TOKEN_HASH,
      expiresAt: new Date('2026-01-10T12:00:00Z'),
      consumedAt: new Date('2026-01-05T12:00:00Z'),
      createdByStaffId: afiyaOwner.id,
    },
  });

  await prisma.staffInvitation.upsert({
    where: { tokenHash: EXPIRED_INVITATION_TOKEN_HASH },
    update: {},
    create: {
      tenantId: TENANT_AFIYA_ID,
      emailNormalized: 'expired.invite@example.invalid',
      role: 'CARE_COORDINATOR',
      tokenHash: EXPIRED_INVITATION_TOKEN_HASH,
      expiresAt: new Date('2026-01-02T12:00:00Z'),
      createdByStaffId: afiyaOwner.id,
    },
  });

  const [tenants, operators, staff, customers, invitations] = await Promise.all([
    prisma.tenant.count(),
    prisma.platformOperator.count(),
    prisma.staffAccount.count(),
    prisma.customerAccount.count(),
    prisma.staffInvitation.count(),
  ]);
  process.stdout.write(
    `${JSON.stringify({
      msg: 'seed complete (synthetic only)',
      tenants,
      operators,
      staff,
      customers,
      invitations,
    })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ msg: 'seed failed', error: String(error) })}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectPrisma();
  });

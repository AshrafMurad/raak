/**
 * Synthetic dev/CI seed (docs 12 — test data requirements; docs README — synthetic only).
 * Two fictional agencies with overlapping human-like Arabic names so later tenant-isolation
 * tests cannot rely on global name uniqueness. NO real patient/PHI data in any environment.
 *
 * Idempotent: safe to run repeatedly (`npm run seed`).
 */
import { getPrisma, disconnectPrisma } from '../src/db/client';

const TENANT_AFIYA_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ALNADWA_ID = '22222222-2222-4222-8222-222222222222';

async function main() {
  const prisma = getPrisma();

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

  const count = await prisma.tenant.count();
  process.stdout.write(`${JSON.stringify({ msg: 'seed complete (synthetic only)', tenants: count })}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ msg: 'seed failed', error: String(error) })}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectPrisma();
  });

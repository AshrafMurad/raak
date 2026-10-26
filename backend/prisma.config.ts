import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));

// Load env deterministically: backend/.env wins over workspace root .env.
// dotenv never overrides variables already present in process.env.
dotenv.config({ path: path.resolve(here, '.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '../.env'), quiet: true });

const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL'];

// `env()` throws when absent, but `prisma generate` must work on fresh clones
// without any .env (it never connects). Fall back to the documented compose
// default; commands that need a real database fail loudly if it is unreachable.
const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://raak:raak-dev-only@localhost:5432/raak';
if (!process.env['DATABASE_URL']) {
  process.stderr.write(
    '[prisma.config] DATABASE_URL not set; using local compose default (fine for `generate`, not for real commands)\n',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});

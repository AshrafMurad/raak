import { build } from 'esbuild';

/** Bundle api + worker (incl. TS-source internal code and Prisma client) into dist/ (ADR-0002). */
const common = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  legalComments: 'none',
  banner: {
    js: "import { createRequire as __raakCreateRequire } from 'node:module'; const require = __raakCreateRequire(import.meta.url);",
  },
} as const;

const results = await Promise.all([
  build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' }),
  build({ ...common, entryPoints: ['src/worker/index.ts'], outfile: 'dist/worker.js' }),
]);

if (results.some((result) => result.errors.length > 0)) {
  process.exit(1);
}
process.stdout.write('backend build complete: dist/index.js, dist/worker.js\n');

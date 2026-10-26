# ADR-0002 — Internal TS-source packages; bundled builds for api/worker

Date: 2026-10-26
Status: Accepted
Context: Prisma 7's `prisma-client` generator emits TypeScript source into a project-local `output` directory; classic "compile each package to dist with tsc" would require compiling generated Prisma TS and risks ESM extension issues in emitted output.

## Decision

- Workspace packages (`@raak/contracts`, `@raak/logger`, `@raak/db`, `@raak/ui`) follow the **internal packages** pattern: `exports` point at TS source (`./src/index.ts`), no `dist`, no separate package build step.
- `apps/api` and `apps/worker`: run in dev via `tsx`; production build via **esbuild bundling** into `dist/`; `tsc --noEmit` provides typechecking.
- `apps/web` is compiled by Next/Turbopack, which consumes TS-source packages natively.
- Prisma client is generated to `packages/db/src/generated/prisma` (gitignored) by `prisma generate`, wired as a `postinstall`/`generate` script; bundlers consume the generated TS.

## Consequences

- One source of truth; no watch-build orchestration; fast cold start for new engineers.
- Consumers must be bundlers or TS-aware runners (`tsx`, Next, Vitest, esbuild) — never raw `node` against package sources.
- `@raak/ui` ships CSS (`tokens.css`) consumed via `exports` subpath.

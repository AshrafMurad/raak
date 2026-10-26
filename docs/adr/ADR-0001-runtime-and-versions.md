# ADR-0001 — Runtime and toolchain versions pinned at Sprint 0

Date: 2026-10-26
Status: Accepted
Context: `docs/08_ARCHITECTURE.md` requires versions pinned/validated at Sprint 0; docs do not mandate specific versions.

## Decision

| Component | Pinned | Rationale |
|---|---|---|
| Node.js | `^24.21.0` (24 LTS) via `engines` + `.nvmrc` | Active LTS line, installed toolchain version; docs require Node LTS pinned |
| Package manager | pnpm `12.15.0` via corepack `packageManager` | Workspace monorepo; corepack ships with Node |
| TypeScript | `~5.9.3` | typescript-eslint 8.x peer range is `<6.1`; TS 7 (native compiler) not yet supported by the lint toolchain. Revisit when typescript-eslint declares support |
| Module format | ESM everywhere (`"type": "module"`) | Required by Prisma 7; single format across packages |
| Next.js | `16.4.x` + React `19.3.x` | Current stable; App Router, Turbopack default, `proxy.ts` |
| Express | `5.3.x` | Current stable major; typed via `@types/express` 5 |
| Prisma | `7.10.x` + `@prisma/adapter-pg` | Current stable major (v8 still RC); Rust-free client, `prisma-client` generator, driver adapter, `prisma.config.ts` |
| Zod | `~4.6.7` | Contract validation |
| Queue | BullMQ `6.4.x` + ioredis `6.0.x` | Docs A01 |
| Tests | Vitest `4.1.x` (V4 line, not 5) | 5.x landed during planning; pin mature line for determinism |
| CSS | Tailwind `4.1.x` + PostCSS plugin | Docs A01; v4 `@theme` token wiring |
| Lint/format | ESLint `10.x` flat config, typescript-eslint `8.x`, Prettier `3.9.x` | `next lint` removed in Next 16; ESLint invoked directly |

Exact versions are locked by `pnpm-lock.yaml`; `package.json` uses `~`/pinned ranges.

## Consequences

- `.npmrc` sets `engine-strict=true` so mismatched runtimes fail fast.
- CI uses Node 24 + corepack; upgrades require an ADR amendment.

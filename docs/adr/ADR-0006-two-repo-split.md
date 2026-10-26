# ADR-0006 — Two-repo split: `backend/` (Node.js + Express) and `frontend/` (Next.js)

Date: 2026-10-26
Status: Superseded by ADR-0007 on 2026-10-27
Context: The spec pack suggests a single repository with `apps/*` and `packages/*`. The product owner
directed a simpler two-repository structure: a Node.js/Express backend and a separate frontend repo.

## Decision

- Workspace layout in `E:\projects\MERN stack\raak`:
  - `backend/` — self-contained Node.js project: Express API, BullMQ worker, Prisma schema/migrations/seed, docker-compose (postgres/redis/minio), CI, own `.env.example`. npm is the package manager (no workspace tooling needed for a single package).
  - `frontend/` — self-contained Next.js 16 project: app shell, ar/en routing, fonts, tokens, CI, own `.env.example`. npm as well.
  - Repo root keeps only the shared spec pack (`docs/`, `AGENTS.md`, `README.md`, `.editorconfig`). Each folder is an independent repository (`git init`, no commits made by the agent).
- **Backend owns the canonical contracts** (Zod schemas, enums, error registry) in `src/contracts/`; the frontend does not import backend code. The frontend keeps its own UI-side constants (locale set, direction map). Cross-repo type sharing, if needed later, happens via generated OpenAPI types (docs 07 already mandates OpenAPI in code) — to be ADR'd when introduced.
- Worker stays in the backend repo as a second process entry (`src/worker/index.ts`), matching docs 08 (separate worker process for async tasks).
- Everything else from ADR-0001 (version pins, Node 24, ESM, TypeScript 5.9) and ADR-0002 (TS-source internal imports are fine to bundle; api/worker built by esbuild) still applies, per repo.

## Consequences

- No pnpm workspaces; each repo has its own `package-lock.json`, lint/typecheck/test scripts, CI pipeline.
- Shared tokens (`packages/ui`) move into the frontend repo (`app/tokens.css`); shared contracts/logger/db code moves into the backend repo (`src/contracts`, `src/logger.ts`, `src/db`).
- Duplication risk for locale/status label constants is accepted in V1; mitigated by the OpenAPI/typegen ADR when cross-repo DTO sharing becomes necessary (Sprint 1+).
- Sprint 0 exit commands become per-repo: `npm run lint && npm run typecheck && npm run test && npm run build` in `backend/` and `frontend/`.

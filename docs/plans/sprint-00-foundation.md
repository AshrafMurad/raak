# Sprint 0 — Foundation (Implementation Plan)

Status: IMPLEMENTED AND LOCALLY VERIFIED — see `sprint-00-status.md` for evidence.
References: `docs/13_IMPLEMENTATION_PLAN.md` (Sprint 0 + Milestone 0), `AGENTS.md`

## 1. Exact scope (from the plan document)

Sprint 0 work order, verbatim deliverables:

1. **Workspace packages and lint/typecheck/test scripts**; use shared status enums and Zod schemas.
2. **Environment sample**: `DATABASE_URL`, `REDIS_URL`, `OBJECT_STORAGE_ENDPOINT`, `BUCKET`, `SESSION_SECRET`, `EMAIL_PROVIDER` credentials, `BASE_DOMAIN`, proxy trusted hosts. Never commit real secrets.
3. **Prisma schema migrations, DB seed synthetic fixture, outbox stub, worker stub, structured safe logger.**
4. **App shell with `ar`/`en` routing and IBM Plex fonts, palette**; visual placeholders clearly marked.

Milestone 0 gate adds: running skeleton, typed config, Docker Compose, health checks, CI, design tokens; decide runtime versions, web/API integration, tenant hostname scheme, auth cookie architecture.

**Exit criterion (updated by ADR-0007):** local Docker up, web/API/worker connect;
per-project `npm test`, lint, typecheck and build pass.

## 2. Explicitly out of scope (later sprints)

- Any authentication/authorization/session implementation (Sprint 1) — only the cookie architecture *decision* is recorded here.
- Declaration-only session/tenant boundary contracts are included in Sprint 0;
  no login, session persistence or authorization policy is implemented.
- Tenant host resolution logic (Sprint 1) — only `BASE_DOMAIN`/trusted-host env plumbing.
- Catalog, portals, requests, quotes, patients, plans, visits, notifications delivery, reports (Sprints 2–7).
- Real email sending (worker stub only), file uploads, E2E Playwright suite (Sprint 2+ journeys).
- Dockerfiles for apps / production deployment (Sprint 7); compose provides **dependencies only** (ADR-0003).

## 3. Decisions confirmed at Sprint 0

| Topic | Decision | Where |
|---|---|---|
| Repo structure | **One Git repository** (ADR-0007) containing self-contained `backend/` (Node.js + Express + Prisma + BullMQ worker) and `frontend/` (Next.js) npm projects plus shared docs | ADR-0007 |
| Runtime | Node.js 24 LTS (`^24.21.0`), pinned via `engines` + `.nvmrc` per project; npm (self-contained projects) | ADR-0001, ADR-0007 |
| Language | TypeScript 5.9 strict (TS 7 native compiler not yet supported by typescript-eslint) | ADR-0001 |
| Versions pinned | next 16.4.x, express 5.3, prisma 7.10 + `@prisma/adapter-pg`, zod 4.6, bullmq 6.4, ioredis 6, vitest 4.1, tailwind 4.1, eslint 10 + typescript-eslint 8 | ADR-0001 |
| Tenant hostname scheme (confirming docs 03/08) | Portal `<slug>.<BASE_DOMAIN>`; workspace `app.<BASE_DOMAIN>/w/:slug`; API `api.<BASE_DOMAIN>/v1`; server resolves tenant from trusted host/session only | this doc §6 |
| Auth cookie architecture (confirming docs 05/A02, implementing Sprint 1) | Opaque server-side session rows (`auth_sessions`), secret hashed at rest; cookie `HttpOnly`, `Secure`, `SameSite=Lax`, host-only per auth app; sessionVersion for revocation; CSRF token on mutations; guest one-time hashed tokens | this doc §6 |
| Compose | PostgreSQL 17 + Redis 8 + LocalStack S3 4.0.3 with healthchecks; apps run on host via npm scripts | ADR-0003 |
| Fonts | `@fontsource/ibm-plex-sans-arabic` + `@fontsource/ibm-plex-sans` (weights 400/500/600/700) — deterministic, offline/CI-safe | ADR-0004 |
| Locale routing | `app/[locale]` segment (`ar` default RTL, `en` LTR), Next 16 `proxy.ts` redirects `/` → `/ar`; typed hand-rolled dictionaries until real screens arrive | ADR-0005 |

## 4. Deliverables checklist (file map)

Per ADR-0007 (one Git repository with two self-contained npm projects):

```text
raak/                                   # Git repository root
  .github/workflows/                    backend-ci.yml, frontend-ci.yml
  docs/  AGENTS.md  README.md  .editorconfig  .gitignore
  docs/plans/sprint-00-foundation.md    (this file)
  docs/adr/ADR-0001..0007.md
  backend/                              # Node.js + Express project (npm)
    package.json  tsconfig.json  eslint.config.js  docker-compose.yml
    .env.example  .nvmrc  README.md
    prisma/       schema.prisma (tenants + outbox_events), prisma.config.ts, seed.ts (synthetic)
    src/
      contracts/   canonical enums, error schemas, health/pagination DTOs, server context interfaces
      db/          Prisma client singleton (adapter-pg), env schema, outbox append stub
      modules/health/  service (db probe) + controller (/v1/health/live, /v1/health/ready)
      worker/      BullMQ queue stub + HTTP health (redis readiness), graceful shutdown
      config/  logger.ts  server.ts  index.ts  env-load.ts
    scripts/build.ts                    (esbuild bundle: api + worker)
    test/          contracts, logger, env, health API (supertest), db integration
  frontend/                             # Next.js project (npm)
    package.json  tsconfig.json  eslint.config.js  next.config.ts  postcss.config.mjs
    .env.example  .nvmrc  README.md
    proxy.ts                            (redirect / -> /ar)
    app/[locale]/  layout.tsx (lang/dir, IBM Plex fonts), page.tsx (marked placeholder)
    app/globals.css  app/tokens.css     (locked brand tokens)
    app/health/    liveness + API-backed readiness route handlers
    messages/{ar,en}/common.json        (typed dictionaries + parity test)
    test/i18n.test.ts
    test/health.test.ts
```

## 5. Dependencies and constraints

- **Order:** root scaffold → contracts/logger/ui → db (schema+migration+seed) → api/worker (health) → web → CI/docs verification.
- **Constraints applied:**
  - TypeScript strict, no `any` escapes; Zod validation at boundaries (env, DTOs).
  - Synthetic seed only (two fictional agencies); no real PHI anywhere.
  - Locked palette/fonts (D22/D23); text wordmark only, no invented logo.
  - English canonical status codes; Arabic only in UI labels (A11).
  - No client-supplied tenant trust — health endpoints are tenant-free; tenant resolution arrives Sprint 1.
  - Logger redacts emails/tokens/notes by default (docs 08/09).
  - Outbox table exists now so later sprints write state change + event in one transaction (docs 08).

## 6. Acceptance criteria (exit gate)

1. `docker compose up -d --pull never` (in `backend/`, after owner-run pulls)
   starts PostgreSQL/Redis/LocalStack S3, all healthy.
2. `npm run migrate` + `npm run seed` (backend) apply the initial migration and insert 2 synthetic tenants.
3. API `GET /v1/health/live` → 200; `GET /v1/health/ready` → 200 with `db: "UP"` (503 when DB down); stable JSON envelope; `X-Request-ID` echoed.
4. Worker boots, connects to Redis, health endpoints live/ready; shutdown handlers
   are implemented. Native POSIX signal delivery is a deployment-stage check.
5. Frontend `/` redirects to `/ar` (RTL, IBM Plex Sans Arabic, brand tokens); `/en` renders LTR; placeholders visibly marked as Sprint 0 skeleton.
6. In **each** project: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass on Node 24.
7. Root CI workflows encode the same per-project pipelines; backend CI includes postgres/redis services.
8. Unit tests cover: contracts enums/schemas, error envelope, env config validation (positive+negative), logger redaction, dictionary ar/en parity, seed/loader sanity.

## 7. Risks / notes

- Prisma 7 is ESM + driver-adapter based; mitigated by ESM-everywhere and adapter singleton in `src/db` (ADR-0002).
- Vitest 5 appeared mid-planning; we pin the 4.1 line for determinism.
- TS 7 (native) deferred until typescript-eslint supports it (ADR-0001).
- The frontend/backend source boundary accepts some constant duplication; OpenAPI typegen ADR due when frontend needs DTO types (Sprint 1+).
- Dev-loop parity on Windows (PowerShell) verified manually; compose ports fixed to avoid surprises.

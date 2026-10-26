# Raak Backend

Express 5 + TypeScript strict REST API (`/v1`), BullMQ worker stub, Prisma 7 on PostgreSQL. See the workspace `docs/` spec pack; Sprint 0 scope only.

> All local data is synthetic. Never commit real secrets or patient data.

## Prereqs

- Node.js 24 (`.nvmrc`)
- Docker (postgres 17 / redis 8 / minio via compose)

## Setup

```bash
docker compose up -d
copy .env.example .env   # Windows: use `copy`; macOS/Linux: `cp`
npm install              # runs `prisma generate` via postinstall
npm run migrate          # apply committed migrations
npm run seed             # synthetic fixtures (2 fictional agencies)
```

## Develop

```bash
npm run dev              # API on http://localhost:3001
npm run dev:worker       # worker + health on http://localhost:8081
```

Health: `GET /v1/health/live` (process), `GET /v1/health/ready` (DB probe; 503 when down).

## Verify

```bash
npm run lint
npm run typecheck
npm run test
npm run build            # esbuild bundle -> dist/{index,worker}.js
```

## Layout

```text
prisma/            schema.prisma (tenants + outbox stub), migrations, synthetic seed
src/contracts/     canonical enums, error registry, Zod DTO schemas (shared API truth)
src/db/            Prisma client singleton (driver adapter), outbox append stub
src/modules/health  service + controller (liveness/readiness)
src/worker/        BullMQ stub + HTTP health, graceful shutdown
src/server.ts      app factory (request-id, error envelope, proxy trust)
test/              contracts, logger, env, API (supertest), DB integration
```

## Conventions

- Deny by default; tenant context is always server-resolved (Sprint 1+).
- Errors use the stable envelope `{ error: { code, message, requestId } }` from `src/contracts`.
- Domain modules follow `src/modules/<domain>/{controller,schema,service}` per `AGENTS.md`.

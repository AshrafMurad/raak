# Raak (رعاك)

Multi-tenant B2B SaaS for home-care agencies: requests, quotes, patients, caregivers, recurring care plans, and home visits in one tenant-isolated workspace. **All data in dev/demo/tests is synthetic.**

This Git repository contains the shared spec pack (`docs/`, `AGENTS.md`) and two self-contained application projects (see [ADR-0007](docs/adr/ADR-0007-single-repository.md)):

| Folder | Stack | Purpose |
|---|---|---|
| [`backend/`](backend/) | Node.js 24, Express 5, TypeScript strict, Prisma 7 (PostgreSQL), BullMQ worker | REST API `/v1`, migrations, synthetic seed, health checks |
| [`frontend/`](frontend/) | Next.js 16, TypeScript strict, Tailwind CSS 4 | Arabic-first (RTL) / English (LTR) web app shell |

Current status: **Sprint 0 — Foundation** (see the [Sprint 0 plan](docs/plans/sprint-00-foundation.md) and [implementation plan](docs/13_IMPLEMENTATION_PLAN.md)).

## Quickstart

```bash
# backend (terminal 1)
cd backend
docker compose up -d --pull never # PostgreSQL + Redis + LocalStack S3 (pull first)
npm install
npm run migrate
npm run seed
npm run dev              # api on :3001  — also: npm run dev:worker (health :8081)

# frontend (terminal 2)
cd frontend
npm install
npm run dev              # web on :3000, redirects / -> /ar
```

Verification (per repo): `npm run lint && npm run typecheck && npm run test && npm run build`

## Conventions

- One sprint at a time per `docs/13_IMPLEMENTATION_PLAN.md`; decisions D01–D23 are locked.
- Server-resolved tenant context only; deny by default; synthetic data only (see `AGENTS.md`).
- ADRs in `docs/adr/`; version pins in [ADR-0001](docs/adr/ADR-0001-runtime-and-versions.md); repo layout in [ADR-0007](docs/adr/ADR-0007-single-repository.md).
- Branching, commits, pull requests and releases follow [Git Standards](docs/GIT_STANDARDS.md).
- Large downloads (>~50 MB) are owner-run; agents provide exact commands.
- Verification evidence and pending gates: [Sprint 0 status](docs/plans/sprint-00-status.md).

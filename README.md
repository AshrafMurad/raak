# Raak (رعاك)

Multi-tenant B2B SaaS for home-care agencies: requests, quotes, patients, caregivers, recurring care plans, and home visits in one tenant-isolated workspace. **All data in dev/demo/tests is synthetic.**

This Git repository contains the shared spec pack (`docs/`, `AGENTS.md`) and two self-contained application projects (see [ADR-0007](docs/adr/ADR-0007-single-repository.md)):

| Folder | Stack | Purpose |
|---|---|---|
| [`backend/`](backend/) | Node.js 24, Express 5, TypeScript strict, Prisma 7 (PostgreSQL), BullMQ worker | REST API `/v1`, migrations, synthetic seed, health checks |
| [`frontend/`](frontend/) | Next.js 16, TypeScript strict, Tailwind CSS 4 | Arabic-first (RTL) / English (LTR) web app shell |

Current slice: **Sprint 4 — People and Access**. See the
[implementation plan](docs/plans/sprint-04-people-access.md),
[status and evidence](docs/plans/sprint-04-status.md),
[security/maintainability review](docs/plans/sprint-04-review.md), and
[local verification guide](docs/SPRINT_4_LOCAL_CHECK.md).

## Quickstart

For Sprint 4, start with the [local verification guide](docs/SPRINT_4_LOCAL_CHECK.md).
Its automated browser harness uses synthetic captured email and explicit file
test doubles; live email/storage/scanning verification remains a separate gate.
The [Sprint 3 guide](docs/SPRINT_3_LOCAL_CHECK.md) retains the interactive
coordinator/customer commercial demo.

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
- Verification evidence and pending gates: [Sprint 4 review](docs/plans/sprint-04-review.md).

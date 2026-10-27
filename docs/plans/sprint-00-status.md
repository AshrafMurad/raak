# Sprint 0 verification status

Status: **Sprint 0 foundation implemented and locally verified**.
This is a foundation milestone, not MVP or production readiness.

## Implemented

- Independent `backend/` and `frontend/` npm projects with separate lockfiles,
  versioned together in the root Git repository.
- Backend: Express API shell, typed Zod configuration/contracts, safe structured
  logging, Prisma migration and two synthetic tenant fixtures, transactional
  outbox append stub, BullMQ connectivity process, health endpoints and CI.
- Declaration-only server session/tenant context contracts keep platform and
  agency realms distinct and require tenant binding for staff/customers. These
  types do not authenticate callers or grant patient access.
- Frontend: Next.js Arabic/English placeholder shell, RTL/LTR routing,
  IBM Plex fonts, locked design tokens, dictionary tests, web-to-API health
  integration and CI.

## Fresh backend evidence

Run from `backend/`:

| Command/check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 44 passed, 0 skipped, including live PostgreSQL integration and context boundary tests |
| `npm run build` | exit 0, API and worker bundles emitted |
| `npm run migrate` twice on a temporary empty PostgreSQL database | first applied migration; replay had no pending migrations |
| `npm run seed` twice on that database | both succeeded, count remained 2 synthetic tenants |
| `npm exec -- prisma migrate status` on that database | schema up to date |
| API bundle: `/v1/health/live` and `/v1/health/ready` | both 200, DB UP |
| Worker bundle: `/health/live` and `/health/ready` | both 200, Redis UP |
| `npm exec -- prisma validate` | schema valid |

Temporary verification database was dropped afterward. The normal development
database is preserved. Local host ports are PostgreSQL 5433 and Redis 6380
because unrelated local services already occupy 5432 and 6379.

## Frontend evidence

Run from `frontend/`:

| Command/check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 13 passed, 0 skipped |
| `npm run build` | exit 0; `/ar` and `/en` statically generated, health handlers dynamic |
| `/health/live`, `/health/ready` with API running | both 200, API UP |
| API stopped, web still running | web readiness 503/API DOWN; web liveness remains 200 |
| `/` | 307 redirect to `/ar` |
| Unknown localized page | 404 |

Production-mode smoke checks used built API/worker bundles and `next start`
on port 3005. Installed headless Chrome verified Arabic RTL and English LTR
at widths 360 and 1440, no horizontal overflow, non-empty localized headings,
language switch targets, actual local IBM Plex font requests, and Tab access
to the language switch. Mobile/desktop screenshots were also inspected.

Local reproduction harness and screenshots (temporary verification artifacts):
`C:\Users\ashra\AppData\Local\Temp\opencode\raak-sprint0-smoke.mjs`,
`raak-{ar,en}-{360,1440}.png` in the same directory. Run the harness with `node`
after builds; it starts/stops its own API, worker, web and Chrome processes.
No browser package download was needed.

## Infrastructure evidence

- Compose services: PostgreSQL, Redis and LocalStack 4.0.3 healthy. Ports bind
  only to localhost (5433, 6380 and 4566 in this workspace).
- LocalStack startup created `raak-private`. `awslocal s3api head-bucket` passed.
- `get-bucket-acl` returned owner FULL_CONTROL with no public grants.
- Synthetic object upload/read/delete round trip passed; test object was removed.
- LocalStack is a development emulator, not a production storage security gate.

## Owner-run downloads (>~50 MB)

```powershell
docker compose -f "E:\projects\MERN stack\raak\backend\docker-compose.yml" pull localstack
docker compose -f "E:\projects\MERN stack\raak\backend\docker-compose.yml" up -d --pull never localstack
npm --prefix "E:\projects\MERN stack\raak\frontend" ci --no-audit --no-fund
```

The owner completed these downloads. No further large downloads were run by the
agent after the slow-internet constraint was recorded.

## Scope boundaries and handoff

- Root CI workflow files run each project's checks. GitHub-hosted runs have not
  been observed because the initial repository history has not been pushed yet.
- Native Windows termination does not prove Linux signal delivery; POSIX
  graceful-shutdown behavior still needs the deployment-stage environment check.
- LocalStack was pinned after `latest` required a license token. Keep it local
  with synthetic data; production storage choice and compatibility are future work.
- Session login, tenant resolution, permissions, CSRF and onboarding are Sprint 1.
  Catalog, quotes, patients, care plans, scheduling, visits, uploads and real
  notification delivery remain in their later sprints.
- Next work order: Sprint 1 control plane and identity, including negative tenant,
  invitation and suspended-session tests from `docs/12_TEST_PLAN.md`.

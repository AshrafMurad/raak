# 15 — Deployment, Operations, Backup/Restore and Release Gates

Status: Sprint 7 Session 6 (2026-11-05). This document records the production
deployment configuration, the managed-secret inventory, health/monitoring
surfaces, the backup/restore runbook with local rehearsal evidence, migration
replay, the rollback path, and the structured-log redaction review. It is an
engineering record, **not** a compliance certification, production-readiness
claim, or MVP-complete claim. Interpretations are recorded in ADR-0019.

## 1. Deployment architecture

`deploy/docker-compose.prod.yml` is the deployable unit (Coolify-deployable
compose; ADR-0019). One backend image serves both long-running processes; the
command selects the role. TLS and tenant routing are the Coolify edge's job
(Traefik), following ADR-0008: the platform host and `<slug>.BASE_DOMAIN`
serve the web container, and `/v1/*` on those hosts routes to `api:3001`.
No host ports are published by the stack file; every service is reachable
only inside the compose network.

| Service | Image | Command | Internal port | Healthcheck | Notes |
| --- | --- | --- | --- | --- | --- |
| `postgres` | `postgres:17-alpine` | — | 5432 | `pg_isready` | Named volume `pg-data`; never published |
| `redis` | `redis:8-alpine` | `--appendonly yes` | 6379 | `redis-cli ping` | Named volume `redis-data` |
| `migrate` | backend image | `node node_modules/prisma/build/index.js migrate deploy` | — | — | One-shot; api/worker start only after it succeeds |
| `api` | backend image | `node dist/index.js` | 3001 | `GET /v1/health/live` | Env `API_PORT=3001` |
| `worker` | backend image | `node dist/worker.js` | 8081 | `GET /health/live` | Env `WORKER_HEALTH_PORT=8081` |
| `web` | frontend image | `node server.js` (Next standalone) | 3000 | `GET /health/live` | Env `API_INTERNAL_BASE_URL=http://api:3001` |

Optional private object storage (S3-compatible) and ClamAV remain explicit
owner decisions (commented profiles in the stack file): uploads fail closed
(503) while `OBJECT_STORAGE_*` is unset and files quarantine while `CLAMAV_HOST`
is unset — behavior is unchanged from earlier sprints and stays owner-gated.

### Frontend build mode (ADR-0019)

`frontend/Dockerfile` builds with `NEXT_OUTPUT_STANDALONE=1`; `next.config.ts`
enables `output: 'standalone'` only when that variable is set. This Next.js
version (16.4.3) explicitly refuses `next start` when standalone output is
enabled, and the browser harness and local verification start the production
server with `next start` — so local builds keep the default output. The
web container runs `.next/standalone/server.js` instead. The client bundle is
built without `NEXT_PUBLIC_API_BASE_URL`, so it calls same-origin `/v1`
(ADR-0008); translations are statically imported and travel inside the server
bundle. Both server modes were verified locally (Section 8).

### Backend image (ADR-0019)

`backend/Dockerfile` is a two-stage `node:24-slim` image: `npm ci` (which runs
`prisma generate`), `npm run build` (esbuild bundle), then a runtime stage
copying `dist/`, `node_modules/`, `prisma/`, `prisma.config.ts` and
`package.json` as the non-root `node` user. The prisma CLI moved from
`devDependencies` to `dependencies` so the same image runs
`prisma migrate deploy`; Prisma 7 uses the driver-adapter client (no native
query engine to ship). No `.env` file enters the image.

## 2. Managed secrets and environment

All runtime configuration is injected by the deployment environment (Coolify
managed secrets or a protected env file). Required variables fail closed via
`${VAR:?...}` interpolation: an incomplete configuration cannot start a stack
(verified in Section 8). `deploy/.env.example` is the placeholder inventory;
never commit real values.

| Variable | Consumers | Required in production | Notes |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | postgres, api, worker, migrate | Yes | URL-safe (it is embedded into `DATABASE_URL`) |
| `POSTGRES_USER` / `POSTGRES_DB` | postgres, api, worker, migrate | Defaults `raak` | |
| `SESSION_SECRET` | api, worker, migrate | Yes | ≥ 32 bytes; api and worker must share it |
| `BASE_DOMAIN`, `PLATFORM_HOST` | api, worker, web, migrate | Yes | Public hosts; edge routes them |
| `TRUSTED_PROXY_HOSTS` | api | Operator decision | proxy-addr tokens for edge IPs/subnets; empty trusts no proxy |
| `LOG_LEVEL` | api, worker | No (`info`) | |
| `EMAIL_API_KEY`, `EMAIL_FROM` | api, worker | Owner gate | Unset keeps delivery pending with `EMAIL_NOT_CONFIGURED` |
| `OBJECT_STORAGE_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY/REGION` | api | Owner gate | Unset keeps uploads 503 |
| `CLAMAV_HOST`, `CLAMAV_PORT` | api | Owner gate | Unset quarantines uploads |
| `BACKEND_IMAGE`, `FRONTEND_IMAGE` | stack | Yes | Owner-built image references |
| `DATABASE_URL`, `REDIS_URL` | api, worker, migrate | Composed by the stack | Not set manually |

## 3. Health, readiness and monitoring hooks

Implemented endpoints (docs 07): API `GET /v1/health/live` and
`/v1/health/ready` (PostgreSQL probe); worker `GET /health/live` and
`/health/ready` (Redis probe); web `GET /health/live` and `/health/ready`
(probes API with a 3-second timeout).

Session 6 adds the worker monitoring hook **`GET /health/queues`** on the
existing worker health listener (`WORKER_HEALTH_PORT`, internal only):

```json
{ "data": { "status": "ok", "service": "worker",
  "queues": {
    "emailDeliveries":         { "pending": 0, "sending": 0, "failed": 0, "oldestPendingSeconds": 0 },
    "notificationDeliveries":  { "pending": 0, "sending": 0, "failed": 0, "oldestPendingSeconds": 0 },
    "outbox":                  { "unprocessed": 12, "oldestUnprocessedSeconds": 345600 },
    "bullmq": { "raak-request-email": { "waiting": 0, "active": 0, "completed": 5, "failed": 0, "delayed": 0 } } },
  "time": "<UTC ISO>" } }
```

Counts only — no tenant, recipient or payload identifiers. Collection failure
responds 503 with `QUEUE_STATS_UNAVAILABLE`. Alerting guidance (operator
choices, not code): page on a sustained rise of `*.failed`, on
`oldestPendingSeconds` exceeding the business tolerance for reminders, or on
sustained growth of `outbox.unprocessed`. Two documented behaviors keep the
numbers honest: unsupported/legacy event kinds are intentionally retained
unprocessed (docs 11, Sprint 7 Session 1), so `outbox.unprocessed` may hold a
stable residual; and BullMQ `failed` counts are job-level, while durable
delivery state (the compliance-relevant record) lives in the
`email_deliveries` / `notification_deliveries` tables surfaced above it.

## 4. Structured log redaction review

Reviewed `backend/src/logger.ts` against docs 08/09 during this session; no
changes required. Verified properties, regression-fenced by
`backend/test/logger.test.ts`:

- One JSON object per line on stdout; collectable by any log pipeline.
- Deny-by-default redaction of sensitive key fragments at any depth,
  including inside arrays: `password, passphrase, secret, token,
  authorization, authheader, cookie, sessionid, apikey, email, phone,
  address, note, bodyrestricted, dateofbirth, dob, license, firstname,
  lastname, beneficiary` → `[REDACTED]`.
- Caps: depth 6 (`[TRUNCATED_DEPTH]`), arrays 50 items, strings 2000 chars.
- HTTP layer logs `requestId/method/statusCode` only; unhandled errors log a
  type, never a message or stack, and responses carry no internals.

Residual limits (documented, accepted): redaction is key-based, so free text
under a non-sensitive key is not detectable — mitigated by the codebase
convention that outbox payloads and logs carry IDs only, and the dispatcher
logs codes rather than content. Next.js request logs contain no request
bodies. Any future logging surface must keep these properties; the logger
tests are the fence.

## 5. Deployment procedure

Image builds and stack bring-up download well above 50 MB (base images plus
in-image `npm ci`) and are **owner-run**. Exact commands:

```powershell
# Purpose: build the backend image (node:24-slim + backend deps + bundle).
# Working directory: backend/
docker build -t raak-backend:local .

# Purpose: build the frontend image (node:24-alpine + frontend deps +
# standalone Next build). Working directory: frontend/
docker build -t raak-frontend:local .
```

```powershell
# Purpose: validate interpolation against the placeholder example (no pulls).
# Working directory: repository root
docker compose --env-file deploy/.env.example -f deploy/docker-compose.prod.yml config --quiet

# Purpose: start the full stack for a local rehearsal (real secrets via a
# protected copy of the example, e.g. deploy/raak.env, never committed).
docker compose --env-file deploy/raak.env -f deploy/docker-compose.prod.yml up -d
docker compose --env-file deploy/raak.env -f deploy/docker-compose.prod.yml ps
```

Local rehearsal checks (no host ports published; run inside the network):

```powershell
$check = "fetch('URL').then((r) => { console.log(r.status); process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"
docker compose --env-file deploy/raak.env -f deploy/docker-compose.prod.yml exec api    node -e ($check -replace 'URL','http://127.0.0.1:3001/v1/health/ready')
docker compose --env-file deploy/raak.env -f deploy/docker-compose.prod.yml exec worker node -e ($check -replace 'URL','http://127.0.0.1:8081/health/ready')
docker compose --env-file deploy/raak.env -f deploy/docker-compose.prod.yml exec worker node -e ($check -replace 'URL','http://127.0.0.1:8081/health/queues')
docker compose --env-file deploy/raak.env -f deploy/docker-compose.prod.yml exec web    node -e ($check -replace 'URL','http://127.0.0.1:3000/health/ready')
```

Coolify setup summary: create a project from
`deploy/docker-compose.prod.yml`, enter the Section 2 variables as managed
secrets, set image names after pushing images to the registry Coolify pulls
from, and map domains per ADR-0008 (platform host and wildcard
`*.BASE_DOMAIN` → `web:3000`, plus a `/v1/*` path rule on the same domains →
`api:3001`). Coolify's Traefik terminates TLS; health checks should use the
endpoints above; scheduled backups per Section 6.

## 6. Backup and restore runbook

Backups use `pg_dump` custom format, taken by the operator's scheduler
(Coolify scheduled task or cron) from inside the postgres service, stored
**outside** the database volume. Retention and encryption-at-rest are owner
decisions recorded here as requirements, not implementations.

```powershell
# Purpose: nightly logical backup (adjust schedule/retention to policy).
# Working directory: deployment host
docker compose --env-file deploy/raak.env -f deploy/docker-compose.prod.yml exec postgres pg_dump -U raak -Fc -f /tmp/raak-$(Get-Date -Format yyyyMMdd-HHmm).dump raak
docker compose --env-file deploy/raak.env -f deploy/docker-compose.prod.yml cp <id-or-name>:/tmp/raak-<timestamp>.dump ./backups/
```

### Rehearsal evidence (2026-11-05, disposable data, dev container)

| Step | Command (abbreviated) | Result |
| --- | --- | --- |
| Backup | `docker exec raak-postgres-1 pg_dump -U raak -Fc -f /tmp/raak-rehearsal.dump raak` | exit 0, 349,800 bytes |
| Restore | `psql -c "CREATE DATABASE raak_restore_rehearsal"` + `pg_restore -U raak -d raak_restore_rehearsal /tmp/raak-rehearsal.dump` | exit 0 |
| Reconciliation | Row counts for `tenants, staff_accounts, customer_accounts, patients, visits, quotes, service_requests, outbox_events, email_deliveries, notification_deliveries, audit_events, _prisma_migrations` compared source vs restored | **0 differences** (e.g. tenants 158, staff 208, patients 142, visits 137, outbox 538, audit 378 — all synthetic) |
| Migration state on restored DB | `prisma migrate status` / `prisma migrate deploy` | "Database schema is up to date!" / "No pending migrations to apply." |
| Cleanup | Dropped `raak_restore_rehearsal`, removed dump | done |

## 7. Migration replay and rollback path

### Replay evidence (2026-11-05)

| Scenario | Command | Result |
| --- | --- | --- |
| Empty database | `CREATE DATABASE raak_migrate_rehearsal` + `prisma migrate deploy` (against it) | 16 migrations applied, "All migrations have been successfully applied." |
| Empty database drift | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | "No difference detected.", exit 0 |
| Restored database | `prisma migrate status` + `deploy` | up to date / no-op (see Section 6) |
| Cleanup | Dropped rehearsal database | done |

CI additionally replays all migrations on a fresh database on every run
(`backend-ci.yml`: `npm run migrate` twice around test/build).

Pre-existing caveat, unchanged and owner-owned: the long-lived local dev
database records a historical checksum mismatch for applied
`20261101190000_sprint3_commercial` (Sessions 1–5 status reports). Fresh
environments replay cleanly, as demonstrated above; `migrate deploy`,
`status` and drift checks do not repair that one database's history.

### Rollback path (documented; rehearsed restore is the DB leg)

1. **Application rollback:** redeploy the previous image tag (Coolify "deploy
   previously deployed image" / compose `BACKEND_IMAGE` retag). Prisma
   migrations are not auto-reversed by redeploying.
2. **Database rollback:** migrations are forward-only. To roll a database
   back, restore the pre-migration backup (Section 6 restore procedure) into
   the database after stopping api/worker/migrate, then redeploy the matching
   application image. Never edit an applied migration; `prisma migrate
   resolve` is for failed-migration bookkeeping only and must not be used to
   force state.
3. **Ordering:** stop writers (api/worker) → verify no in-flight transactions
   → restore → restart with the matching image tag. Data written after the
   backup is lost by design of point-in-time restore; take a fresh backup
   immediately before any risky migration so the window stays small.

## 8. Verification performed for this session

Local, no downloads (exact commands and results in
`docs/plans/sprint-07-status.md`): full backend/frontend suites, prisma
validate/status/diff, `docker compose --env-file deploy/.env.example
-f deploy/docker-compose.prod.yml config --quiet` (exit 0), the same config
without the env file (exit 1 — required secrets fail closed), backup/restore
and migration rehearsals (Sections 6–7), and both frontend server modes:
standalone `node server.js` (live 200; `/` 307 → `/ar`; `/ar`, `/en` 200) and
default-output `next start` (live 200; `/` 307 → `/ar`; `/ar` 200, no
standalone refusal warning).

## 9. Release gates

The gate checklist with per-gate evidence links lives in
`docs/12_TEST_PLAN.md` (updated this session, honestly: unchecked boxes stay
unchecked). Local rehearsal evidence covers backup/restore, monitoring and
migration gates only.

## 10. Remaining external launch gates (open, owner-owned)

- Live email provider/domain (`EMAIL_API_KEY`, verified `EMAIL_FROM`,
  `BASE_DOMAIN`) — delivery stays pending until provided.
- Private S3-compatible object storage passing the startup privacy probe —
  uploads stay 503 until provided.
- Optional ClamAV engine — files quarantine until provided.
- Owner-run image builds and stack rehearsal (Section 5 commands).
- Jurisdiction-specific security/regulatory launch review before any real
  patient onboarding; no compliance claims are made or implied.
- Core E2E journeys in CI (browser suites currently run locally; see
  docs/12 notes).
- Historical local-database checksum caveat (Section 7) — owner investigation.

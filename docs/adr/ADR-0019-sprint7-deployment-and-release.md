# ADR-0019: Sprint 7 deployment, monitoring and release-gate method

Date: 2026-11-05 (Sprint 7 Session 6). Status: accepted for this session;
D01–D23 and prior ADRs stay locked. This ADR records implementation
interpretations for deployment configuration, backup/restore and the release
gates; it makes no production-readiness, compliance or MVP-complete claim.

## Decisions

1. **One backend image, two roles.** `backend/Dockerfile` ships a single
   esbuild bundle; the deploy command selects `api` (`dist/index.js`),
   `worker` (`dist/worker.js`) or the one-shot `migrate`
   (`node node_modules/prisma/build/index.js migrate deploy`). This preserves
   the modular-monolith boundary (docs 08) and avoids image/config drift
   between the processes.

2. **Prisma CLI moves to `dependencies`.** The runtime image must run
   `migrate deploy`. Prisma 7 uses the driver-adapter client, so the CLI adds
   no native engine to the image; dev-only tooling (eslint, vitest, tsx,
   esbuild, prettier, typescript) is still excluded by not pruning in the
   image (full `node_modules` copied for correctness; size optimization is
   deferred and noted in docs/15).

3. **Frontend standalone output is conditional.** This repository's Next.js
   version (16.4.3) explicitly refuses `next start` when
   `output: 'standalone'` is enabled ("does not work with output: standalone;
   use node .next/standalone/server.js"). All browser suites and local
   verification start the production server with `next start`. Therefore
   `next.config.ts` enables standalone only when `NEXT_OUTPUT_STANDALONE=1`
   (set inside `frontend/Dockerfile`), the container runs
   `.next/standalone/server.js`, and local builds stay default. Both modes
   were exercised locally: standalone server (live 200, `/` 307 → `/ar`,
   `/ar`+`/en` 200) and default `next start` (same checks, no refusal).

4. **Compose is the deployable unit; the edge stays Coolify's.** Per ADR-0008
   the edge routes `/v1/*` on platform and `<slug>.BASE_DOMAIN` hosts to the
   API and everything else to web; `deploy/docker-compose.prod.yml` therefore
   publishes no host ports and hard-codes no Traefik labels. Required
   variables interpolate fail-closed (`${VAR:?...}`), verified by
   `docker compose config` failing without the env file. Object storage and
   ClamAV remain commented profiles: uploads fail closed and files quarantine
   while they are unset — unchanged, still owner gates.

5. **Monitoring is a counts-only worker endpoint.** Worker
   `GET /health/queues` (`contracts/health.ts` `QueueHealthSnapshotSchema`,
   `src/worker/queue-stats.ts`) aggregates durable delivery backlog
   (pending/sending/failed + oldest-pending age for `email_deliveries` and
   `notification_deliveries`), unprocessed outbox events, and BullMQ job
   counts. No tenant, recipient or payload identifiers; the same process
   exposing it already holds both connections. Alert thresholds are operator
   configuration (docs/15), not code. Documented honesty notes: legacy
   unsupported event kinds are retained unprocessed, so
   `outbox.unprocessed` may hold a stable residual, and BullMQ job state is
   subordinate to the durable delivery tables.

6. **Backups are operator-scheduled `pg_dump` custom format.** The runbook
   (docs/15) stores commands and evidence, not backup files. The rehearsal
   used disposable synthetic data inside the existing dev container: dump
   349,800 bytes → `pg_restore` into a fresh database with zero row-count
   differences across 12 key tables, `migrate status` up to date, `deploy`
   no-op; empty-database replay applied 16 migrations with no schema drift.

7. **Release-gate honesty rule.** `docs/12` checklist boxes are checked only
   with demonstrated evidence links; "Core E2E journeys green in CI" stays
   unchecked because CI runs lint/typecheck/unit/migrations/seed/build but
   not the browser suites (which run locally). In-depth reviews to date are
   recorded self-reviews; no independent external audit is claimed. The
   pre-existing local applied-migration checksum caveat remains owner-owned
   and is not repaired or hidden by this work.

## Consequences

- Deployment configuration is reviewable and versioned before any image is
  ever built; all image builds/stack bring-up remain owner-run commands
  (docs/15 Section 5) because downloads exceed the delegated threshold.
- Rollback is documented as restore-plus-matching-image, forward-only
  migrations; `migrate resolve` misuse is explicitly excluded.
- `docs/07` gains the queue endpoint row; `docs/08` deployment/observability
  sections point to the implemented configuration; `docs/15` is the ops
  reference indexed in `docs/README.md`.

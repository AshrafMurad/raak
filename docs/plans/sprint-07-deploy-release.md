# Sprint 7 Session 6 — Deployment, backup/restore and release gates

Date: 2026-11-05. Branch `feat/sprint7-deploy-release` from current `main`
(`8ccd124`, Session 5 PR #13 confirmed MERGED through origin/main history
before branching). Implements exactly the "Session 6" scope in
`docs/plans/sprint-07-sessions.md`. ADR-0003 remains honored: the dev
`backend/docker-compose.yml` keeps backing services only; this session adds
the production deploy configuration it explicitly deferred.

## Scope checklist

- [ ] Worker queue-depth/failed-job monitoring hook: aggregate counts-only
      `GET /health/queues` on the existing worker health listener (docs 08
      observability requirement), Zod contract, tests, docs 07/08 rows.
- [ ] Production images: `backend/Dockerfile` (API + worker share one image
      and bundle; command differs), `frontend/Dockerfile` (Next standalone
      output), both `.dockerignore` files.
- [ ] Coolify-deployable compose stack `deploy/docker-compose.prod.yml`
      (postgres, redis, one-shot migrate, api, worker, web; optional
      object-storage/antivirus profiles), `deploy/.env.example` placeholders,
      fail-closed secret interpolation.
- [ ] Move `prisma` CLI to production dependencies so the image can run
      `prisma migrate deploy` (no dev-deps in the runtime image).
- [ ] `output: 'standalone'` in `frontend/next.config.ts`; verify the
      `next start` browser harness and the standalone server both still work
      before and after.
- [ ] Backup + restore rehearsal on disposable data (pg_dump custom format →
      pg_restore into a fresh database → reconciliation); migration replay on
      an empty database; evidence recorded; disposable databases dropped.
- [ ] Structured log redaction review documented (existing logger tests are
      the regression fence); any gap found becomes a fix with a test.
- [ ] `docs/15_DEPLOYMENT_AND_OPS.md` runbook: deployment procedure (Coolify
      and raw compose), managed secrets table, health/readiness matrix,
      monitoring hooks, backup/restore runbook, migration replay, rollback
      path, log redaction review, external launch gates. Index in
      `docs/README.md`.
- [ ] `docs/12_TEST_PLAN.md` release-gate checklist updated with evidence
      links; boxes stay unchecked unless demonstrated.
- [ ] ADR-0019: deployment interpretations (single backend image, prisma CLI
      in runtime, standalone output, compose-as-deployable-unit, monitoring
      counts source, backup tooling).
- [ ] Session evidence appended to `docs/plans/sprint-07-status.md`.

## Interpretations (recorded in ADR-0019)

1. One backend image serves api and worker; both run from the same esbuild
   bundle (`dist/index.js`, `dist/worker.js`), differing only by command.
2. The prisma CLI moves to `dependencies` (Prisma 7 uses the driver-adapter
   client; the CLI is required at deploy time for `migrate deploy` and has no
   native engine to ship).
3. Frontend uses `output: 'standalone'`; the production container runs
   `server.js` instead of `next start`. The existing browser harness keeps
   using `next start`, which must be re-verified after the config change.
4. Deployment routing follows ADR-0008: the edge (Coolify's Traefik) serves
   `<slug>.<baseDomain>` and the platform host from the web container and
   routes `/v1/*` on those hosts to the API container; web is built with no
   `NEXT_PUBLIC_API_BASE_URL` so the bundle uses same-origin `/v1`.
5. Monitoring is counts-only on the worker's internal health port (no
   tenant/PHI fields); alerting thresholds are operator choices documented in
   the runbook, not code.
6. Backups use `pg_dump` custom format taken by the operator's scheduler;
   restore is rehearsed against disposable databases inside the dev
   container. The runbook stores commands, not backup files, in the repo.
7. Docker image builds and any stack bring-up download well above 50 MB
   (node base images, npm ci inside images) and are therefore owner-run;
   the agent provides exact copy-pasteable commands and validates everything
   that needs no download locally (`docker compose config`, rehearsals on the
   existing dev container).

## Out of scope

- No CI browser-suite job, no log shipping/aggregation deployment, no
  Grafana/Prometheus stack, no custom-domain/DNS or TLS certificate
  procurement, no live email/S3 provider changes, no migration history
  repair (the pre-existing local sprint3 checksum caveat stays owner-owned),
  no release/tag/merge/push decisions.

## Exit checks

Backend and frontend lint/typecheck/test/build; `prisma validate`,
`migrate status`, `migrate diff --exit-code`; affected browser suites re-run
(all of them use the same `next start` mechanism this slice touches);
`docker compose config` validation of the prod stack; backup/restore and
empty-DB migration rehearsals executed with recorded output; `git diff
--check`. Owner-delegated commands recorded and left unexecuted.

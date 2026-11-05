# deploy/

Production deployment configuration (Sprint 7 Session 6).

- `docker-compose.prod.yml` — Coolify-deployable stack (postgres, redis,
  one-shot migrate, api, worker, web) with fail-closed secret interpolation.
- `.env.example` — placeholder values for validation and secret inventory.

The full runbook — deployment procedure, health/readiness matrix, monitoring
hooks, backup/restore rehearsal, migration replay and rollback path — lives in
`docs/15_DEPLOYMENT_AND_OPS.md`. Image builds download well above 50 MB and
are owner-run; see that document for exact commands.

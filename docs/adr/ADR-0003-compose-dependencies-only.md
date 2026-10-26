# ADR-0003 — Docker Compose provides dependencies only (Sprint 0)

Date: 2026-10-26
Status: Accepted
Context: Sprint 0 exit gate: "local docker up, web/API/worker connect". Sprint 7 owns Docker/Coolify production deployment.

## Decision

`backend/docker-compose.yml` runs three backing services, each with a healthcheck.
All published development ports bind to `127.0.0.1`.

- `postgres:17-alpine` (db `raak`, user `raak`) — port 5432
- `redis:8-alpine` — port 6379
- `localstack/localstack:4.0.3` (S3-compatible dev object store, bucket `raak-private` created by an init hook) — port 4566

> 2026-10-26 amendment: MinIO images (`docker.io/minio/*`, `quay.io/minio/minio`) became
> registry-gated during Sprint 0; LocalStack's S3 provider replaces MinIO for local development.
> Production object storage (private S3-compatible bucket) is unchanged as a requirement.

> Subsequent verification: the pulled `latest` image was version `2026.10.3`
> and exited with code 55, requesting `LOCALSTACK_AUTH_TOKEN`. Pin the
> pre-license-gate community version `4.0.3` instead. After the owner's download,
> runtime health and bucket initialization passed. Bucket ACL was owner-only,
> and a synthetic put/get/delete round trip passed.
> No AWS account is required for the local emulator. Use a separately configured
> private storage service for production; S3-compatible providers still require
> compatibility verification when chosen.

Applications (web/api/worker) run on the host via `npm run dev` during development. App containerization, TLS proxy, and production compose/deployment are Sprint 7 deliverables.

## Consequences

- Fast inner loop; no Dockerfiles to maintain until hardening sprint.
- `.env.example` documents localhost service URLs matching compose defaults.

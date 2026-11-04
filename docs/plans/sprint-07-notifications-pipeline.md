# Sprint 7 Session 1 — Notification delivery infrastructure

Baseline: `364cbfd` (Sprint 6 PR #8 merged). Branch:
`feat/sprint7-notifications-pipeline`. Synthetic fixtures only.

## Checklist and verification seams

1. Add strict matrix/policy DTOs, sparse tenant policy overrides, personal
   channel opt-outs, general notification records and per-recipient deliveries.
2. Implement GET/PATCH agency policy and safe delivery-observability endpoints;
   reuse live transactional agencyAction and central authorize checks.
3. Dispatch supported domain events transactionally into deduplicated channel
   records. Re-resolve tenant, account, resource and grants; leave unsupported
   and legacy identity events pending. Preserve existing request-email delivery.
4. Add a general queue and fenced delivery leases, bounded retry/permanent failure
   handling and send-time authorization. Missing renderers/provider never send
   and never consume attempts. Business renderers/reminders remain Session 3.
5. Test HTTP policy authorization/CSRF/isolation, real PostgreSQL dispatcher races,
   grants, preferences and delivery recovery; test queue recovery with Redis.
6. Review privacy/maintainability; update contracts and session evidence; run each
   requested project, Prisma and affected browser command separately.

Invariants: IDs-only new payloads; no provider/Redis calls inside transactions;
dedupe `(event, principal, channel)`; deny-by-default current authorization;
essential cells cannot be disabled; unknown events remain unprocessed; lease
tokens fence stale runners. No frontend, inbox APIs, reminders or templates.

## Ordered commit boundary

One coordinated backend infrastructure change with schema/migration, contracts,
tests and documentation; keep the pre-existing owner-authored session map
separate if committed. No push authorized.

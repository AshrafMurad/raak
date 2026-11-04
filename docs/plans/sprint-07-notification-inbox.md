# Sprint 7 Session 2 — Notification inbox implementation plan

Goal: self-only inbox/count/read and authorized navigation; AR/EN personal
preferences and agency policy screens using Session 1 records.

Spec: `sprint-07-sessions.md`, Session 2; docs 05/07/10/11. Execute inline.
Base: `ede1628`, merged Session 1 PR #9 (GitHub confirmed 2026-11-04).
Branch: `feat/sprint7-notification-inbox`. No dependency downloads planned.

## Checklist and interfaces

- [x] Backend HTTP seam: strict GET `/notifications` (unreadOnly, cursor, limit),
  GET `/notifications/unread-count`, POST `/notifications/:id/read`, GET
  `/notifications/:id/target`; GET/PATCH `/notifications/preferences`.
  Test through real Express/PostgreSQL: self/tenant/principal-type isolation,
  CSRF, active session/tenant, capped pagination, replay/concurrent reads,
  current grant/assignment and optional-only preferences.
- [x] `contracts/notifications.ts`: query/preference DTOs; `inbox.service.ts`
  handles self projections and reads; `notification-target.ts` owns current
  resource access and allowlisted route mapping; thin controller transport.
  Retire legacy HTTP projection and update its request-queue consumer together.
- [x] Frontend `features/notifications/`: decoded adapter, localized generic
  event copy, inbox and preferences/policy forms. Reuse Button, CheckboxField,
  Feedback, existing cards/shells; no new shared visual primitive required.
  Add header badge to shared workspace/portal shells, inbox and settings routes,
  URL-backed unread/cursor filters; test adapter rejection and i18n parity.
- [x] Browser seam: real API/Next/installed Chrome, synthetic accounts and
  records; badge → inbox → read → authorized target, stale-resource unavailable,
  personal preference persistence and locked agency cells, AR/EN at 360px and
  desktop light/dark. Existing shell consumers get regression browser checks.
- [x] Review responsibilities/security and update docs 05/07/11, ADR-0015;
  run each required lint/typecheck/test/build, Prisma validate/status/diff,
  browser build/suites and whitespace check separately. Append exact evidence
  to sprint-07-status.md. Curate coupled behavior/tests/docs atomically; no push.

## Invariants and interpretations

Tenant and principal come exclusively from live server-resolved session context;
central authorize at HTTP and transaction seams. No recipient/tenant overrides.
Previews expose codes/timestamps only, never entity content. Read is monotonic
and server-timestamped; repeated reads preserve first readAt. Target resolution
returns an allowlisted relative route only after fresh object checks, otherwise
generic unavailable; destination APIs recheck authority. IDs never grant access.
Optional preferences are per-cell opt-outs, independent of tenant policy; they
cannot enable tenant-disabled channels or disable essential cells. See ADR-0015.

## Review focus

Stale assignment/grant; revoked or expired session; forged tenant/recipient;
out-of-order frontend fetches; save/version failures must never show success.
Live email/private storage and templates/reminders remain their existing gates.

## Execution ledger

- HTTP inbox test initially failed on the legacy array response, then passed
  against the new scoped page. Read/preferences tests initially returned 404,
  then passed after implementation. One implementation import mistakenly used
  a nonexistent common UUID helper; typecheck exposed it and the existing local
  Zod UUID parsing convention fixed it. Caregiver fixture required explicit ACTIVE
  operational status; the production check correctly denied the inactive default.
- Frontend adapter tests initially failed on the absent adapter, then passed.
  Review found timestamps used device defaults; backend/frontend timezone
  assertions failed first, then passed with the agency timezone in the list DTO.
- Target/access policy remains separate from event relevance. Generic stale
  history is intentionally self-visible, but resource paths require fresh authority.
- Browser protocol: Sprints 2 and 3 share 3110/3111 and must run sequentially.
  An initial parallel Sprint 3 run failed EADDRINUSE; its separate retry passed.
- Final review: inline self-review, recorded in `sprint-07-inbox-review.md`.
  No subagents used. Existing TDD workflow reused; no second test workflow.
- Verification: full 312 backend/83 frontend tests and all required commands
  passed; exact results and next-session handoff in `sprint-07-status.md`.

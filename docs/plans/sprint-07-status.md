# Sprint 7 session evidence

## Session 1 — Notification policy and general delivery pipeline

Date: 2026-11-04. Local implementation/verification completed on
`feat/sprint7-notifications-pipeline`; not pushed or merged. Base `364cbfd`
contains merged Sprint 6 PR #8 (confirmed by fetch, origin/main history and
ancestry). This session interpreted the unfilled `<N>` as Session 1; the owner
subsequently instructed continuation. No later-session UI/templates/reminders
were implemented.

### Implemented

- Strict docs 11 channel matrix, protected essential cells, tenant policy GET/PATCH
  with its own version, optional per-principal opt-out persistence/enforcement.
- Additive notification/policy/preference/per-recipient delivery tables and
  same-tenant event/updater constraints. No historical data/migration rewrites.
- General dispatcher with same-tenant aggregate/current account/role/assignment/
  grant resolution, transactional in-app/email dedupe, unsupported-event retention,
  suspension checks, obsolete notice suppression and essential-recipient retry.
- General email queue adapter, stable provider key, token-fenced two-minute
  leases, five-attempt bounded retry, terminal failure and safe admin observability.
  Missing template/provider leaves work pending, never a simulated send.
- New policy/delivery endpoints re-run central authorize + live session checks;
  all mutations require CSRF. New payloads contain IDs only; no patient free text
  enters records, jobs, logs or the observability projection.

### Key files

`backend/src/contracts/notifications.ts`, `backend/src/modules/notifications/`,
`backend/src/worker/notifications.ts`, `backend/prisma/schema.prisma`,
`backend/prisma/migrations/20261104120000_sprint7_notifications/migration.sql`,
`backend/test/notifications/`, updated docs 05/06/07/11, ADR-0014,
`sprint-07-notifications-pipeline.md` and `sprint-07-review.md`.

### Exact verification (commands run separately)

Working directory `backend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0, after resolving duplicate exported channel type |
| `npm run test` | PASS: 39 files, 308 tests (13 new notification tests); pg query-concurrency deprecation warning emitted |
| `npm run build` | PASS: API and worker bundles |
| `npm exec -- prisma validate` | PASS: schema valid |
| `npm exec -- prisma migrate status` | PASS: 14 migrations, database up to date |
| `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS: no difference, exit 0 |
| `npm run test:browser` | PASS E01, E02 AR/EN; light/dark, mobile/desktop UI regression checks using installed Chrome |
| `npm run test:browser:sprint6` | PASS E06/E07 AR/EN, caregiver execution/review/correction and customer change journeys/reflow |

Working directory `frontend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS: 17 files, 81 tests, including i18n parity |
| `npm run build` | PASS: 52 static pages generated |
| `npm run build:browser` | PASS, run before the browser suites |

Root: `git diff --check` PASS. No dependencies, images or browser binaries downloaded.
Focused tests initially failed before implementation; review regressions initially
failed on retry deferral, obsolete notices and missing-recipient acknowledgement,
then passed. Full suite was rerun after fixes.

### Migration caveat and open gates

`npm exec -- prisma migrate dev --name sprint7_notifications --create-only`
failed because local DB records a different checksum for already-applied
`20261101190000_sprint3_commercial`. Prisma suggested reset; none was performed.
An explicit additive migration was prepared from the read-only schema diff;
`npm exec -- prisma migrate deploy` applied it successfully, and
`npm run generate` generated the local client. Existing checksum mismatch remains
for the owner to investigate; additive deploy/status/drift checks do not prove
that historical checksum has been reconciled.

Live email provider/domain, private S3, country-specific launch review and any
large deployment downloads remain owner gates. No delegated install is pending.
Business templates/reminders and remaining requester event mappings are Session 3;
legacy identity email events remain unprocessed rather than sending stored legacy
payload capabilities. Dedicated request/verification/claim email behavior is preserved.
No production business-email delivery or MVP-complete claim is made.

### Next-session handoff

After owner review and merge of this branch, Session 2 adds inbox/count/read,
personal preferences API/UI, agency policy UI and authorized resource navigation.
Use the new Notification table, not a union with legacy RequestNotification;
render previews from codes; maintain current grant checks. GET policy returns
`version`; PATCH requires `expectedVersion`. Admin observability includes
`blockedEvents` and independent blockedNextCursor. Session 3 registers business
renderers at `startNotifications`, extends explicit event mappings as needed and
adds reminder invalidation. Do not close live-provider/storage gates from capture tests.

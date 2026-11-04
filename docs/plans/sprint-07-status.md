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

## Session 2 — In-app inbox and notification preferences UI

Date: 2026-11-04. Branch `feat/sprint7-notification-inbox`, based on current
`main` at `ede1628`. GitHub confirmed Session 1 PR #9 MERGED at
2026-11-04T11:29:16Z before branch creation/coding. Local work only; no push.
Feature/API/test commit: `86481de` —
`feat(notifications): add scoped inbox and notification settings`.

### Implemented

- New-record-only, tenant/principal/type-scoped inbox, capped stable pagination,
  unread-only filter/count and CSRF-protected monotonic mark-read under replay/race.
- Code/timestamp-only previews, agency-zone localized dates, current-authority
  resource target resolution and generic unavailable feedback after grant expiry/
  revocation, caregiver unassignment or stale resource. Destination APIs recheck.
- Optional personal preference GET/PATCH with self scoping, strict configurable
  cells, safe audit/IDs-only outbox, and explicit tenant-disabled state. Protected
  cells cannot be changed; personal opt-in cannot override agency policy.
- AR RTL/EN LTR inbox and preferences for workspace/portal, shared-header bell
  count, 60-second/focus/confirmed-read refresh, agency policy settings with locked
  essential cells and optimistic version handling. Filters/pagination are URL-backed.
- Request queue consumes the new unread count. Targeted request/caregiver deep
  links open the corresponding authorized resource rather than the first list row.
- Reused shared Button/CheckboxField/Feedback/StatusBadge/cards/shells; added
  NotificationBadge layout composition. No new visual primitive or theme change.

### Key files and interpretation

`backend/src/contracts/notifications.ts`, `modules/notifications/inbox.service.ts`,
`notification-target.ts`, `notifications.controller.ts`,
`backend/test/notifications/inbox.integration.test.ts`,
`backend/test/browser/sprint7-inbox.e2e.ts`,
`frontend/features/notifications/`, `components/layout/notification-badge.tsx`,
new inbox/preferences/settings routes, `messages/{ar,en}/notifications.json`.
Docs 05/07/11 updated; ADR-0015 records transport/history/target interpretations.
Plan/review: `sprint-07-notification-inbox.md`, `sprint-07-inbox-review.md`.

### Exact verification (commands executed separately)

Working directory `backend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0, no warnings |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS, 40 files / 312 tests (4 new integration scenarios with denial/race assertions) |
| `npm run build` | PASS, API and worker bundles |
| `npm exec -- prisma validate` | PASS, schema valid |
| `npm exec -- prisma migrate status` | PASS, 14 migrations, database up to date |
| `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS, no difference, exit 0 |
| `npm run test:browser` | PASS E01/E02 AR/EN plus existing light/dark mobile/desktop shell regressions |
| `npm run test:browser:sprint3` | PASS E03/I10/I11 AR/EN and workspace matrices; initial concurrent invocation failed EADDRINUSE on shared 3110, then separate retry passed |
| `npm run test:browser:sprint4` | PASS E04/F05/F06 AR/EN, caregiver/file synthetic doubles and viewport/theme matrices |
| `npm run test:browser:sprint5` | PASS AR/EN plans/assignment/leave/reassignment and route matrices |
| `npm run test:browser:sprint6` | PASS E06/E07 AR/EN, completion/history/changes/settings/reflow and preview smoke checks |
| `npm run test:browser:sprint7-inbox` | PASS 4 staff AR/EN desktop-light/360px-dark flows + 2 customer AR/EN 360px flows, keyboard read/focus, persisted preferences/policy, protected cells and stale/grant-revoked targets |

Working directory `frontend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0, no warnings (initial tracking effect dependency warning corrected) |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS, 18 files / 83 tests, including 2 adapter tests and expanded i18n parity |
| `npm run build` | PASS, 62 static pages generated |
| `npm run build:browser` | PASS, executed before browser suites; rebuilt before final inbox/keyboard run |

Root: `git diff --check` PASS. New behavior tests were observed failing before
implementation; timezone regression assertions failed before the review fix.
Full test suites rerun after the timezone fix. All browser runs use installed Chrome.
The existing pg concurrent-query deprecation warning appears in integration/browser
runs; it is not a test failure. No dependencies/images/browser binaries downloaded.

### Not implemented / risks and gates

- No Session 3 templates/reminders or later reports, audit screens, performance
  campaign or deployment features. Session 1's explicit event mappings remain the
  only production dispatch mappings. Worker execution is needed to populate new
  notices; legacy rows are not synthesized into the inbox.
- Live email provider/domain, private S3 and jurisdictional launch review remain
  owner gates; no install/download is pending. No live-mail, compliance or MVP-
  complete claim. Generic history stays self-visible after resource revocation,
  as documented in ADR-0015, but grants never derive from notification ownership.
- No schema migration needed. Earlier local applied-migration checksum caveat
  remains unresolved; validate/status/drift are not historical checksum repair.
- Review was inline/self-review; see scoped evidence and limits in the review file.

### Next-session handoff

After owner review/merge of this branch, start Session 3 from current main and
implement only localized safe business templates and versioned visit-reminder
scheduling/invalidation. Reuse Session 1 delivery dedupe/retry/provider gates and
Session 2 preference transport; maintain optional-only semantics and current
authorization at delivery/navigation. Production renderers must not be inferred
from inbox text; email remains fail-closed until its provider/template gates pass.

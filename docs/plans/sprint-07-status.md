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

## Session 3 — Business templates and visit reminders

Date: 2026-11-04. Branch `feat/sprint7-templates-and-reminders`, from updated
main `15e2217`. Session 2 PR #10 confirmed MERGED through `gh pr list` before
branching/coding. Feature commit: `fcdd79b` —
`feat(notifications): add localized templates and versioned visit reminders`.
Local commits only; no push or merge performed.

### Implemented

- Every docs 11 matrix code has AR/EN safe plain-text copy and generic subject;
  public agency label sanitization, RTL/LTR isolation and allowlisted tenant-origin
  authenticated CTA routes. No patient/service identity, visit time, addresses,
  restricted notes or commercial free text enters rendered business mail.
- Registered production business renderer under the existing configured-provider
  gate; retained bounded retries, stable delivery-ID dedupe, fenced leases and
  safe attempts/error observability. Missing provider remains PENDING with zero
  attempts and EMAIL_NOT_CONFIGURED, never a simulated send.
- Request information/quote/replacement and visit confirmation/reassignment event
  mappings; current verified accounts/roles/assignment/grants resolved per tenant.
  Request-only guests require consumed proof matching the current email hash,
  receive EMAIL only and gain no inbox/session/patient authority. Request-specific
  CTA prevents an existing different-request guest session selecting the wrong item.
- Account notification locale defaults Arabic, self-updatable through existing
  preference transport with CSRF/live-session checks; new customers inherit their
  registration locale. Existing UI is unchanged.
- Additive reminder snapshots and separate visit reminder revisions. Shared
  assignment core and approved-change transactions replace pending generations;
  default optional 24h/2h per channel or one configured channel offset. Only
  strictly future deadlines are scheduled. Due/revision/window/state, current
  recipient authority, suspension and optional policy/preferences rechecked at
  dispatch and send. Cancellation/reschedule fences obsolete pending mail.
- Tests cover deadline/inside-offset boundaries, concurrent dedupe/replacement,
  stale/cancelled/started suppression, missing provider, optional preferences,
  verified guests and cross-tenant denial. Existing approved-change API tests now
  assert reminder rollback/replacement/cancellation and replay-stable revision;
  real quote/replacement workflow captures dispatched content. Browser capture
  checks actual authenticated CTAs and the two-request guest regression in AR/EN.

### Key files and review

`backend/src/modules/notifications/templates.ts`, `messages/{ar,en}.json`,
`reminders.ts`, `audience.ts`, `delivery.ts`, `worker/{index,notifications}.ts`,
assignment/change transaction hooks, notification contracts/preferences,
`backend/prisma/schema.prisma` and two additive migrations,
`test/notifications/{templates.test,reminders.integration.test}.ts`,
`test/browser/sprint7-templates.e2e.ts`. Docs 05/06/07/11 and ADR-0016 updated.

One independent read-only final review found a medium guest-CTA navigation issue;
the integration assertion failed before correction, then passed. Both locales'
browser regressions and full backend suite passed after the fix. Additional
quote and approved-change assertions address identified coverage limits. See
`sprint-07-templates-review.md` for review coverage, caller inventory and limits;
`sprint-07-templates-and-reminders.md` for the completed checklist/ledger.

### Exact verification (commands executed separately)

Working directory `backend/`:

| Command | Final result |
| --- | --- |
| `npm run lint` | PASS, exit 0, no warnings |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS, 42 files / 320 tests; full suite rerun after review fix |
| `npm run build` | PASS, API/worker bundles; rerun after review fix |
| `npm exec -- prisma validate` | PASS, schema valid |
| `npm exec -- prisma migrate status` | PASS, 16 migrations, database up to date |
| `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS, no difference, exit 0 |
| `npm run test:browser` | PASS E01/E02 AR/EN and light/dark mobile/desktop UI matrix |
| `npm run test:browser:sprint3` | PASS E03/I10/I11 AR/EN and commercial workspace matrix |
| `npm run test:browser:sprint4` | PASS E04/F05/F06 AR/EN, caregiver/file synthetic-double and responsive/theme matrices |
| `npm run test:browser:sprint5` | PASS AR/EN plans/assignment/leave/reassignment and route matrix |
| `npm run test:browser:sprint6` | PASS E06/E07 AR/EN, completion/history/changes/settings/reflow |
| `npm run test:browser:sprint7-inbox` | PASS staff AR/EN desktop-light/360px-dark and customer AR/EN inbox/preferences/grant flows |
| `npm run test:browser:sprint7-templates` | PASS AR/EN 360px captured-reminder CTA + AR/EN guest session A denied request B until B-specific verification |

Working directory `frontend/` (no source changes):

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS, 18 files / 83 tests, including i18n parity |
| `npm run build` | PASS, 62 static pages generated |
| `npm run build:browser` | PASS, executed before browser suites |

Root: `git diff --check` and `git diff --cached --check` PASS. Browser suites use
installed Chrome. No dependencies, images, fonts or browser binaries downloaded.
Existing pg concurrent-query deprecation warnings remain in integration/browser
output; no test failure is hidden by them.

### Initial failures and migration recovery

- Template/reminder tests initially failed because their implementations did not
  exist; assignment reminder assertion failed before the hook; guest CTA assertion
  failed before the review fix. All subsequently passed.
- Initial `npm exec -- prisma migrate deploy` failed P3018/42883: an existing
  enum CHECK could not survive conversion of delivery principal_type to text.
  This session's not-yet-applied migration was corrected to drop that CHECK before
  conversion and add the new constrained text CHECK. Already-created additive
  columns were preserved with IF NOT EXISTS. No data reset or historical migration
  edit was performed. Recovery commands, separately:
  `npm exec -- prisma migrate resolve --rolled-back 20261104130000_sprint7_templates_reminders`,
  `npm exec -- prisma migrate deploy`, `npm run generate` — all PASS.
- Initial schema diff found a PostgreSQL-truncated reminder index name. A second
  additive index-rename migration and explicit Prisma map resolved it;
  `npm exec -- prisma migrate deploy` PASS, final validate/status/diff PASS.
- Initial lint rejected a control-character regex; equivalent code-point filtering
  passed lint and injection tests. Initial typecheck caught nullable quote expiry;
  explicit fail-closed null handling fixed it.
- First full suite had 3 bulk tests counting all visit events; the new confirmation
  event made counts double. Assertions now explicitly count the original
  `visit.assigned` event, retaining exactly-once checks. Full suite then passed.
- New browser harness initially hit API-client DNS resolution of wildcard localhost;
  the check now runs through Chrome. Later guest fixture failures came from a
  frozen clock preceding event creation and a too-short token; explicit synthetic
  timestamps and a schema-valid generated token fixed the harness. Final suite
  passes all four flows. No product authorization/validation was weakened.

### Not implemented / remaining risks and gates

- No Sessions 4–6 reports/audit UI, accessibility/performance campaign, deployment,
  backup/restore work, historical reminder backfill or locale-selection screen.
- Legacy owner/invitation/reset email events retain their prior unprocessed safe
  ownership. Templates exist for their matrix codes, but this is not a claim of
  legacy capability delivery integration. No late-visit detector added. Initial
  receipt/request-access email retains its dedicated pipeline, avoiding duplicates.
- Live email provider/domain, private S3 and jurisdictional launch validation stay
  open owner gates. Capture adapters are synthetic evidence only. No delegated
  install/download is pending; no compliance or MVP-complete claim is made.
- Earlier local historical applied-migration checksum caveat remains unresolved;
  clean schema diff/status does not repair that history. External email cannot
  guarantee exactly-once universally or recall an already-sent message.

### Next-session handoff

After owner review/push request and merge, Session 4 starts from current main and
implements only tenant-scoped reports/reconciliation and append-only safe audit
  views. Preserve notification generation/version checks and current authorization.
  Do not consume legacy capability payloads or treat capture evidence as live email.
  ADRs/D01–D23 stay locked; external launch gates remain open.

## Session 4 — Reports and audit screens

Date: 2026-11-04. Branch `feat/sprint7-reports-audit` from main `9c6858c`.
Session 3 PR #11 confirmed MERGED through `gh pr list` after owner publication;
fetched/synchronized main before branching. Local implementation only, uncommitted
and unpushed; no merge performed.

### Implemented

- Tenant-scoped request current-status/service distributions, visit status counts,
  unassigned totals, start-based timeliness and current-caregiver planned workload.
  Explicit inclusive agency-local date windows, status/service filters, source-row
  reconciliation and foreign-service/unknown-tenant filter denial (I02).
- Central `reports.read` (Owner/Admin/Coordinator) and `agency.audit.read`
  (Owner/Admin) at HTTP and live-principal transaction boundaries; no-store reads.
  Aggregate queries/batched lookups, capped service/load rows with truncation flags.
- Safe append-only agency audit view, chronological at/id keyset pagination with
  timestamp-tie handling, actor/entity/time/reason projection excluding metadataJson
  and notes. Platform tenant detail adds all-time request/visit status counts only.
- AR RTL/EN LTR workspace reports and audit pages, URL-backed filters/cursors,
  service-option pagination/retry, precise metric help, localized timezone-aware
  audit dates. Failed filters clear old totals. Shared Button/Field/Input/Select/
  Feedback/cards/table-scroll/navigation reused; no new shared primitive or theme.
- Nine API integration scenarios, four frontend adapter tests, expanded i18n parity
  and E08 real-browser flows in both locales with synthetic A/B fixtures.

### Key files and interpretation

`backend/src/contracts/reports.ts`, `modules/reporting/{reports.service,audit.service,
reporting.controller}.ts`, permissions/server/platform detail extensions,
`backend/test/reporting/reports.integration.test.ts`,
`backend/test/browser/sprint7-reports.e2e.ts`, `frontend/features/reporting/`,
workspace reports/audit routes, shared navigation and `messages/{ar,en}/reporting.json`.
Docs 05/06/07 and ADR-0017 define measurements, caps and privacy projections.
Plan/review: `sprint-07-reports-audit.md`, `sprint-07-reports-review.md`.

### Exact verification (commands invoked separately)

Working directory `backend/`:

| Command | Final result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS standalone rerun: 43 files / 329 tests (9 new reporting tests) |
| `npm run build` | PASS: API and worker bundles |
| `npm exec -- prisma validate` | PASS: schema valid |
| `npm exec -- prisma migrate status` | PASS: 16 migrations, database up to date |
| `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS: no difference, exit 0 |
| `npm run test:browser` | PASS E01/E02 AR/EN and shared light/dark desktop/mobile shell regressions |
| `npm run test:browser:sprint3` | PASS E03/I10/I11 AR/EN plus workspace matrices |
| `npm run test:browser:sprint4` | PASS E04/F05/F06 AR/EN and synthetic qualification/private-file workflows/reflow matrices |
| `npm run test:browser:sprint5` | PASS AR/EN plans/assignment/leave/reassignment and route matrices |
| `npm run test:browser:sprint6` | PASS E06/E07 AR/EN and completion/history/changes/settings/reflow |
| `npm run test:browser:sprint7-inbox` | PASS staff/customer AR/EN inbox/preferences/policy/grant flows |
| `npm run test:browser:sprint7-templates` | PASS AR/EN captured-reminder CTA and guest request-specific verification regressions |
| `npm run test:browser:sprint7-reports` | PASS 4 report flows (AR/EN desktop-light + 360px-dark), failed-filter/reset regression and 2 owner audit pagination/safe-summary flows at 360px |

Working directory `frontend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS: 19 files / 87 tests, including i18n parity and 4 reporting adapter tests |
| `npm run build` | PASS: 66 static pages |
| `npm run build:browser` | PASS: rebuilt after final UI changes, before final browser suites |

Root: `git diff --check` PASS. Browser suites use installed Chrome. No packages,
browser binaries, images or assets downloaded. Existing pg concurrent-query
deprecation warnings appear in integration/browser runs. Prisma update notices
were informational; no upgrade/install performed. No schema/migration changes.

### Failures addressed during implementation/verification

- Initial new request/visit aggregates missed Prisma tenantId predicates; API
  reconciliation/I02 tests caught other synthetic tenants in counts. Explicit
  predicates fixed the issue before delivery. Raw SQL and batched lookup variants
  were reviewed for scope. Full suite and E08 now pass; no live data involved.
- Suspended-session assertions initially expected 409; existing session resolver
  returns 401 before domain access. Tests corrected without changing guards.
- Chronological audit regression failed on UUID-only sorting; at/id cursors fixed
  order and timestamp ties. Browser assertions now await asynchronously loaded rows.
- E08 caught mobile wide-table overflow; shared scroll wrapper fixed it. Added
  failing browser regression proved stale totals after invalid filters; clearing
  data on load and current-state errors fixed it and successful reset recovery.
- Lint/typecheck caught an unused test import, unknown-value reduce typing and a
  Select option mapping mismatch; corrected before final required checks.
- Initial full backend run alongside parallel lint/typecheck/frontend tests had
  one unchanged E03 test exceed its 5000ms timeout (328 pass / 1 timeout). A
  standalone `npm run test` passed 329/329; E03 took ~2351ms. No timeout, test
  assertion or unrelated commercial code was changed to make it pass.

### Remaining risks/gates and next-session handoff

No Session 5 performance/accessibility campaign or Session 6 deployment/restore
implementation. Full release gates remain open. Live email/provider domain,
private S3, jurisdiction-specific review and historical applied-migration checksum
caveat from Sessions 1–3 remain unresolved; status/drift checks are not history
repair. No delegated installation is pending, no live-data/compliance claim.

After owner review/commit/push/merge, Session 5 starts from updated main and runs
the wider E09 accessibility/locale and measured performance sweep only. Keep
ADR-0017's date windows, timeliness denominator, caps and audit keyset/projections.
Review evidence is inline/self-review, not independent external assurance.

## Session 5 — Accessibility, locale and performance QA

Date: 2026-11-04. Branch `feat/sprint7-a11y-perf` from main `1805f20`; Session 4
PR #12 confirmed MERGED through `gh pr list` and main fetched/fast-forwarded
before branching/coding. Local commits only; push/merge await owner request.

### Implemented

- New E09 sweep `backend/test/browser/sprint7-a11y.e2e.ts` +
  `npm run test:browser:sprint7-a11y`: 20 key routes across guest/staff/
  customer/caregiver with synthetic injected sessions, AR RTL and EN LTR,
  360px dark and desktop light. Asserts html lang/dir, no horizontal overflow,
  zero page errors, visible keyboard focus indicators, first-Tab skip link on
  framed shells, dialog Tab containment/Escape focus return, and Arabic
  `bdi`/`dir="ltr"` isolation for ids, emails, amounts and timestamps.
- Keyboard-complete flows without mouse: guest intake through receipt
  (including announced empty-submit errors with first-invalid focus and a
  failed-submit-never-succeeds check), staff request-queue dialog, caregiver
  open → Start visit (server-confirmed 200) → close with focus return at
  360px. Verified quotes show version, unit prices, total, expiry and the
  "not an electronic payment" statement on the verified track view in both
  locales; guest "preferred time is not a confirmed appointment" copy asserted
  on intake and receipt.
- Defect found and fixed with the sweep as the failing-first regression:
  closing the caregiver execution dialog returned keyboard focus to <body>
  once the list re-grouped after Start (captured opener detached). The screen
  now tracks the live row button per visit and passes it to the dialog
  (`frontend/features/caregiver-visits/screen.tsx`,
  `visit-execution-panel.tsx`). Red before the fix, green after, both locales;
  no authorization, privacy or state-machine behavior changed.
- Performance budgets measured by standalone `backend/scripts/measure-performance.ts`
  (`npm run perf:budgets`, excluded from vitest, self-cleaning synthetic
  10x1000-visit dataset): paginated list p95 31 ms / median 26 ms / max 33 ms
  (300 samples, all 200) against the 500 ms budget — MET; candidate suggestion
  median 636 ms / p95 649 ms with 100 caregivers over the two-week horizon
  (30 samples, all 200) against the 1 s median budget — MET, with the honest
  note that this path has the least headroom and must be re-measured if
  caregiver counts grow.
- Email independence (budget 3) and worker idempotency/retry bounds (budget 4)
  asserted in `backend/test/performance/email-independence.integration.test.ts`:
  guest intake and replayed quote acceptance complete under a 2 s bound while a
  delivery is stuck SENDING on a never-responding provider; concurrent
  re-dispatch creates the delivery set exactly once; failing-provider retries
  cap at exactly 5 attempts then FAILED, with a sixth attempt a no-op.
- List caps/no-N+1 recorded via code references (visit list take 21, candidate
  caregiver take 200, reports/inbox/audit capped keysets) — measurements,
  environment notes and partial-verification limits are in
  `docs/plans/sprint-07-a11y-perf-measurements.md`; methodology interpretations
  in ADR-0018. No schema, API-contract or shared-UI changes.

### Key files

`backend/test/browser/sprint7-a11y.e2e.ts`, `backend/scripts/measure-performance.ts`,
`backend/test/performance/email-independence.integration.test.ts`,
`backend/package.json` (two scripts), `frontend/features/caregiver-visits/
{screen.tsx,visit-execution-panel.tsx}`, `docs/plans/
sprint-07-accessibility-performance.md`, `docs/plans/
sprint-07-a11y-perf-measurements.md`, `docs/adr/ADR-0018-sprint7-a11y-performance-method.md`.

### Exact verification (commands run separately)

Working directory `backend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0, no warnings |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS: 44 files / 331 tests (2 new performance-evidence tests) |
| `npm run build` | PASS: API and worker bundles |
| `npm exec -- prisma validate` | PASS: schema valid |
| `npm exec -- prisma migrate status` | PASS: 16 migrations, database up to date |
| `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS: no difference, exit 0 |
| `npm run perf:budgets` | PASS, exit 0, both budgets met (numbers above) |
| `npm run test:browser` | PASS sprint 2 E01/E02 AR/EN |
| `npm run test:browser:sprint3` | PASS E03/I10/I11 AR/EN |
| `npm run test:browser:sprint4` | PASS E04/F05/F06 AR/EN |
| `npm run test:browser:sprint5` | PASS AR/EN plans/assignment/leave/reassignment |
| `npm run test:browser:sprint6` | PASS E06/E07 AR/EN including caregiver execution/review |
| `npm run test:browser:sprint7-inbox` | PASS staff/customer inbox/preferences/policy flows |
| `npm run test:browser:sprint7-templates` | PASS AR/EN reminder CTA and guest verification regressions |
| `npm run test:browser:sprint7-reports` | PASS E08 AR/EN and audit pagination |
| `npm run test:browser:sprint7-a11y` | PASS all 22 sweep groups (8 route matrices + intake/dialog/caregiver deep checks per locale) |

Working directory `frontend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS: 19 files / 87 tests, including i18n parity |
| `npm run build` | PASS: static pages generated (run after browser suites; `npm run build:browser` was re-run before sweeping after the production fix) |

Root: `git diff --check` PASS. Browser suites use installed Chrome. No
dependencies, images or browser binaries downloaded. The known pg
concurrent-query deprecation warning appears in integration/browser output;
it is not a test failure.

### Failures addressed during the session

- Sweep iterations fixed harness bugs first: a non-existent `/workspace` index
  route (Next default 404 has no lang attribute), non-waiting readiness checks,
  strict-mode multi-match on identical Arabic error copy, and a shared fixture
  visit that AR's start had already progressed for EN. A stale regular
  `.next` build from Session 4's final `npm run build` initially produced
  "service unavailable" portal states; `npm run build:browser` was re-run
  before the first complete sweep.
- The one product defect found (focus return) is described above with its
  red/green evidence.
- Performance script iterations: Node fetch ignores a manual Host header
  (diagnostic probe replaced by direct http.request with an explicit Host);
  the synthetic service config needed full `ServiceConfigSchema` fields; the
  mail-independence test needed owner-role publish rights, the
  post-publish service version, explicit `priceAcknowledged`, and a stepped
  injectable clock to cross exponential retry gates.
- Quote-view assertions initially targeted a SUBMITTED request, where quotes
  are intentionally hidden; the fixture now moves the request to UNDER_REVIEW
  with a status-history row. No production code changed for this.

### Not implemented / remaining risks and gates

- Real Arabic/English screen-reader listening, real-device/AT certification
  and country-specific accessibility acceptance are external/manual items;
  only structural ARIA and keyboard evidence is recorded (ADR-0018).
- Caregiver complete-with-reason flow at 360px remains covered by the sprint 6
  suite (390px, mouse-driven with reflow assertions); the sweep adds the
  keyboard start at 360px. A dedicated keyboard end-to-end completion could be
  added later if the owner wants it.
- Budgets are development-environment measurements only (ADR-0018); no
  production capacity, load or SLA claim. Session 6 deployment must restate
  its own environment.
- Live email provider/domain, private S3, jurisdiction-specific launch review
  and the historical applied-migration checksum caveat from earlier sessions
  remain open owner gates; status/drift checks are not history repair. No
  delegated install/download is pending; no MVP-complete claim is made.
- Review was inline/self-review; no independent external assurance.

### Next-session handoff

After owner review/push/merge, Session 6 starts from current main and
implements only deployment configuration, backup/restore rehearsal, and the
docs 12 release-gate checklist with evidence links. Docker/Coolify image and
dependency downloads above ~50 MB remain owner-run: prepare exact
copy-pasteable commands with working directory and purpose, then wait. Do not
close live-provider/storage/jurisdiction gates from local capture evidence;
keep ADR-0017 report semantics and ADR-0018 measurement posture intact.

## Session 6 — Deployment, backup/restore and release gates

Date: 2026-11-05. Branch `feat/sprint7-deploy-release` from current `main` at
`8ccd124`; Session 5 PR #13 confirmed MERGED through origin/main history and
local main fast-forwarded before branching/coding. Local commits only; push,
merge and release decisions remain the owner's. Plan:
`docs/plans/sprint-07-deploy-release.md`; interpretations in ADR-0019.

### Implemented

- Worker monitoring hook `GET /health/queues` on the existing worker health
  listener: aggregate counts-only snapshot (pending/sending/failed +
  oldest-pending age for `email_deliveries` and `notification_deliveries`,
  unprocessed-outbox depth/age, per-queue BullMQ job counts), Zod contract
  `QueueHealthSnapshotSchema` in `backend/src/contracts/health.ts`, collector
  `backend/src/worker/queue-stats.ts`, handler route with 503
  `QUEUE_STATS_UNAVAILABLE` on collection failure, `startNotifications` now
  exposes its queue counts. No tenant/recipient/payload identifiers; unit
  handler tests plus a real-DB/Redis integration test assert the counts and a
  serialized snapshot containing no synthetic identifiers.
- Production images: `backend/Dockerfile` (node:24-slim, two-stage, one image
  for api + worker + one-shot migrate; non-root; no `.env` baked in) and
  `frontend/Dockerfile` (node:24-alpine, Next standalone server, client built
  same-origin for ADR-0008 routing) with `.dockerignore` files.
- `deploy/docker-compose.prod.yml`: postgres/redis (named volumes,
  healthchecks), one-shot `migrate` service (`prisma migrate deploy`), api,
  worker, web with healthcheck wiring and `service_completed_successfully`
  ordering; fail-closed `${VAR:?...}` secret interpolation; optional object
  storage/antivirus left as commented owner profiles; no host ports published.
  `deploy/.env.example` placeholder inventory; `deploy/README.md` pointer.
- Prisma CLI moved from devDependencies to dependencies so the runtime image
  can run `migrate deploy` (Prisma 7 driver-adapter client has no native
  engine to ship); lockfile updated offline.
- `frontend/next.config.ts` enables `output: 'standalone'` only when
  `NEXT_OUTPUT_STANDALONE=1` (set inside the Dockerfile). This Next version
  (16.4.3) explicitly refuses `next start` with standalone output, and the
  browser harness starts the production server with `next start`, so local
  builds stay default. Both modes verified locally: standalone `node
  server.js` (live 200; `/` 307 → `/ar`; `/ar`, `/en` 200) and default `next
  start` (same checks, refusal warning gone, no standalone emitted).
- Backup/restore runbook + rehearsal on disposable data (docs 15 §6):
  `pg_dump -Fc` 349,800 bytes → `pg_restore` into a fresh database with **zero
  row-count differences** across tenants/staff/customer accounts/patients/
  visits/quotes/requests/outbox/email+notification deliveries/audit/
  _prisma_migrations; `migrate status` up to date and `deploy` no-op on the
  restored DB; rehearsal database and dump removed.
- Migration replay on an empty database (docs 15 §7): 16 migrations applied,
  "All migrations have been successfully applied", drift diff exit 0;
  CI's fresh-DB replay noted. Rollback path documented
  (restore + matching image tag, forward-only migrations, `migrate resolve`
  misuse excluded). Pre-existing local sprint3 checksum caveat remains
  owner-owned and is not repaired or hidden.
- Structured log redaction review: no code change needed; verified
  deny-by-default sensitive-key redaction, caps and HTTP-layer minimalism in
  `src/logger.ts` fenced by `test/logger.test.ts`; residual key-based limits
  documented (docs 15 §4) with the IDs-only payload convention as mitigation.
- `docs/15_DEPLOYMENT_AND_OPS.md` (deployment procedure, secrets inventory,
  health/monitoring matrix, backup/restore, rollback, redaction review,
  external gates) indexed in `docs/README.md`; docs 07/08 updated (queue
  endpoint row; deployment/observability implementation pointers);
  ADR-0019 records interpretations; docs 12 release gates updated with
  evidence links — "Core E2E journeys green in CI" and the jurisdictional
  review stay honestly unchecked.
- A11y harness race fix (test-only, red/green): the caregiver dialog blocks
  closing while the post-start refresh is pending; the harness pressed Escape
  during that window so `toHaveCount(0)` failed at
  `sprint7-a11y.e2e.ts:790` in three runs. The harness now waits for the
  dialog's close button to become enabled before Escape. All 22 groups pass;
  no product authorization/behavior changed.

### Key files

`backend/src/contracts/health.ts`, `backend/src/worker/{health.ts,index.ts,
notifications.ts,queue-stats.ts}`, `backend/test/worker-health.test.ts`,
`backend/test/notifications/queue-stats.integration.test.ts`,
`backend/test/browser/sprint7-a11y.e2e.ts`, `backend/{Dockerfile,
.dockerignore,package.json,package-lock.json}`,
`frontend/{Dockerfile,.dockerignore,next.config.ts}`, `deploy/{docker-compose
.prod.yml,.env.example,README.md}`, `docs/15_DEPLOYMENT_AND_OPS.md`,
`docs/adr/ADR-0019-sprint7-deployment-and-release.md`, docs 07/08/12/README,
`docs/plans/sprint-07-deploy-release.md`.

### Exact verification (commands run separately)

Working directory `backend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0, no warnings |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS: 45 files / 335 tests (4 new monitoring tests) |
| `npm run build` | PASS: API and worker bundles |
| `npm exec -- prisma validate` | PASS: schema valid |
| `npm exec -- prisma migrate status` | PASS: 16 migrations, database up to date |
| `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS: no difference, exit 0 |
| `npm run test:browser` | first invocation failed on one transient `/en/track` navigation (known wildcard-localhost flake, no product change); separate rerun PASS E01/E02 AR/EN and all 10 production UI matrix groups |
| `npm run test:browser:sprint3` | PASS E03/I10/I11 AR/EN and workspace matrices |
| `npm run test:browser:sprint4` | PASS E04/F05/F06 AR/EN and qualification/private-file matrices |
| `npm run test:browser:sprint5` | PASS AR/EN plans/assignment/leave/reassignment |
| `npm run test:browser:sprint6` | PASS E06/E07 AR/EN and completion/history/changes/reflow |
| `npm run test:browser:sprint7-inbox` | PASS staff/customer AR/EN inbox/preferences/policy flows |
| `npm run test:browser:sprint7-templates` | PASS AR/EN reminder CTA and guest verification regressions |
| `npm run test:browser:sprint7-reports` | PASS E08 AR/EN and audit pagination |
| `npm run test:browser:sprint7-a11y` | three runs failed at the caregiver Escape race (see above) until the harness fix; final run PASS all 22 groups; backend `npm run lint` rerun PASS after the harness edit |

Working directory `frontend/`:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | PASS: 19 files / 87 tests including i18n parity |
| `npm run build` | PASS (default output; `next start` compatibility re-verified) |
| `npm run build:browser` | PASS, executed before the browser suites |

Repository root / deployment:

| Command | Result |
| --- | --- |
| `docker compose --env-file deploy/.env.example -f deploy/docker-compose.prod.yml config --quiet` | PASS, exit 0 (all six services resolved; no images pulled) |
| same `config --quiet` without the env file | FAIL closed, exit 1 with required-variable errors for POSTGRES_PASSWORD/SESSION_SECRET/BASE_DOMAIN/PLATFORM_HOST/BACKEND_IMAGE |
| `docker build` (backend, frontend) | NOT RUN — owner-delegated (base image + in-image npm ci downloads exceed ~50 MB); exact commands in docs 15 §5 |
| backup/restore + empty-DB rehearsals | PASS as recorded in docs 15 §6–§7; disposable databases dropped |
| standalone `node server.js` + default `next start` smoke | PASS as recorded above |
| `git diff --check` | PASS, exit 0 |

Known pg concurrent-query deprecation warnings appear in
integration/browser output; they are not test failures. No dependencies,
images, browser binaries or other downloads were made by the agent. The
lockfile update ran with `--package-lock-only --offline` (no network).

### Not implemented / remaining risks and gates

- No image builds, stack bring-up, registry pushes, DNS/TLS setup or log
  shipping were performed — all owner-delegated with exact commands in
  docs 15 §5. Coolify setup is documented but not executed; no live
  deployment exists.
- "Core E2E journeys green in CI" remains unchecked by design: CI runs
  lint/typecheck/unit-integration/migrations/seed/builds, not browser suites.
  Reviews to date are inline/self-review; no independent external audit is
  claimed.
- Live email provider/domain, private S3, ClamAV engine, jurisdiction-specific
  launch review and the historical local-DB checksum caveat remain open owner
  gates. Monitoring alerting is guidance, not deployed alerting
  infrastructure. No MVP-complete, production-readiness or compliance claim
  is made.
- Image size is unoptimized (full node_modules copied for correctness);
  recorded as a known tradeoff in ADR-0019/docs 15, to revisit only with
  owner request.

### Next-session handoff

Sprint 7's six sessions are implemented; remaining work is owner execution
and external gates: run the delegated image builds/stack rehearsal (docs 15
§5), provide email/S3/scanner configuration, schedule backups per docs 15 §6,
decide on CI browser-suite promotion, and complete the jurisdictional launch
review before any real patient data. Keep docs 12's unchecked gates
unchecked until demonstrated; treat ADR-0019's deployment interpretations as
the baseline for deployment review. No further agent sessions are planned for
Sprint 7.

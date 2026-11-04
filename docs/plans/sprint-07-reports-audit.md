# Sprint 7 Session 4 — Reports and audit screens implementation plan

Goal: tenant-scoped operational reports and append-only safe audit views, exactly
Session 4 of sprint-07-sessions.md. Execute inline.

Base: main 9c6858c; Session 3 PR #11 confirmed MERGED through gh before branching.
Branch: feat/sprint7-reports-audit. No installs or external email/storage calls.

## Checklist and interfaces

- [x] Contracts: `contracts/reports.ts` — strict query DTOs (from/to local dates,
  status enum per report, optional serviceId uuid; audit uses limit/cursor only)
  rejecting unknown parameters such as client `tenantId` (I02).
- [x] Permissions: add central actions `reports.read` (Owner/Admin/Coordinator)
  and `agency.audit.read` (Owner/Admin). Agency services re-check through
  `agencyAction` inside the read transaction; platform operators, caregivers,
  customers and guests remain denied.
- [x] Reports service `modules/reporting/reports.service.ts`: aggregate-only
  projections computed with groupBy/raw-sum single queries (no N+1, no row
  dumps): request funnel by status/service, visit status counts plus explicit
  timeliness definition (started = has actualStartAt; onTime = actualStartAt <=
  scheduledStartUtc; late otherwise; notStarted = rest), caregiver load
  (scheduled minutes + status counts, operational only, capped rows).
  Window filters resolve through tenant timezone (visitDateWindow semantics);
  requests window applies to submittedAt, visits to scheduledStartUtc.
  serviceId must resolve inside the tenant, else 404.
- [x] Audit view `GET /agency/audit`: tenant-scoped append-only rows, at/id-desc
  cursor pagination, safe summary projection (actor type/id, action, subject
  type/id, reason, time) — never metadataJson, notes or patient dumps.
- [x] Platform operator aggregates: extend tenant detail with all-time
  request/visit status totals only; operators keep no agency-host report access.
- [x] Controller wiring with no-store + session/CSRF gate; register router in
  server.ts; extend platform service detail projection.
- [x] Tests `test/reporting/`: reconciliation against direct DB counts, filters,
  cross-tenant crafted filters (tenantId param 422, foreign serviceId 404, no B
  rows), role/audience denials, audit tenant scoping and projection keys,
  platform aggregate totals.
- [x] Frontend: `features/reporting/` + workspace pages for reports and audit,
  shared UI only, URL-backed filters, cursor pagination, AR RTL/EN LTR copy in
  new `reporting` namespace; navigation entries; response decoders.
- [x] Browser E08 `test/browser/sprint7-reports.e2e.ts` in AR/EN: seeded counts
  reconcile on screen, filters recompute, tenant B rows never appear, audit
  screen safe summaries; mobile 360px dark pass included.
- [x] Update docs 05/06/07 and ADR-0017; append status evidence; full prescribed
  verification and scoped review. Local changes only; commits/push await an
  explicit owner request.

## Interpretations recorded for docs 07

- Timeliness is start-based among in-scope visits: `started` counts rows with
  `actualStartAt`; `onTime` those with `actualStartAt <= scheduledStartUtc`;
  `late` the remainder of started; `notStarted` the rest. Completion timeliness
  and duration variance stay out of V1 reports.
- Reports windows are inclusive agency-local calendar dates; requests filter on
  `submittedAt`, visits/caregiver load on `scheduledStartUtc`.
- Caregiver load rows cap at 200 and service breakdown rows at 100 (explicit
  truncated flags); operational aggregates only, never clinical judgments.
- Agency audit view shows only rows whose tenantId equals the server-resolved
  tenant; platform-scope rows stay platform-visible only.
- ADR-0017 records these additive contract interpretations; no locked decision
  changes.

## Review focus

Cross-tenant leakage through filters or aggregates; reconciliation drift between
counts and source rows; N+1 on high-volume tables; projection leaks (metadata,
notes, patient rows) in audit views; role confusion (caregiver/coordinator on
audit); platform operator reaching agency analytics; pagination cursor replay.

## Execution ledger

PostgreSQL and Redis confirmed healthy with `docker compose ps` in backend/.
No dependencies, browser binaries, images or assets downloaded. Read-only
reporting adds no migration. Existing tenant locks/live-principal gates reused.

Initial API tests caught missing tenant predicates in the new request/visit
aggregate queries. Explicit predicates corrected them; the I02 regression and
full suite passed afterward. Initial suspended-tenant assertions were corrected
to the existing 401 session-resolution contract, without changing authorization.

Browser E08 caught mobile overflow from a wide table: reports/audit now use the
existing keyboard-focusable `rv-table-scroll` composition. Audit browser row
assertions now await fetched rows. Review then added failing checks for audit
chronological ordering/ties and failed-filter stale totals; at/id cursors and
clearing stale report state resolved them. E08 passes AR/EN desktop light and
360px dark, plus owner audit pagination at 360px in both locales.

Initial combined verification hit the unchanged E03 test's 5000ms timeout under
concurrent lint/typecheck/test load. A standalone full backend `npm run test`
passed 43 files/329 tests with no timeout or assertion changes. Frontend passed
19 files/87 tests. All eight browser suites passed after build:browser. Exact
verification and remaining owner gates: sprint-07-status.md, Session 4.
Scoped maintainability/security review: sprint-07-reports-review.md.

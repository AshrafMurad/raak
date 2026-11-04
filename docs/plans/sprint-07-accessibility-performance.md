# Sprint 7 Session 5 — Accessibility, locale and performance QA implementation plan

Goal: the E09 accessibility/locale sweep, the docs 12 manual UX checklist items and
the docs 12 performance-budget measurements with environment notes, exactly
Session 5 of sprint-07-sessions.md. Defects found by the sweep are fixed with
failing-first regression tests. No new product features, no schema changes, no
dependency installs.

Base: main 1805f20; Session 4 PR #12 confirmed MERGED through `gh pr list`
before branching. Branch: feat/sprint7-a11y-perf. No installs/downloads; browser
suites use installed Chrome. Live email/storage/jurisdiction gates stay open.

## Checklist and interfaces

- [x] Sweep harness `backend/test/browser/sprint7-a11y.e2e.ts` + npm script
  `test:browser:sprint7-a11y`, reusing the established in-process app/Next/ingress
  pattern, AR/EN × mobile-360/desktop, light/dark where suites already do.
- [x] E09 route sweep: `html[lang]`/`html[dir]` per locale, no horizontal document
  overflow (both locales, mobile explicit), no page errors, visible focus ring on
  keyboard focus, skip link reachable, for guest/staff/customer/caregiver key
  routes with seeded synthetic sessions.
- [x] E09 deep checks: dialog focus containment/return and Tab order on a core
  screen; mixed LTR ids/dates/amounts inside Arabic prose carry local direction
  isolation; keyboard-complete core flows (guest intake submit; caregiver
  start/complete at 360px; inbox read) without mouse.
- [x] Manual UX checklist (docs 12): guest plain-language "not confirmed" statement
  present both locales; quote display shows version/currency/units/expiry and no
  payment implication; form errors tied via role=alert + aria-describedby and
  status text announced (role=status); caregiver start/end usable at 360px without
  horizontal scrolling; failed submit shows error and never success.
- [x] Fix every defect the sweep exposes with a failing-first regression test;
  no authorization/privacy/state-machine behavior change. (One defect found:
  caregiver dialog focus return after list re-grouping; fixed in
  `frontend/features/caregiver-visits/` with the sweep as the red-first
  regression.)
- [x] Performance measurement script `backend/scripts/measure-performance.ts`
  (`npm run perf:budgets`, standalone tsx, excluded from vitest): synthetic
  10 tenants × 1,000 visits; paginated visit-list p95 ≤ 500 ms over repeated
  requests; candidate suggestion median ≤ 1 s with 100 caregivers over a two-week
  horizon; record sample counts, warmup and environment notes.
- [x] Email independence integration test: with a hanging email provider, guest
  request and quote accept HTTP transactions complete quickly while mail stays
  queued/pending (docs 12 budget 3).
- [x] Worker idempotency evidence: repeated/concurrent processing of the same
  outbox event yields exactly one notification/delivery set with capped retries
  (extends existing pipeline coverage rather than duplicating it).
- [x] Measurements + environment notes recorded in
  `docs/plans/sprint-07-a11y-perf-measurements.md`; interpretation of the
  measurement methodology recorded as ADR-0018.
- [x] Append Session 5 evidence to sprint-07-status.md; full prescribed
  verification. Local commits only; push/merge await explicit owner request.

## Interpretations recorded for docs 12 / ADR-0018

- "Under defined hardware/network conditions" is defined as this development
  machine (recorded CPU/RAM/OS), loopback HTTP to the in-process app, local
  Docker PostgreSQL, stated sample sizes and one warmup pass; results are
  development measurements, not production capacity claims.
- p95/median are computed over request durations of the same authenticated list
  request repeated sequentially (no client-side concurrency), because the budget
  targets endpoint latency, not throughput.
- The manual UX checklist is verified programmatically where a browser assertion
  can check the criterion; items requiring human assistive-technology judgment
  (real screen-reader announcement quality) are recorded as partially verified
  with the structural ARIA evidence only.

## Review focus

Sweep correctness (false greens: routes that render empty states without data);
fixture authorization shapes matching each portal; RTL isolation assertions
targeting the right nodes; perf script cleanup of bulk synthetic rows; no PHI in
new fixtures; sweep runtime bounded; no weakening of existing suites.

## Execution ledger

Populated during execution; final verification, failures and gates recorded in
sprint-07-status.md, Session 5.

PostgreSQL/Redis confirmed healthy before runs; no installs, browser binaries,
images or assets downloaded; the sweep and performance script use installed
Chrome and local synthetic data only.

Sweep iterations: initial harness failures were harness bugs, not product
defects (non-existent `/workspace` index route; non-waiting readiness checks).
The build under test had been replaced by a regular `frontend npm run build`
after Session 4, so `npm run build:browser` was re-run before sweeping. The
sweep then caught one real defect — caregiver dialog focus return dropping to
`<body>` once the visit list re-grouped after Start — fixed with the live
opener reference; the caregiver check failed red before the fix and passes in
both locales after. Quote-view assertions initially ran against a SUBMITTED
request, where quotes are intentionally hidden; the fixture now moves the
request to UNDER_REVIEW with a status-history row.

Performance script iterations: first run failed on a probe artifact (Node fetch
ignores a manual Host header — measurement went through direct
`http.request`); second run 500'd because the synthetic service config missed
`ServiceConfigSchema` fields. Final run met both budgets (list p95 31 ms;
candidate median 636 ms) and printed the environment record. The mail
independence test needed the owner role for publish, the current service
version after publish, an explicit `priceAcknowledged`, and a stepped
injectable clock to walk the exponential retry gates.

Maintainability review: changed production files remain small and focused
(`frontend/features/caregiver-visits/screen.tsx` ~183 lines,
`visit-execution-panel.tsx` ~256 lines); no cross-domain logic moved; no
review trigger threshold crossed.

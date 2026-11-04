# Sprint 7 Session 5 — measured budgets and sweep evidence

Date: 2026-11-04. All numbers are development-environment measurements of the
local synthetic dataset (docs 12 "targets to measure, not guaranteed claims").
They are not production capacity, load-test, or SLA claims. Commands:
`npm run perf:budgets` (backend/) for budget measurements;
`npm run test:browser:sprint7-a11y` (backend/) for the E09 sweep;
`npx vitest run test/performance/email-independence.integration.test.ts`
(backend/) for the mail-independence and retry-cap evidence.

## Environment notes (recorded per docs 12)

| Item | Value |
| --- | --- |
| OS | Windows_NT 10.0.26200 x64 (owner development laptop) |
| CPU | 12 logical cores, Intel(R) Core(TM) i7-8850H CPU @ 2.60 GHz |
| RAM | 33,921,536,000 bytes total (~31.6 GiB) |
| Node | v24.21.0 |
| Database | PostgreSQL 17.11 (Docker Desktop, Alpine image, local volume) |
| Network | loopback only — direct HTTP to the in-process Express app on 127.0.0.1; no TLS, no external network |
| Method | sequential same-session requests (endpoint latency, not throughput); per-tenant warmup before sampling; p95 = nearest-rank percentile |

## Paginated visit list (docs 12 budget 1: p95 ≤ 500 ms)

`GET /v1/agency/visits` against 10 synthetic tenants × 1,000 visits
(10,001 visits total); 10 warmup + 30 sampled requests per tenant (300
samples, all HTTP 200):

| Metric | Result |
| --- | --- |
| Median | 26 ms |
| p95 | 31 ms |
| Max | 33 ms |
| Budget | **MET** (p95 31 ms ≤ 500 ms) |

## Candidate suggestion (docs 12 budget 2: median ≤ 1 s, 100 caregivers)

`POST /v1/agency/visits/:id/candidates` on the 100-caregiver tenant; visit
inside the two-week horizon; 3 warmup + 30 samples (all HTTP 200):

| Metric | Result |
| --- | --- |
| Median | 636 ms |
| p95 | 649 ms |
| Max | 652 ms |
| Budget | **MET** (median 636 ms ≤ 1 s) |

Honest note: the candidate run costs scale with the per-caregiver
conflict/availability checks (roughly per-caregiver queries at 100 caregivers
≈ 0.6 s here). It is inside budget on this hardware, but it is the least
headroom in the suite; further caregiver growth should be re-measured before
relying on it.

## Email independence (docs 12 budget 3)

`backend/test/performance/email-independence.integration.test.ts`:

- Guest intake POST completes in well under the 2 s assertion bound while no
  email provider exists; the `email.request_access` outbox event remains
  pending (provider I/O is worker-side only).
- Quote acceptance completes (both replayed idempotency-key calls, 200
  ACCEPTED) while a delivery is stuck `SENDING` against a provider that never
  responds; the accept took ~0.1–0.2 s in the recorded run against the 2 s
  bound.
- Verdict: **MET** — business transactions never block on provider response.

## Worker idempotency (docs 12 budget 4)

Same test file:

- Triple concurrent `dispatchNotificationEvent` of one `quote.sent` event
  creates the delivery set exactly once (count stable before/after the
  concurrent replay); the event lands `processedAt`; further dispatch is a
  no-op.
- With a failing provider, retries are bounded: exactly 5 attempts across
  advancing backoff windows, then `FAILED` (`DELIVERY_FAILED`); a further
  attempt does not increment.
- Existing deeper coverage (`pipeline.integration.test.ts` races, lease
  fencing, obsolete-notice suppression) remains green in the full suite.
- Verdict: **MET** — idempotent processing, no unbounded retries.

## List caps / N+1 (docs 12 budget 5)

Verified by code review and existing tests rather than a meter:

- Visit list cursor pagination caps at 20 rows + next cursor
  (`backend/src/modules/scheduling/visit.queries.ts`, `take: 21`).
- Candidate caregiver scan is capped (`take: 200`);
  reports rows are capped with explicit truncation flags; inbox and audit
  views use capped keyset pagination.
- Aggregates use `groupBy`/single queries; no per-row relation fetches on
  high-volume tables were introduced (see sprint-07-reports-review.md and
  Session 2/4 status evidence).

## E09 accessibility/locale sweep results

`npm run test:browser:sprint7-a11y` (installed Chrome, synthetic fixtures,
AR RTL + EN LTR × 360 px dark + desktop light):

- 20 routes × both locales × both viewports: `html[lang]`/`html[dir]` correct,
  no horizontal document overflow, no page errors, keyboard Tab reaches a
  visible focus indicator, workspace/portal skip link is the first Tab stop
  where the frame provides one.
- Keyboard-complete flows (no mouse): guest intake through receipt; staff
  request-queue dialog focus containment/return; caregiver visit open →
  **Start visit** (server-confirmed) → close with focus returned, at 360 px.
- Mixed-direction isolation: inbox timestamps, audit subject ids, reports
  timezone, request emails and quote amounts render inside `bdi`/`dir="ltr"`
  isolation in Arabic.
- Defect found and fixed: closing the caregiver execution dialog after the
  underlying list re-grouped (visit started) returned keyboard focus to
  `<body>` because the captured opener node had been detached. Fix: the screen
  now tracks the live row button per visit and hands the dialog a fresh
  reference (`frontend/features/caregiver-visits/screen.tsx`,
  `visit-execution-panel.tsx`); the sweep's caregiver check failed red before
  the fix and passes after, in both locales.

## Manual UX checklist (docs 12)

| Item | Evidence |
| --- | --- |
| Guest sees that the preferred time is not a confirmed appointment | `catalog.notConfirmed` asserted visible on the intake form and receipt in AR and EN (sweep) |
| Quotes show version, currency, units, expiry; no payment implication | `notPayment`, version heading, per-item price + total, expiry asserted on the verified track view; AR amounts isolated LTR (sweep) |
| Arabic screen-reader announcements for status/errors | Form errors render as `role="alert"` tied via `aria-invalid` + `aria-describedby` with first-invalid focus; status feedback uses `role="status"`; empty-submit and failed-submit alerts asserted in AR and EN. Structural ARIA verification only — real Arabic screen-reader listening remains an external/manual item |
| Caregiver start/end at 360 px without horizontal scrolling | Keyboard start verified at 360 px with overflow assertions mid-flow; full start→complete with reflow assertions remains covered by the sprint 6 suite (390 px) |
| Error/loading never show unconfirmed success | Failed intake submit (aborted route) shows the error alert and never the receipt; caregiver copy states server recording of times; suites re-assert response-gated success feedback |

## Suite totals for this session

- Backend: 44 test files / 331 tests (2 new performance-evidence tests).
- Frontend: 19 files / 87 tests.
- Browser: all 9 suites green (sprint 2–6, sprint 7 inbox/templates/reports,
  new sprint 7 a11y) after rebuilding the browser bundle post-fix.
- Performance script exit code 0 with both budgets met (run recorded above).

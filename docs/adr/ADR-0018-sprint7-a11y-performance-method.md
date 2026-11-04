# ADR-0018 — Sprint 7 Session 5 accessibility sweep and performance measurement methodology

Date: 2026-11-04. Status: Accepted (session-scoped interpretation; no locked
decision changes).

## Context

docs 12 defines performance budgets "under defined hardware/network conditions"
and E09/manual UX checks that mix browser-verifiable criteria with human
assistive-technology judgment. Sprint 7 Session 5 must record honest,
reproducible measurements without claiming production capacity or full screen
reader conformance.

## Decisions

1. The "defined environment" for docs 12 budgets is the owner's development
   laptop (CPU/RAM/OS recorded in
   `docs/plans/sprint-07-a11y-perf-measurements.md`), loopback HTTP to the
   in-process Express app, and the local Docker PostgreSQL instance. Results
   are development measurements; they are not capacity, load-test or SLA
   claims, and production deployment (Session 6) must re-state its own
   conditions.
2. Latency percentiles are computed over sequential same-session requests
   (endpoint latency, not throughput), with per-tenant warmup and fixed sample
   counts (30 sampled requests per tenant for the list budget; 30 for the
   candidate budget after 3 warmups). p95 uses the nearest-rank percentile.
3. The synthetic dataset follows docs 12 exactly: 10 tenants × 1,000 visits;
   the candidate measurement adds 100 caregivers on one tenant with the target
   visit inside a two-week horizon. The script
   (`backend/scripts/measure-performance.ts`, `npm run perf:budgets`) is
   standalone, exits non-zero if a budget is exceeded, and always cleans up
   its synthetic tenants. It is not part of `npm run test`.
4. Email independence and worker retry bounds are asserted as integration
   tests with an injected hanging/failing provider rather than a live
   provider, keeping the fail-closed no-simulated-send posture.
5. The manual UX checklist is verified programmatically where a browser
   assertion can check the criterion. Real Arabic/English screen-reader
   listening, real device testing and country-specific accessibility acceptance
   remain external/manual items and are not claimed.
6. The accessibility sweep runs against real production screens with injected
   synthetic sessions and asserts locale direction, overflow, focus
   visibility, dialog containment/return and mixed-direction isolation per
   docs 10. It is a regression harness, not a WCAG conformance audit.

## Consequences

- Future budget re-measurements should re-run `npm run perf:budgets` on the
  then-current hardware and update the environment table honestly.
- The caregiver candidate path (~0.6 s median at 100 caregivers locally) has
  the least headroom; growth beyond ~200 caregivers requires re-measurement
  (candidate scan already caps at 200).
- Any change to shared focus/dialog behavior should extend
  `backend/test/browser/sprint7-a11y.e2e.ts` rather than ad-hoc checks.

# Sprint 7 Session 3 review

Date: 2026-11-04. Base: 15e2217. Risk: high (worker audience/delivery,
central authorization extension and transactional schedule hooks).

## Coverage

Changed production files, additive migrations, contracts, tests and docs were
reviewed against Session 3 and D01–D23. An independent read-only whole-change
review found one medium issue; its correction was verified test-first and through
the real browser, followed by the full backend suite. No second independent review
was run. Live email/private storage were not exercised.

History: `git log --oneline -10` and baseline blame of delivery lines 19–58 identify
Session 1 d4bd9c1 as the existing authorization/lease/retry implementation. No
security check was removed. Resource/audience resolution now precedes rendering;
the existing current-recipient check still repeats immediately before external I/O.

Production caller inventory (dedicated grep; shell rg unavailable): audience
resolver has 3 calls (dispatcher and two send checks); reminder replacement has
2 calls (shared assignment core and approved-change transaction); email delivery
has 1 worker call. Bulk assignment funnels through that same assignment core.

## Finding fixed

Medium: a guest notification `/track` CTA could show request A from an existing
guest session when the message concerned B. Fix: `/track?request=<B id>` uses the
existing request-specific lookup, returning generic unavailable/verification until
B-specific proof is consumed. Integration assertion observed RED → GREEN; browser
tests verify both languages, actual captured CTA, session A denial and B access
after B verification. No patient grants are created.

## Invariants checked

- Event tenant comes from persisted outbox; resources, proofs, accounts, grants
  and visit generations are looked up within it. Client tenant data never routes work.
- VERIFIED_GUEST central policy permits email only; it creates no AuthSession,
  Notification, customer/patient association or resource-read permission.
- Reminder revision and scheduled-start snapshot suppress stale work at dispatch
  and both email checks. Cancellation/replacement fences pending/sending results;
  already externally delivered bytes cannot be recalled. External sends occur
  outside transactions; provider dedupe remains the stable delivery ID.
- Fixed essential channels ignore optional preferences; optional reminders honor
  current tenant policy and per-principal choices. Suspension pauses operational work.
- Safe generic localized copy takes no patient/visit content; agency labels cannot
  inject headers/bidi overrides. Trusted-origin/path validation rejects redirects.
- No note/task/quote/plan-history guards or CSRF/idempotency semantics changed.
  API-level assignment and approved-change replay/race/rollback tests remain green.

## Maintainability and limits

Template rendering and transaction-scoped reminder replacement have separate small
interfaces. Audience resolution remains cohesive at about 160 lines. Existing
change-request service exceeds the 400–500-line review trigger; this slice adds
only a narrow transactional hook and does not duplicate its scheduling logic.
A broader split remains outside Session 3. No new structural finding requires it.

No generalized legacy identity capability-mail integration, late-visit detector,
historical reminder backfill, locale-selection screen, reports or deployment work.
Account locale is available through existing preference transport; registration
sets new customer language. All matrix templates exist, but not every code has a
new event producer in this slice. Property-based-testing guidance was considered;
no PBT dependency was introduced. Exact offset/boundary and real transaction/race
examples are the verification here, not a claimed exhaustive generated campaign.

Remaining external gates: live provider/domain, private S3 and jurisdictional
launch validation. Existing historical applied-migration checksum caveat persists.
The reported passing local suites do not close those gates or establish compliance.

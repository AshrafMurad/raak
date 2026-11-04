# Sprint 7 Session 3 — Templates and reminders implementation plan

Goal: localized safe notification templates and durable, versioned optional visit
reminders, exactly Session 3 of sprint-07-sessions.md. Execute inline.

Base: main 15e2217; Session 2 PR #10 confirmed MERGED through gh before branching.
Branch: feat/sprint7-templates-and-reminders. Node 24.21.0; existing PostgreSQL
and Redis containers healthy. No installs or external email/storage calls needed.

## Checklist and interfaces

- [x] Templates: `modules/notifications/templates.ts` and localized feature JSON;
  pure renderer takes event code, locale, agency display name, trusted tenant URL.
  Test every docs 11 code in AR/EN, generic subjects, direction isolation, no
  resource contents or arbitrary HTML. Existing identity capability delivery stays
  owned by its existing path; template availability is not legacy-mail delivery.
- [x] Business audience/delivery: extend explicit requester and confirmed event
  mappings, verified request-only guests (email only), current account locale,
  protected essential semantics, tenant-authorized CTA destinations. Tests cross
  tenant IDs, unverified email, revoked grants, suspension and provider retries.
- [x] Reminders: additive schema/migration; transaction-scoped
  `replaceVisitReminders(tx, tenantId, visitId, now)` called after assignment and
  approved changes. Separate reminder revision, default 1440/120-minute offsets
  per channel; custom offset replaces defaults for that channel. Strictly future
  deadlines only. Cancel old pending jobs; dispatch/send recheck revision, status,
  current assignment/grants/policy/preferences. Tests boundary/race/replay and
  reschedule/cancel between queue and send. No external I/O within transactions.
- [x] Register renderer and due-event polling in existing worker; capture-mail
  browser journey opens authenticated tenant CTA in AR/EN; retain provider gate.
- [ ] Update docs 06/07/11, ADR-0016, append status evidence; full prescribed
  verification and scoped maintainability/security review; atomic commits.

## Review focus

Stale email after reschedule; cancelled/started visits; bookings at exact offset;
guest identity incorrectly becoming patient authority; malicious agency names or
tenant link configuration. Each is tested at renderer/dispatcher/delivery or real
PostgreSQL workflow interfaces, not through mocked transaction internals.

## Execution ledger

Required docs 01–14 and existing ADRs read. Root `docker compose ps` initially
failed (compose is in backend); backend invocation confirmed DB/Redis healthy.
No product-decision deviations. Implementation interpretations live in ADR-0016.

Templates and reminders each first failed on their missing implementation, then
passed. The assignment API reminder assertion failed before its transactional hook,
then passed. Five reminder integration scenarios plus existing API denial/race
suites verify the slice. Approved-change tests additionally prove conflict rollback,
replacement/cancellation and replay-stable reminder revisions through the real API.
Quote/replacement workflows now capture their actual dispatched safe mail.

Final independent review found a guest CTA selecting an already-open different
request. Request-specific CTA assertion failed before the fix, then passed; AR/EN
browser tests prove session A cannot display request B until B-specific verification.
No new scope or authorization grant was introduced by that correction.

Verification and migration recovery evidence: sprint-07-status.md Session 3.
Review/remaining operational limits: sprint-07-templates-review.md.

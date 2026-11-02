# Sprint 3 — implementation review and hardening

Date: 2026-11-02. Scope: existing uncommitted Sprint 3 commercial slice against
D08, BR-REQ/PRC/QTE, tenant/ownership/session/CSRF rules, and approved shared UI.
The earlier `sprint-03-status.md` is historical evidence; this follow-up records
newly discovered gaps and their corrections.

## Checklist and invariant fixes

- [x] Read authoritative docs, inspect existing work and local PostgreSQL/Redis.
- [x] Reproduce each of the five backend findings with a real API/PostgreSQL
  failing regression before applying the fix.
- [x] `requesting.service.ts:approve`: an issued formal quote takes precedence
  over the original fixed-price acknowledgment. Latest issued offer must be accepted.
- [x] `commercial/quote-workflow.ts` and `quote.service.ts`: prohibit a second
  commercial agreement and post-acceptance draft/edit/send/replacement actions.
  Prepared drafts are also blocked after another version is accepted. Added
  migration `20261102060000_sprint3_accepted_agreement_guard` enforces one
  ACCEPTED quote per tenant/request without modifying applied migrations.
- [x] Both publication routes validate the exact pending revision's offer at the
  wall-clock expiry boundary (`<= now`). Expired replacement cannot resolve a
  revision or emit a replacement event.
- [x] `request-viewer.ts`: resolve linked customer cookies inside the workflow
  transaction, checking verified email/current session/account/tenant, ownership
  and mutation CSRF. Guest capabilities remain request-specific. Shared portal
  request reads use the same viewer; account claiming stays with Sprint 4.
- [x] `contracts/quotes.ts`: align the total bound with PostgreSQL INTEGER;
  unsupported amounts return 422 rather than database errors. Integration test
  persists exactly 2147483647 and rejects the next value.
- [x] Repeat accept/reject still requires exact-version consent. Acceptance keys
  retain principal scoping and a single audit/outbox emission.
- [x] Customer projection includes `revisionPending`; controls stay disabled
  across refresh. Request-info notes/responses are rendered on timelines;
  revision statuses are translated; accepted requests hide quote editing.
- [x] Request management navigation uses one link styled by shared Button
  (`asChild`), avoiding nested interactive controls. Notifications include the
  documented safe `eventType`.
- [x] Added `--manual` two-window local exploration and `--headed` viewing to the
  existing synthetic browser harness; instructions in `docs/SPRINT_3_LOCAL_CHECK.md`.

## Maintainability and security assessment

Independent source review identified the five original gaps and rechecked the
corrections with no remaining confirmed finding in those paths. Authoritative
requirements were traced through controllers, viewer/policy guards, workflow
transactions, persistence constraints and tests. This is a scoped implementation
review, not a complete external security audit.

`commercial/quote-workflow.ts` now owns the shared lock/load/ownership/expiry
sequence, effective-version rules, accepted-agreement guard, pending-revision
guard and replacement validity. Accept/reject/revision and both publication
routes reuse these checks; the original expiry mismatch cannot be corrected in
only one publication route. Helpers borrow the caller's transaction; idempotency
lookup ordering, audit/outbox atomicity and the public interface are preserved.
The remaining quote service orchestrates domain operations. Request decisions
already share one transition core. Larger UI/service files were reviewed as
cohesive orchestrators; further screen decomposition can follow when those
responsibilities grow, rather than introducing generic CRUD layers here.

Baseline history examined: requesting controller from `edb4a53f`; current review
baseline HEAD `6ac84c0`. No removed authentication check was discovered in the
origin-guard extraction. Direct production call sites: quote service factory 1,
`requireViewer` 7 (quote list/three actions and request read/respond/withdraw),
origin guard 3 calls across 2 router factories. The customer
viewer changes affect request read/respond/withdraw and all portal quote actions;
the full prior auth/intake suites were rerun.

Concrete attack/failure cases covered: wrong-tenant/wrong-request IDs, staff or
caregiver posing as requester, CSRF-free account mutation, revoked/suspended or
unverified account, stale/superseded/expired offer, competing acceptance versus
publication, and second agreement after acceptance. No cross-tenant disclosure
was confirmed in inspected paths. No patient/clinical/scheduling scope was added.

## Verification ledger

Final checks on 2026-11-02 (all exit 0):

| Directory | Exact command | Result |
|---|---|---|
| `backend/` | `npm run lint` | pass |
| `backend/` | `npm run typecheck` | pass |
| `backend/` | `npm test` | 22 files, **181 passed**, 0 skipped |
| `backend/` | `npm run build` | API/worker build pass |
| `frontend/` | `npm run lint` | pass |
| `frontend/` | `npm run typecheck` | pass |
| `frontend/` | `npm test` | 8 files, **39 passed**, 0 skipped |
| `frontend/` | `npm run build` | normal production build passed before final navigation-only change |
| `frontend/` | `npm run build:browser` | final production build passed, same-origin browser configuration |
| `backend/` | `npm run test:browser:sprint3` | final AR/EN E03 + I10/I11; info-note visibility; pending controls across refresh; 8 workspace viewport/theme checks |
| `backend/` | `npm run test:browser` | final E01/E02 AR/EN and 56 prior production route checks pass |
| `backend/` | `npm exec -- prisma validate` | schema valid |
| `backend/` | `npm run migrate` | new additive guard migration applied successfully |
| `backend/` | `npm exec -- prisma migrate status` | 6 migrations, up to date |
| `backend/` | `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | no difference |
| Root | `git diff --check` | pass |

Formatting: `npm exec -- prettier --check` on the changed commercial,
request-viewer/decisions and browser-test files (backend), and commercial/catalog
UI files (frontend) passed. Full argument lists are in the session command log.

Fresh-DB replay: created `raak_sprint3_review_20261102` in the existing local
PostgreSQL container; with a process-local `DATABASE_URL`, ran `npm run migrate`,
`npm run seed`, `npm run migrate`, `npm run seed`, and the exact migrate-diff
command above. All 6 migrations applied from empty; replay had no pending
migrations; seed counts stayed 2 tenants / 1 operator / 3 staff / 1 customer /
2 invitations; no schema difference. Dropped the disposable DB afterwards.

The interactive `--manual` pause itself is owner-run; the automated suite
demonstrates the shared setup and complete journey. No interactive manual
completion or live email-provider validation is claimed.

Known test reliability observation: an early full backend run concurrent with
both builds hit the pre-existing invitation suspension test's timing-dependent
401-versus-403 assertion, then five dependent fixture failures. The unchanged
invitation file passed alone (15/15) and the subsequent full run passed 181/181.
It uses a 100ms sleep (`test/staff/invitations.integration.test.ts:242–255`);
deterministic barrier-based synchronization is deferred. The denial itself
remained fail-closed.

Remaining product gates: live provider/domain verification and Sprint 7 business
event delivery; customer onboarding/claiming belongs to Sprint 4. The interactive
manual session is for owner exploration; automated browser acceptance uses the
same setup with injected email capture. No downloads, commits or deployments.

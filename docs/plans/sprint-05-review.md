# Sprint 5 — scoped security and maintainability review

> Historical pre-stabilization review. The care-plan split is now implemented,
> ADR-0012 is recorded approved, and the current independent findings and
> remediation are tracked in
> `../reviews/2026-11-03-sprint-05-architecture-stabilization-review.md`.

Date: 2026-11-02. Baseline: clean `main` HEAD `749efe3` (same as Sprint 4
review; Sprint 5 work is uncommitted). Scope: new care-plan/scheduling
workflows, shared policy additions, Sprint 4 writer hooks (impact scans),
schema/migration, seed and frontend consumers. Scoped source/test review, not
an independent external audit.

## Findings and disposition

| Finding | Disposition / evidence |
| --- | --- |
| A qualification row marked `VERIFIED` without independent verifier/timestamp could satisfy candidate filters on status alone | Shared eligibility predicate now requires `status='VERIFIED' AND verifiedBy IS NOT NULL AND verifiedAt IS NOT NULL` and unexpired `validThrough` at the visit-local date; applied in `scheduling/filters.ts` and `candidate.service.ts`; clinical approval uses the same shape transactionally |
| Concurrent leave creation vs assignment could double-book or silently strand a committed visit | Leave writers serialize on tenant→caregiver inside their Sprint 4 transaction and run the impact scan inside that lock; assignment serializes tenant→visit→caregiver. Race test accepts exactly one outcome: assignment rejected with `CAREGIVER_UNAVAILABLE`, or committed visit flagged `NEEDS_REASSIGNMENT` — never an unflagged broken assignment |
| Plain `npm run build` silently replaces the same-origin browser bundle, breaking all browser harnesses while app code is correct | Diagnosed live (CORS preflight to `:3001` from the harness origin); documented in the status ledger — browser suites must run after `build:browser`. No production code change |
| Login redirect behavior (`router.replace` to audience destination) and the paired Sprint 4 harness URL assertion were temporarily reverted during review | Restored and re-verified: Sprint 2/3/4/5 browser suites all pass with the redirect in place; frontend lint/typecheck/tests/build re-passed |
| Two unused locals (`config`, test `patch` helper) failed backend lint | Removed; full lint/typecheck/test rerun green |
| `care-plan.service.ts` reached ~859 lines, above the 400–500 review trigger | Cohesive single-domain workflow set sharing lock/snapshot/version helpers; splitting (e.g. lifecycle vs versioning) would split shared transactional helpers without isolating a distinct responsibility. Recorded as a deferred structural concern for Sprint 6, not silently ignored |

No unresolved application-level tenant/history/authorization invariant was
found in the inspected paths.

## Trust boundaries and adversarial cases inspected

- Candidate endpoint is advisory only: no locks, no writes; commit-time
  rechecks (account status, verified qualification, service authorization,
  hard area filter, availability/leave, exact buffer adjacency) run inside the
  assignment transaction against freshly locked rows.
- Assignment/reassignment/bulk share one serialization order
  (tenant → visit → caregivers, UUID-ascending); parallel overlapping
  assignments produce exactly one committed SCHEDULED row (I08 test).
- Occurrence-key partial unique plus tenant-scoped idempotency keys make
  activation and assignment replay-safe; I09 parallel activation yields one
  occurrence set; bulk reports per-row failures without rolling back
  committed rows and without fabricated success.
- Amendment activation cancels only future PLANNED unassigned visits;
  SCHEDULED commitments are skipped, never rewritten or duplicated. Pause/
  cancel require an explicit KEEP/CANCEL disposition; complete refuses while
  future visits remain unresolved.
- Wrong-tenant plan/visit/caregiver IDs return 404; platform, customer and
  caregiver principals are denied on every agency route (I01 coverage).
- Outbox/audit events carry IDs and safe codes only — no patient text,
  clinical instructions, license numbers or emails; assignment history rows
  are append-only.
- No external call occurs inside a DB transaction; seed and fixtures are
  synthetic-only.

## Differential scope and call sites

Changed shared files: `contracts/caregivers.ts` (export reuse),
`modules/auth/permissions.ts` (five new actions, no rule changes to existing
ones), `caregivers/{availability.service,caregiver.service,eligibility}.
ts` (impact-scan hook + moved interval helper with compatibility re-export),
`server.ts` (two router mounts), frontend `lib/i18n.ts`, workspace nav,
`auth-forms.tsx` (login redirect), i18n parity test, plus the Sprint 4
browser harness login assertion.

Sprint 5 production call sites: 20 direct `agencyAction()` calls (12
care-plan service workflows, 4 assignment/list reads, 1 candidate read,
plus the 3 pre-existing caregivers writer sites now also scanning impact).
Central policy remains the single gate; no role-only checks appear in
controllers.

New production files stay focused: care-plan service ~859 lines (see finding
above), assignment service ~341, filters ~196, controllers ~155/~95,
candidate/impact/recurrence/local-time under ~150 each. Frontend splits
contracts, copy, list screens, plan/visit detail and CSS resilience; shared
primitives were reused without new variants.

Verification anchors: `scheduling/filters.ts` (buffer + qualification
predicates), `care-plans/care-plan.service.ts:334` (clinical capability
check), `scheduling/assignment.service.ts:140` (serialized assign),
`caregivers/availability.service.ts` (impact scan inside caregiver lock).
Full command results are recorded in `sprint-05-status.md`.

## Deferred structural concerns

1. Split `care-plan.service.ts` along lifecycle/versioning seams during
   Sprint 6 visit-execution work if it grows further; preserve the shared
   lock/snapshot helpers rather than duplicating them.
2. Consider promoting the buffer/interval predicates in
   `scheduling/filters.ts` into the Sprint 6 execution path so check-in/out
   uses the same math as assignment.
3. ADR-0012 remains proposed: owner confirmation should precede treating its
   interpretations as locked contract.

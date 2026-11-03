# Sprint 5 Architecture Stabilization Review

Date: 2026-11-03

Fixed point: `fefb8e7`

Scope: complete current tracked and untracked worktree, including Sprint 5 and
the pre-Sprint-6 architecture stabilization plan.

## Verdict

**Review-fix continuation:** the original findings below are retained as the
review baseline. Production fixes and added regressions now cover fencing,
atomic item/checkpoint commits, safe failure projections, explicit disposition
locks, qualified caregiver approval, service-authorization impacts/health history,
pagination/filter/selection behavior, centralized clinical policies, stale preview
responses, confirmed-command versus refresh failure, DTO decoding, field errors,
URL context and the approved shared workspace shell. Fresh final verification
is recorded in the stabilization status continuation. Earlier line references
refer to the reviewed snapshot and may have moved after extraction.

**Original verdict: not accepted as complete.** The structural direction was materially better and
all existing automated checks pass, but the implementation has one high-severity
bulk-execution race, several contract/state-policy gaps, user-visible frontend
regressions, and inaccurate final gate claims. Tasks 1-12 should not remain
reported as unconditionally complete until the high and medium findings are
resolved or explicitly deferred by the owner.

## Findings

### High — Unfenced bulk-idempotency takeover permits stale writes

`backend/src/modules/scheduling/assignment.service.ts:252-268` allows a second
runner to take over an expired lease, but the reservation returns no execution
token or generation. Checkpoint and completion writes at `:274-313` update only
by `(tenantId, principalId, key)`, so the original runner remains authorized to
write after takeover.

A slow runner can outlive the 60-second lease, a second runner can resume, and
then both can process/checkpoint the remaining visits. The stale runner can
overwrite newer progress or a completed summary. Existing tests seed an already
dead expired execution; they do not keep the original runner alive after
takeover.

Required proof: issue a fencing token/generation per reservation, require it in
every checkpoint/final update, and add a stale-live-runner test proving rejected
writes after takeover.

### Medium — Approved pause/cancel visit lock order is not implemented

ADR-0012 requires `tenant -> care plan -> affected visits in UUID order`, but
`backend/src/modules/care-plans/care-plan-lifecycle.service.ts:157-175` uses an
unordered `updateMany` and takes no explicit affected-visit locks. The status
report claims this lock order holds at
`docs/plans/sprint-05-architecture-stabilization-status.md:1149-1154`.

The plan lock currently serializes the tested pause/new-assignment race, but the
implementation and evidence do not match the approved transaction contract.

### Medium — Clinical approval denies qualified caregiver-role clinicians

The permission matrix allows a qualified caregiver to approve clinical
instructions (`docs/05_AUTH_AND_PERMISSIONS.md:33`), and ADR-0012 describes the
central permission as an agency-staff audience gate followed by exact
qualification checks. `backend/src/modules/auth/permissions.ts:97-102` permits
only Owner/Admin/Coordinator, so a qualified caregiver is rejected before the
service qualification check. The existing care-plan test codifies the denial
instead of testing the documented qualified-caregiver path.

### Medium — Bulk checkpoints exceed the documented safe allowlist

The contract limits stored summaries to resource IDs and stable operation codes.
`backend/src/modules/scheduling/assignment.service.ts:395-403` persists
`error.message` and spreads untyped `error.details`. This makes privacy depend on
every current and future `ApiError` producer and contradicts the status claim at
`docs/plans/sprint-05-architecture-stabilization-status.md:1155-1158`.

Persist an explicit allowlisted outcome projection rather than arbitrary error
objects.

### Medium — Visit pagination replaces rows and queue toggling drops filters

`frontend/features/visits/hooks/use-visits.ts:53-58` always replaces `visits`.
`loadMore` calls it at `:91-98`, so loading the next cursor discards the first
page. `toggleQueue` at `:100-109` sends only assignment health and silently drops
the visible status/date filters.

No hook or browser test covers append pagination or combined filters.

### Medium — Bulk selection remains actionable after successful assignment

`frontend/features/visits/screens/visits-screen.tsx:110-125` does not clear
`selectedIds` after success. `bulkAssignmentsFor` at
`frontend/features/visits/policies.ts:61-72` does not recheck visit status, so a
second click can submit newly SCHEDULED visits under a new key. The previous
result also remains visible across a later attempt.

### Medium — Care-plan policies are duplicated and permit invalid clinical activation

`frontend/features/care-plans/policies.ts:37-48` permits any current DRAFT after
preview, including an unapproved clinical DRAFT. The render module duplicates
the same rule at
`frontend/features/care-plans/components/plan-version-panel.tsx:73-95` instead
of consuming the policy seam. Several exported policy functions are used only by
tests, so the claimed centralization is incomplete.

The UI presents an activation action the server must reject for clinical plans.

### Medium — Generation previews can become stale after version changes

`frontend/features/care-plans/hooks/use-plan-commands.ts:59-62` has no abort or
generation guard. Version controls remain enabled while preview is pending. A
late response for version N can restore preview after the user selects version
N+1, and the panel then formats it with the newly selected version's timezone.

The existing request-generation tests do not exercise preview commands.

### Medium — Confirmed mutations can be reported as failures

`frontend/features/care-plans/hooks/use-plan-commands.ts:37-46` treats mutation
and post-mutation reload as one failure domain. If the server commits but reload
or parent refresh fails, the UI reports that the action failed and encourages an
unsafe retry. `frontend/features/visits/hooks/use-visit-detail.ts:46-55` has the
same pattern.

Mutation success and refresh failure need distinct states and copy.

### Medium — Frontend response contracts are inaccurate and unchecked

`frontend/features/care-plans/contracts.ts:32-43` makes `CarePlanVersion` extend
form `PlanContent`, requiring fields the backend does not return. The backend
projection uses `weekdaysJson` and `taskTemplatesJson` at
`backend/src/modules/care-plans/care-plan.types.ts:39-58`.

`frontend/features/visits/contracts.ts:35-41` inherits mandatory `carePlanId`,
while backend visit detail returns nested `carePlan` without that scalar at
`backend/src/modules/scheduling/visit.queries.ts:57-76`.

API adapters use unchecked generic casts, and tests accept intentionally partial
objects. This does not satisfy the design's explicit response-validation seam.

### Medium — Removing service authorization does not flag scheduled visits

`backend/src/modules/caregivers/caregiver.service.ts:267-303` replaces service
authorizations without calling the impact scanner. Existing scheduled visits can
remain `assignmentHealth=OK` after their caregiver loses authorization, even
though new assignment correctly fails the hard filter.

Add an atomic impact scan and a test proving affected visits become
`NEEDS_REASSIGNMENT` without silent reassignment/cancellation.

### Medium — Final architecture/evidence claims are broader than the implementation

The final report claims one intentional backend cross-domain dependency, but
caregiver services directly import scheduling internals. It claims JSX contains
no endpoint orchestration, while that is true only for the newly split care-plan
and visit modules; deferred catalog/commercial/people/auth render files still
contain it. It also claims only safe checkpoint data and the approved pause lock
order, contradicted above.

The final gate must be scoped accurately, and stale Sprint 5 status/review files
must be reconciled with the completed extraction.

### Low — Assignment-health healing lacks history/version evidence

`backend/src/modules/scheduling/impact.service.ts:50-77` audits/outboxes the
transition to `NEEDS_REASSIGNMENT`, but healing back to `OK` has no audit/outbox.
Neither transition increments the visit optimistic version. A stale client may
not detect health changes, and warning removal has no history.

### Low — Form validation feedback is not field-associated

Care-plan validation is reduced to a generic alert. Inputs do not receive
field-level errors, `aria-invalid`, `aria-describedby`, or first-error focus,
contrary to the approved form requirements. The lifecycle dialog also bypasses
the extracted lifecycle validator for some cases.

## Confirmed Improvements

- Shared workspace ownership has moved out of `features/catalog`.
- Care plans and visits are separate frontend modules with public screen exports.
- New care-plan/visit rendering modules contain no endpoint strings or direct
  `apiRequest` calls.
- Backend care-plan workflow families are split behind a small composition
  facade.
- Visit queries no longer live in assignment command implementation.
- Tenant-scoped linkage and inactive-parent new-assignment guards have focused
  denial/race tests.

## Fresh Verification

All commands below were run during this review on 2026-11-03.

| Directory | Command group | Result |
| --- | --- | --- |
| `backend/` | `format:check`, `lint`, `typecheck`, `test`, `build` | Passed; 33 files / 257 tests; API and worker built. Existing `pg` concurrent-query deprecation warnings remain. |
| `frontend/` | `format:check`, `lint`, `typecheck`, `test`, `build:browser`, `build` | Passed; 15 files / 72 tests; 44 pages generated. |
| repository | `npm --prefix frontend run build:browser` then `npm --prefix backend run test:browser:sprint5` | Passed in Arabic and English using installed Chrome. |
| repository | `git diff --check HEAD` | Passed. |

Passing checks do not cover the high-risk stale-runner takeover or the listed
frontend interaction failures. No production file was modified by this review.

## Coverage Limits

The review deeply traced care-plan/scheduling/caregiver transaction paths and the
new frontend modules. It did not independently adversarially retest every auth,
catalog, commercial, patient or document behavior included in the large dirty
worktree. The worktree combines prior Sprint 5 implementation and stabilization,
so review/rollback boundaries remain difficult until changes are curated.

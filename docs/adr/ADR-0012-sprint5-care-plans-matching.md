# ADR-0012 — Sprint 5 care-plan/matching contract interpretations

Date: 2026-11-03.
Status: amended and owner-approved 2026-11-03. The architecture-stabilization
amendment below supersedes conflicting Sprint 5 implementation behavior; Tasks
2-4 of the approved stabilization plan must implement it before structural
movement.

## Context

docs 04 BR-PLAN/BR-SCH, docs 06/07/08 and ADR-0009–0011 leave several Sprint 5
mechanics unspecified: how the `care_plan.clinical_approve` capability (A06)
is evidenced, DST disambiguation semantics, amendment occurrence replacement,
pause/cancel future-visit dispositions, candidate ranking definitions, and the
exact lock set shared between assignment and leave/settings writers. The
sprint must not guess silently.

## Decisions

1. **Clinical approval capability.** Central registry action
   `careplans.clinical_approve` is an agency-staff audience gate only; the
   service boundary additionally requires the approver's linked Caregiver
   profile to hold a VERIFIED qualification, not expired at the approval
   date, whose code the plan's service requires. Approval binds an exact
   version; any later draft/edit invalidates activation until re-approval.
   CLINICAL services require approval before activation; NON_CLINICAL
   services activate without it. Titles/roles alone never confer the
   capability.
2. **DST.** Nonexistent (gap) local times are always rejected with
   `RECURRENCE_TIME_INVALID`. Ambiguous (fold) times are rejected by default;
   a plan version stores an explicit `dstResolution` of `REJECT` (default),
   `EARLIEST` or `LATEST`, chosen when the draft is written and snapshotted.
   No silent wall-clock shifting ever occurs.
3. **Amendment replacement.** Activating version vN of an ACTIVE plan cancels
   future PLANNED unassigned visits of prior versions with local date ≥
   vN.validFrom, then generates vN occurrences, skipping dates where this plan
   still has a non-cancelled visit. SCHEDULED/IN_PROGRESS/COMPLETED visits and
   all prior approved/activated versions are immutable history. Visit
   snapshots (tasks, service names, timezone, area) are never rewritten.
4. **Pause/cancel dispositions.** `pause` and `cancel` carry an explicit
   `plannedVisitsAction: KEEP | CANCEL` for future PLANNED unassigned visits;
   confirmed SCHEDULED visits are never silently cancelled. `resume` returns
   PAUSED → ACTIVE without regenerating occurrences (D10). `complete` refuses
   while future PLANNED/SCHEDULED occurrences exist.
5. **Ranking.** Deterministic order: primary preference, then lighter load
   (count of SCHEDULED/IN_PROGRESS assignments at query time), then
   same-patient-area coverage, then caregiver ID. Hard area filter keeps
   Sprint 4 semantics (caregiver areas ∩ service areas); patient-area match is
   the soft signal. Documented and unit/integration tested; no numeric
   weights, no AI claims.
6. **Serialization.** Plan-backed assignment writers lock tenant → care plan →
   visit → caregiver(s) (UUID ascending); standalone assignment writers lock
   tenant → visit → caregiver(s). Pause/cancel writers lock tenant → care plan
   → affected visits (UUID ascending). Availability/exception/qualification
   writers keep the Sprint 4 tenant → caregiver order and run the reassignment
   impact scan inside that lock. Candidate/bulk reads are advisory only and are
   revalidated at commit. Bulk assignment commits per visit with explicit
   per-visit outcomes (no all-or-nothing claim).
7. **Version lifecycle.** One open DRAFT version per plan;
   `currentVersion` = highest version number; APPROVED/ACTIVATED versions are
   immutable; activation requires the current version to be APPROVED for
   CLINICAL services.
8. **Assignment lifecycle.** Candidate lookup and new assignment are permitted
   only when a parent care plan is ACTIVE. A retained PLANNED visit under a
   DRAFT, PAUSED, COMPLETED or CANCELLED plan is not newly assignable and
   returns `409 STATE_TRANSITION_INVALID` without plan or patient content.
   Standalone PLANNED visits remain assignable. Every assignment writer
   rechecks this rule after acquiring the approved locks.
9. **Request linkage.** When `serviceRequestId` is supplied, the request must
   be APPROVED and match the plan's exact tenant, patient and agency service.
   Inaccessible or cross-tenant references return privacy-safe
   `404 RESOURCE_NOT_FOUND`; a same-tenant semantic mismatch returns
   `409 STATE_TRANSITION_INVALID`. Validation occurs before plan, version,
   audit or outbox writes. Manual plans with no request remain valid.
10. **Bulk assignment idempotency.** Assignment array order is semantic because
    each item commits independently and may affect later outcomes. Duplicate
    visit IDs are invalid. The canonical request hash preserves input order and
    includes each `visitId`, `caregiverId` and `expectedVisitVersion`, plus the
    top-level `reason`. The first `(tenantId, principalId, key)` request
    atomically reserves execution. A concurrent matching request returns
    `409 IDEMPOTENCY_IN_PROGRESS`; a changed payload returns
    `409 IDEMPOTENCY_CONFLICT`. Each completed per-visit outcome is checkpointed
    using only safe operation data. A later matching replay resumes unfinished
    items without rerunning completed ones, then returns the stable ordered
    result.

## Alternatives considered

- Outbox-driven asynchronous impact scanning: rejected for Sprint 5 — BR-SCH
  and F10 expect the scan in the same serialized transaction as the
  leave/settings change so assignment races cannot miss a conflict.
- A per-staff capability store for clinical approval: deferred — reuses the
  Sprint 4 verified-qualification rows as agency-verified evidence without a
  new permission subsystem.
- Skipping past occurrences at activation: rejected — generation stays
  deterministic over the full inclusive range; coordinators cancel explicitly.

## Impacts

Additive Prisma migration (care plans/versions, visits, visit tasks,
assignment history, partial unique occurrence key, CHECKs); new
`careplans.*`/`visits.read`/`scheduling.manage` policy actions; new agency
routes documented in docs 07; DST/recurrence, approval-denial, race and bulk
partial-outcome tests. The stabilization amendment adds parent-plan assignment,
request-linkage and concurrent/interrupted bulk-idempotency tests plus the
`IDEMPOTENCY_IN_PROGRESS` error code. No public route or request/response field
changes are approved.

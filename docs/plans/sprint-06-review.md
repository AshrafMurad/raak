# Sprint 6 — scoped production review

Date: 2026-11-04. Baseline: `2abfd36` on
`refactor/sprint5-architecture-stabilization`. Review type: focused self-review of
the working diff and new production files, their immediate authorization,
scheduling, persistence and UI dependencies. This is not a whole-repository audit
or an external security certification.

## Coverage and blast radius

- 18 added HTTP endpoints: nine execution/documentation/review routes, seven
  customer/change-queue/decision routes, two policy-setting routes. Their three
  router entry points are mounted by `server.ts`; existing agency visit reads are
  also extended with safe execution/review fields.
- Five central permission actions added; no existing action gate removed.
  Agency/caregiver/customer services call the existing live-principal helpers
  again inside their transactions. Platform operators receive none of the actions.
- One date-window helper has three production consumers (agency, caregiver,
  customer queries). Baseline blame attributes the overwritten lower-bound spread
  to `c10336b`; the replacement retains tenant/object restrictions and fixes both
  bounds plus the final minute of inclusive local dates.
- Shared PortalFrame navigation and staff-login destination affect existing
  portals. Prior Sprint 2–5 real-browser suites were rerun; the Sprint 4 helper's
  two caregiver login assertions now expect the exact F08 caregiver destination.
  Its other permission, file and tenant assertions remain intact.

## Authorization and privacy review

- `backend/src/modules/visits/visit-execution.service.ts:73`: locked scoped visit
  loader rejects another caregiver/unassigned/foreign IDs with 404. Caregiver
  scope rechecks live staff/session and active linked verified profile.
- `backend/src/modules/scheduling/change-request.service.ts:61`: customer
  submission serializes on the scoped visit and requires MANAGE_VISITS; withdrawal
  rechecks the same grant. Request ownership is never an alternate branch.
- `backend/src/modules/scheduling/customer-visit.queries.ts`: explicit VIEW_VISITS
  relation filter and per-object grant check; projections omit notes, task reasons,
  address, full patient rows and completion JSON. Caregiver queries have their own
  minimum projection; agency documentation uses explicit selects.
- Restricted review text is stored in VisitReview, not audit JSON. Audit references
  the review/note ID; completion idempotency summaries contain safe state/times.
  Outbox uses aggregate IDs and empty/minimal payloads, never documentation bodies.
- Strict Zod DTOs reject client actor/tenant/status/time/classification overrides.
  All new cookie-authenticated mutations use CSRF; no source imports from backend
  were introduced into frontend code.

## Transaction/history review and resolved findings

1. Approval needed an explicit caregiver lock and patient-overlap check in addition
   to the existing hard filters. Both are now in the reschedule transaction
   (`change-request.service.ts:443` onward). Existing tenant → plan → visit →
   caregiver serialization is retained. A different-caregiver patient conflict,
   ordinary booking conflict and unavailable-hours proposal leave PENDING/original
   unchanged. Original start **and end**, current state, requester grant and timezone
   are rechecked. Cancellation may remove an unavailable booking; it does not need
   to establish a new eligible appointment.
2. Completed task/note documentation now has an immutable completion snapshot and
   DB UPDATE guards (`20261104110000_sprint6_completion_integrity`). Review changes
   only separate status/version and inserts its own row; corrections insert an
   addendum with author/reason. Original notes and completion data cannot UPDATE.
   Direct-update denial and a real note-save/completion race are covered.
3. Both decision routes require actor/action/target/payload-bound idempotency.
   A missing rejection key was reproduced as a failing test before adding its
   enforcement. No duplicate audit/outbox on decision/completion replay.
4. Combined from/to filters initially replaced the lower bound. A real browser
   failure reproduced the extra older visit; one half-open helper now serves all
   three projections. Unit checks include known 23/25-hour Berlin DST days.
5. Customer withdrawal after revoked authority is denied; approval rechecks the
   current verified active requester and grant. Cross-tenant change IDs are denied
   on both decision paths. No completion/change race can cancel a started visit.

## Responsibility growth, duplication and UI

- Customer visit queries and cutoff/snapshot policy were extracted from change
  orchestration. The remaining change module is near the review-trigger size but
  keeps one cohesive transaction family; no generic CRUD layer or duplicated
  scheduling engine was introduced. Eligibility/availability/buffer rules still
  belong to the existing scheduling/caregiver modules. Settings consumes the
  public impact-scan entry point and locks caregivers in deterministic order.
- Execution and coordinator review are separate modules; note finalization and
  append-only corrections have one repository owner. Transaction boundaries stay
  outside Express transport concerns.
- Frontend HTTP paths/payloads live in feature adapters; read DTOs are runtime
  decoded. Customer/caregiver date formatting moved to a shared `lib` helper;
  shared layout CSS moved out of a caregiver-owned feature. Existing workspace
  ownership and approved primitives remain canonical.
- UI review resolved immediate booking approval by adding the shared confirmation
  Dialog with the exact cancellation/reschedule consequence. Operational day,
  selected opaque visit IDs and queue filters are URL-backed. Reload retention,
  modal focus containment/restoration, light/dark and 360/390/1440px reflow are
  demonstrated in the final Sprint 6 browser run.

## Verification and residual scope

Full backend suite: **36 files / 295 tests**, frontend: **17 files / 81 tests**.
Separate lint/typecheck/build commands and migration checks pass; E06/E07 and
prior Sprint 2–5 browser suites pass using installed Chrome. Exact commands,
failure history and fresh-DB evidence are in `sprint-06-status.md`.

No unresolved high/medium defect was identified in this inspected slice. Existing
private-S3/live-email, general notification/reporting and production-governance
gates remain open. Local old migration-checksum metadata and upstream pg warning
are recorded separately; neither was silently reset or suppressed. Future writers
must preserve the tenant/plan/visit/caregiver lock protocol and immutable history.

# Sprint 5 — Care plans and matching implementation plan

Date: 2026-11-03. Owner request: implement Sprint 5 end to end per
`13_IMPLEMENTATION_PLAN.md` (versioned plan, clinic-qualified approval
capability, recurrence generator/upfront proposals, candidate matching with
primary preference, locked assignment and bulk partial outcomes, buffer and
leave impact scanner). Exit gate: I08, I09 and DST tests pass, E05 in AR/EN.

Locked inputs: D01–D23, BR-PLAN/BR-SCH/BR-VST (docs 04), docs 06/07/08
contracts, ADR-0007..0011. Sprint 4 foundations (verified qualifications,
weekly availability + dated exceptions with revisions, tenant→caregiver lock
order, `agencyAction` live-principal gate) are reused, not duplicated.

## Resolved contract interpretations (ADR-0012)

These fill unspecified mechanics; no locked decision is changed. Recorded in
`docs/adr/ADR-0012-sprint5-care-plans-matching.md` (proposed for owner review;
fail-closed until rejected):

1. **Clinical approval capability (A06):** the central registry gains
   `careplans.clinical_approve` as an audience gate (agency staff only);
   the service boundary then requires the approver to be linked to a Caregiver
   profile holding a VERIFIED qualification, unexpired at approval date, whose
code is required by the plan's service. Approval always targets an exact
   version number. CLINICAL services require approval before activation;
   NON_CLINICAL services activate without clinical approval.
2. **DST contract:** nonexistent local times are always rejected
   (`RECURRENCE_TIME_INVALID`). Ambiguous (fold) local times are rejected by
   default; the plan version stores an explicit `dstResolution`
   (`REJECT` default, `EARLIEST`, `LATEST`) chosen by the coordinator.
3. **Amendment occurrence replacement:** activating version vN of an
   already-ACTIVE plan cancels future **PLANNED, unassigned** visits from prior
   versions whose local date ≥ vN.validFrom, then generates vN occurrences —
   skipping a date when this plan already has a non-cancelled visit on it
   (SCHEDULED commitments are never rewritten or duplicated). Prior
   APPROVED/ACTIVATED versions and past visits are immutable history.
4. **Pause/cancel dispositions:** `pause`/`cancel` take an explicit
   `plannedVisitsAction: KEEP | CANCEL`. CANCEL applies only to future PLANNED
   unassigned visits; SCHEDULED visits are never silently cancelled.
   `resume` returns PAUSED → ACTIVE without regenerating (D10 upfront
   generation).
5. **Ranking definitions (documented, deterministic, tested):** eligible
   candidates sort by (1) `isPrimary` (plan primary caregiver), (2) lighter
   load ascending — load = count of that caregiver's SCHEDULED/IN_PROGRESS
   visits at query time, (3) `sameArea` — patient/visit area ∈ caregiver
   service areas, (4) caregiver ID ascending. Hard area filter = caregiver
   areas ∩ service areas ≠ ∅ (Sprint 4 semantics); patient-area coverage is
   the soft preference. No numeric weights, no AI claims.
6. **Assignment serialization:** all assignment/reassignment writers lock
   tenant → visit → caregivers in UUID-ascending order; leave/settings writers
   keep Sprint 4's tenant → caregiver order and run the impact scan inside
   that lock, so assignment and exception changes serialize on the caregiver
   row. Candidate reads stay advisory (no locks).
7. **Version numbering/lifecycle:** `care_plans.currentVersion` = highest
   version number; exactly one DRAFT version may be open per plan; DRAFT is
   editable, APPROVED/ACTIVATED are immutable; activation requires the
   current version to be APPROVED (CLINICAL) or DRAFT (NON_CLINICAL, approved
   implicitly at activation).

## File map

Backend (create unless noted):

- `prisma/schema.prisma` — add `CarePlan`, `CarePlanVersion`, `Visit`,
  `VisitTask`, `VisitAssignmentHistory` + back-relations; additive migration
  `20261103090000_sprint5_care_plans_visits` (partial unique occurrence key,
  CHECKs, composite FKs, docs 06 indexes).
- `src/contracts/caregivers.ts` (modify) — export `LocalDateSchema`, `clock`.
- `src/contracts/careplans.ts` — CarePlanEvents, SchedulingEvents, all Sprint 5
  DTOs (draft/edit/approve/activate/revise/pause/resume/complete/cancel,
  candidates/assign/reassign/bulk, visit list filters).
- `src/contracts/events.ts` (modify) — re-export the two new event maps.
- `src/contracts/index.ts` (modify) — export careplans.
- `src/modules/auth/permissions.ts` (modify) — add `careplans.read`,
  `careplans.manage`, `careplans.clinical_approve`, `visits.read`,
  `scheduling.manage` to the registry (Owner/Admin/Coordinator tiers; audience
  gate for clinical approval; no customer/caregiver/platform grants).
- `src/modules/common/local-time.ts` — pure IANA tz conversion
  (`localToUtc` with gap/fold detection, `utcToLocal`, `localDateWeekday`)
  built on `Intl`; no new dependency (slow-internet rule).
- `src/modules/common/interval.ts` — `coversInterval` moved from
  caregivers/eligibility (compatibility re-export kept).
- `src/modules/care-plans/recurrence.ts` — inclusive-date expansion, 60-day
  cap (`PLAN_DURATION_EXCEEDED`), DST gap/fold handling, stable
  `occurrenceKey = v<version>|<date>|<ordinal>`.
- `src/modules/care-plans/care-plan.service.ts` — drafts/edit/approve
  (capability check)/activation (idempotent, atomic)/revise/lifecycle/preview.
- `src/modules/care-plans/care-plan.controller.ts` — routes mounted once in
  `src/server.ts` (modify).
- `src/modules/scheduling/candidate.service.ts` — hard filters + ranking
  (advisory read), excluded caregivers with safe reason codes.
- `src/modules/scheduling/assignment.service.ts` — assign/reassign/bulk with
  exact buffer math, transactional rechecks, VisitAssignmentHistory,
  IdempotencyKey (`staff:<id>`), `visit.assigned` outbox + audit.
- `src/modules/scheduling/impact.service.ts` — `scanCaregiverAssignments(tx,…)`
  flags SCHEDULED visits whose foundation (leave/availability/qualification/
  area/status) now fails → `assignmentHealth=NEEDS_REASSIGNMENT` +
  `visit.reassignment_flagged` events; called from caregivers module writers
  (modify `availability.service.ts`, `caregiver.service.ts`) inside their
  caregiver lock; never mutates assignments.
- `prisma/seed-people.ts` (modify) — create-only synthetic draft plan fixtures.

Backend tests: `test/careplans/recurrence.test.ts` (U01–U03 + tz utils),
`test/careplans/careplans.integration.test.ts` (approval denials, stale
version, 60-day, DST, I09 parallel activation, amendments, lifecycle, I01
plan/visit isolation),
`test/scheduling/assignment.integration.test.ts` (U04–U09, I08, leave race,
bulk partials, impact scans, idempotency),
`test/browser/sprint5.e2e.ts` + `npm run test:browser:sprint5`.

Frontend (create unless noted):

- `messages/{ar,en}/scheduling.json` — feature namespace (typed copy module,
  parity test updated).
- `features/scheduling/contracts.ts`, `copy.ts` — DTO types + localized copy
  incl. error-code mapping (`PLAN_DURATION_EXCEEDED`,
  `RECURRENCE_TIME_INVALID`, `SCHEDULE_CONFLICT`, `CAREGIVER_UNAVAILABLE`,
  `QUALIFICATION_INVALID`, `VISIT_VERSION_CONFLICT`, …).
- `features/scheduling/care-plans.tsx` — list + create form.
- `features/scheduling/plan-detail.tsx` — version history, clinical approval,
  activation/generation preview dialog, revise, pause/resume/complete/cancel
  with explicit future-visit disposition.
- `features/scheduling/visits.tsx` — filters (window/status/health), list,
  exception/NEEDS_REASSIGNMENT queue view, bulk selection + partial results.
- `features/scheduling/visit-detail.tsx` — visit projection, tasks, assignment
  history, ranked candidate picker with per-row reasons, individual
  assign/reassign.
- `features/scheduling/scheduling.css` — layout resilience only.
- `components/ui/status-badge.tsx` (modify) — add `paused` and `warning`
  tones (coherent variants; board + consumers updated).
- `app/[locale]/workspace/care-plans/page.tsx`, `app/[locale]/workspace/visits/page.tsx`.
- `features/catalog/workspace-nav.tsx` (modify) — add Care plans and Visits.
- `test/i18n.test.ts` (modify) — scheduling namespace parity.

## Task order (each task ends test-green)

1. Contracts + permissions + schema/migration + `prisma validate`/migrate on
   dev DB; recurrence/local-time unit tests first (U01/U02/U03, fold/gap).
2. Care-plan service + controller: draft/edit/approve/activate/preview/
   revise/lifecycle; integration tests (approval capability denials, stale
   version, I09, 60-day, DST, amendment history, pause/cancel, I01).
3. Scheduling: candidates (ranking tests U07/U08), assignment (U04/U05 exact
   buffer, U09 leave, I08 parallel, idempotency), bulk partials, reassign,
   impact scans hooked into caregivers writers (leave race test).
4. Seed fixtures + browser harness `sprint5.e2e.ts` (E05 AR/EN + layout
   checks) + `test:browser:sprint5` script.
5. Frontend feature (namespace, copy, four screens, nav, StatusBadge tones,
   parity test); lint/typecheck/test/build + build:browser.
6. Full verification ledger (both projects, migration replay on fresh
   disposable DB), docs 06/07 updates, ADR-0012, sprint-05-status.md,
   sprint-05-review.md.

## Invariants checklist (every task re-verifies)

- Server-resolved tenant/principal; `agencyAction` gate + central policy
  recheck in-transaction; wrong-tenant IDs 404; platform/customer/caregiver
  principals denied on agency routes.
- Approved/activated plan versions, completed/cancelled visit rows and
  assignment history are append-only; visit snapshots
  (tasks/service names/timezone/area) never rewritten by later edits.
- Generation only creates PLANNED/unassigned; only commit-time validation
  transitions PLANNED → SCHEDULED; buffer boundary math exact
  (`start < otherEnd + buffer && end + buffer > otherStart`).
- No external calls inside transactions; audit/outbox atomic with every state
  change; idempotency by key + occurrence-key uniqueness.
- Synthetic fixtures only; no PHI in events/audits/logs.

## Boundaries

Visit execution (start/complete/tasks/notes), customer visit change requests,
standalone (care-plan-less) visit creation, general notification delivery,
reports, travel-buffer settings UI and deployment stay with their owning
sprints. Private S3 and live email remain owner-deferred open gates. No
commits/pushes.

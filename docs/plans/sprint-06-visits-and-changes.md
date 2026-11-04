# Sprint 6 — Visits and customer changes: implementation plan

Date: 2026-11-04. Owner scope: `docs/13_IMPLEMENTATION_PLAN.md` Sprint 6 and
the session goal. Baseline: Sprint 5 architecture stabilization (branch
`refactor/sprint5-architecture-stabilization`, Tasks 1–12 + review fixes
verified). D01–D23 locked; ADR-0012 rules are the fail-closed baseline.

## Prerequisite check (per goal)

- Scheduling services exist and are verified: transactional
  assign/reassign/bulk with hard-filter rechecks (`scheduling/filters.ts`,
  `assignment.service.ts`), buffer math, lock order tenant → care plan →
  visit → caregiver, impact scanner, visit/task schema with
  `actualStartAt/actualEndAt/reviewStatus` columns and `PENDING` task
  outcomes. **No blocker.** Sprint 5 lives on an unmerged branch; Sprint 6 is
  implemented on top of that branch, uncommitted, per the no-commit/push rule.
- Deferred gates inherited: private S3 and live email remain owner-open
  (Sprint 4/5 status). Nothing in Sprint 6 depends on them; change/approval
  events are written to the outbox only (delivery is Sprint 7).

## Scope

1. **Visit execution** (docs 04 BR-VST, F08): responsive caregiver visit
   list/detail; assigned-caregiver Start/End with server-owned timestamps;
   required task outcomes `DONE` or `NOT_DONE` + mandatory reason; draft note
   until completion; completion commits an immutable finalized note snapshot;
   separate coordinator review (`reviewStatus`) and audited append-only
   corrections that preserve original notes.
2. **Customer change requests** (docs 04 BR-CHG, F09): authorized
   (MANAGE_VISITS PatientAccess) single-occurrence CANCEL/RESCHEDULE requests;
   agency cutoff policy configuration (separate cancel/reschedule cutoffs,
   `allowLateReview`); server-calculated NORMAL/LATE classification;
   coordinator approve/decline; policy-governed late review; original
   appointment unchanged while PENDING or declined; approval rechecks
   current state, authorization, timezone, caregiver eligibility,
   availability, overlap and travel buffer through the existing scheduling
   services; conflicts keep the pending request and original booking.
3. **Scheduling policy settings**: `GET/PATCH /agency/settings` limited to
   scheduling policy (travel buffer + change cutoffs + late review), audited,
   with the prospective impact scan on buffer changes (BR-SCH). Agency
   identity/timezone/currency settings stay with their owning sprint.

## Out of scope (Sprint 7 unless stated)

Notification delivery/inbox, reports, full agency identity settings UI,
multi-occurrence/recurrence-rule changes from the customer portal, payments,
native apps. No new locked-decision deviations.

## File/module checklist

### Backend

- `prisma/schema.prisma` + additive migration
  `20261104100000_sprint6_visit_execution_changes`:
  - `VisitNote` (`visit_notes`): tenant/visit/author (staff account),
    bodyRestricted, isDraft, isAddendum, parentNoteId?, reason?, finalizedAt?,
    timestamps; unique (tenantId,id); index (tenantId,visitId).
  - `VisitChangeRequest` (`visit_change_requests`): tenant/visit/requester
    (customer account), type, status, urgency, proposedStartUtc?, reason,
    policySnapshotJson, decisionBy?, decisionAt?, decisionReason?,
    withdrawnAt?, timestamps; partial unique one PENDING per
    (tenantId,visitId); index (tenantId,status,urgency).
  - `Tenant`: `changeCancelCutoffHours Int @default(24)`,
    `changeRescheduleCutoffHours Int @default(24)`,
    `allowLateReview Boolean @default(true)` (docs 04 BR-CHG recommended
    6–48h range is recommended; 0–168h is enforced at the API).
- `src/contracts/visits.ts` (new): caregiver visit list query, task outcome,
  note draft, complete, review, correction, change-request submit/withdraw,
  agency queue query, approve/reject bodies; typed response projections.
- `src/contracts/events.ts`: `VisitEvents` (started, completed,
  needs_review, reviewed, corrected, change_requested, change_approved,
  change_rejected, change_withdrawn) + `settings.updated`; payloads carry IDs
  only.
- `src/modules/auth/permissions.ts`: new actions `visits.self_execute`
  (CAREGIVER role gate; service rechecks exact assignment),
  `visits.review` (Owner/Admin/Coordinator), `visits.customer_change`
  (customer audience gate; service rechecks MANAGE_VISITS grant),
  `agency.settings.manage` (Owner/Admin) with `agency.settings.read`
  (Owner/Admin/Coordinator).
- `src/modules/visits/` (new domain, docs 08): `visit-execution.service.ts`
  (caregiver list/detail/start/task/note/complete; idempotent complete),
  `visit-review.service.ts` (review + append-only corrections),
  `visit-note.repository.ts` (draft/finalized note transitions),
  `visits.controller.ts` (`/caregiver/my/visits*`, `/agency/visits/:id/review`,
  `/agency/visits/:id/corrections`).
- `src/modules/scheduling/change-request.service.ts` +
  `change-request.controller.ts` (`/portal/my/visits`, `/portal/my/visits/:id`,
  `/portal/my/visits/:id/change-requests`,
  `/portal/my/visit-change-requests/:id/withdraw`,
  `/agency/visit-change-requests`, `.../:id/approve|reject`).
  Approval reuses `filters.ts` hard-filter rechecks and the ADR-0012 lock
  order; reschedule keeps the assigned caregiver and the original duration.
- `src/modules/agency/scheduling-settings.service.ts` + routes in
  `agency.controller.ts` (GET/PATCH `/agency/settings`).
- `src/server.ts`: mount visits + change-request routers.
- `prisma/seed-visits.ts` (new, create-only): one SCHEDULED seeded visit
  (seeded caregiver, task snapshots), MANAGE_VISITS+VIEW_VISITS grant for the
  seeded customer on seeded patient A1.

### Frontend

- `features/caregiver-visits/` + `app/[locale]/caregiver/visits/`:
  mobile-first (360px) list (date navigation, status sections) and detail
  (tasks, note draft, start/complete); messages `{ar,en}/caregiver-visits.json`.
- `features/customer-visits/` + `app/[locale]/my/visits/`: granted visits
  list, detail with CANCEL/RESCHEDULE dialog, my change requests + withdraw;
  messages `{ar,en}/customer-visits.json`.
- `features/visits/` (existing workspace feature): change-request queue
  screen `app/[locale]/workspace/changes`, review + correction actions and
  finalized-notes/addenda display in visit detail; extend `visits.json`.
- `features/settings/` + `app/[locale]/workspace/settings/`: scheduling
  policy form (buffer, cutoffs, late review); messages `{ar,en}/settings.json`.
- `components/layout/workspace-navigation.tsx`: add changes + settings items
  (workspace.json labels).
- Reuse shared UI (Button, Field/Input/Textarea, Select, Dialog, Feedback,
  StatusBadge, WorkspaceShell/PortalFrame compositions); no new shared
  primitive unless a gap is documented.

## Invariants (must hold; tested)

1. Every query/mutation tenant-scoped from server-resolved context; wrong
   tenant/caregiver/customer IDs → privacy-safe 404; cross-tenant change
   request IDs → 404 (I01 visits domain).
2. Caregiver sees/acts only on visits assigned to their own caregiver
   profile (I07); customer acts only through an active, non-expired,
   non-revoked MANAGE_VISITS grant for the visit's patient (request
   ownership is NOT authority).
3. `SCHEDULED → IN_PROGRESS → COMPLETED` only by the assigned caregiver;
   server owns `actualStartAt/actualEndAt`; repeated start/complete return
   stable results without duplicate audit/outbox.
4. Completion requires every required task classified `DONE` or `NOT_DONE`
   with a reason (U13); completion finalizes the draft note snapshot
   (isDraft=false, finalizedAt=server now).
5. No ordinary transition out of COMPLETED; notes immutable after
   finalization; corrections are append-only addenda with author, reason,
   original preserved (I17).
6. Review is a separate `reviewStatus` transition (NEEDS_REVIEW → REVIEWED)
   that never mutates completion data.
7. One PENDING change request per visit (DB partial unique); SCHEDULED and
   future only; single occurrence (never RRULE/plan-wide).
8. Original scheduled window/caregiver unchanged while PENDING, declined or
   withdrawn (I12); approval rechecks authorization + state + timezone +
   eligibility + availability + overlap + buffer transactionally; conflict →
   actionable 409, request stays PENDING, original unchanged (I13).
9. NORMAL/LATE from server clock vs tenant cutoffs at submission; LATE with
   `allowLateReview=false` rejected at submission; LATE with
   `allowLateReview=true` enters the priority queue (I14) — never direct
   mutation.
10. Approve and reject require `Idempotency-Key`; complete is replay-safe;
    concurrent decisions commit once (matching-key replay is stable; a competing
    different-key decision gets 409).
11. Care-plan recurrence/history untouched by single-occurrence changes;
    visit `version` optimistic concurrency on every mutation.
12. Durable audit + outbox rows commit atomically with every state change;
    payloads carry IDs only.

## Acceptance mapping

| Requirement | Evidence planned |
| --- | --- |
| E06 (caregiver mobile) | `backend/test/browser/sprint6.e2e.ts` AR+EN at 390px via installed Chrome: caregiver login → today → start → tasks DONE / NOT_DONE+reason → note → complete → COMPLETED; coordinator review flag → review → correction |
| E07 (change request) | Same harness: customer my-visits → reschedule request → pending keeps original → coordinator approves conflict-free slot → both sides see update; rejected case preserves slot |
| I01 (visits) | `backend/test/visits/execution.integration.test.ts` + change-request suite: cross-tenant visit/change IDs 404 |
| I07 | Caregiver list/act restricted to own assignments (execution suite) |
| I12/I13/I14 | `backend/test/scheduling/change-requests.integration.test.ts` incl. cutoff boundary, conflict rollback, race |
| I17 | Post-completion note patch denied; append-only correction preserves original (execution suite) |
| U13 | Required NOT_DONE without reason → 422; PENDING required task at completion → 422 |
| Concurrency | Parallel approve race; submit-change vs complete race; parallel complete idempotency |
| Timezone | Cutoff boundary in tenant zone; reschedule DST-gap rejection (`RECURRENCE_TIME_INVALID`) |

## Verification commands (per AGENTS.md; run separately)

`backend/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm exec -- prisma validate`, `npm exec -- prisma migrate status`,
`npm exec -- prisma migrate diff --from-config-datasource --to-schema
prisma/schema.prisma --exit-code`, fresh-DB migrate+seed replay,
`npm run test:browser:sprint6` (plus prior sprint browser suites).
`frontend/`: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`, `npm run build:browser` before browser suites.

## Risks / notes

- Sprint 5 branch is unmerged: Sprint 6 stays uncommitted on the same
  working tree; owner decides merge order.
- Browser harness requires `npm run build:browser` after any plain build
  (documented Sprint 5 pitfall).
- ADR-0013 records Sprint 6 contract interpretations (note routes, portal
  visit reads, settings scope, late-policy gate, corrections as addenda);
  marked for owner review, fail-closed shipped. No locked-decision change.

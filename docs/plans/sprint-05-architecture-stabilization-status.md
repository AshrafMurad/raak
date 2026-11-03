# Sprint 5 Architecture Stabilization Status

Date: 2026-11-03

Plan: `docs/superpowers/plans/2026-11-02-pre-sprint-6-architecture-stabilization.md`

Completed tasks: Task 1, Freeze Decisions and Baseline; Task 2, Enforce Parent-Plan Assignment State; Task 3, Enforce Care-Plan Request Linkage; Task 4, Make Bulk Assignment Idempotency Concurrency-Safe; Task 5, Move Workspace Ownership Out of Catalog; Task 6, Establish Care-Plan Pure Seams; Task 7, Split Care-Plan Orchestration and UI; Task 8, Split Visits from Care Plans; Task 9, Freeze the Backend Facade and Extract Shared Care-Plan Internals; Task 10, Extract Care-Plan Queries and Command Families; Task 11, Separate Visit Queries from Assignment Commands; Task 12, Apply Architecture Gates and Close the Stabilization Sprint
Status: **Tasks 1-12 implemented; independent review found gaps, now remediated in the review-fix continuation below. Sprint 6 has not been started.**

> The chronological task ledgers below record earlier checks and decisions,
> not a repository-wide claim that every existing feature now uses the target
> architecture. The review-fix continuation supersedes the final gate claims
> about checkpoint atomicity, lock acquisition, frontend policy wiring and
> dependency inventory. Historical test counts are retained as historical evidence.

## Review-Fix Continuation — 2026-11-03

The owner requested all confirmed review findings be fixed in the same session.
The current result is verified against the scoped review, not claimed as a full
repository-wide architecture migration or MVP release.

### Implemented corrections

- Bulk execution now has fresh ownership tokens on reservation/takeover; each
  item and finalization locks/checks the token. A stale live runner cannot write
  after takeover. Successful assignments and checkpoints now share a transaction,
  closing the previous commit/checkpoint crash gap. Failed outcomes are allowlisted
  `{visitId,ok:false,code}`; arbitrary error messages/details are never stored.
- `bulk-reservation.ts` owns durable execution, keeping that responsibility out of
  the single-assignment core. Pause/cancel explicitly lock future visit rows in
  UUID order. Plan-backed reassignment locks its parent and affected caregivers;
  it preserves the existing KEEP treatment of confirmed appointments.
- Qualified caregiver-role clinicians may approve after exact-service, current,
  independently verified evidence checks; self-verification is denied. Service
  authorization changes run the prospective impact scanner. Flag/heal changes
  both increment optimistic versions and write audit/outbox evidence.
- Shared caregiver foundation/availability rules now have one policy owner in
  `caregivers/eligibility.ts`. Writers consume the public scheduling impact seam.
- Visit cursor pages append/dedupe. Queue toggling preserves date/status filters.
  Displayed bulk counts and submitted rows use the same eligible selection;
  successful commands clear selection and stale result feedback.
- Clinical activation and lifecycle UI consume canonical policy/validation
  functions. Preview requests are generation-fenced across version changes.
  Confirmed command success is distinct from failed refresh, including creation
  and bulk actions. Initial detail-load errors are surfaced.
- Form/response types are separate and match backend projections. Feature adapters
  decode lists, detail, versions, preview, options and bulk outcomes, rejecting
  malformed responses without echoing their content. Field errors are associated
  with controls and first-invalid focus; lifecycle uses the shared validator.
- Production uses the existing shared `WorkspaceShell` sidebar/header/mobile
  treatment. Filters, selected opaque record IDs and theme are URL-backed.
  Detail/theme changes do not invalidate list filters or discard appended pages.
- Historical status/review ledgers are marked superseded; gate claims are scoped
  to the migrated care-plan/visit domains and actual public cross-domain seams.
  Earlier unrelated formatting is preserved as existing owner work, not undone.

### Regression proof and review

- Bulk tests initially failed on both stale-live-owner execution (returned 200
  instead of 409) and arbitrary stored failure fields; both now pass.
- The clinical policy test initially allowed an unapproved clinical DRAFT;
  the exact-version approved-only clinical branch now passes.
- Expanded real-browser regression assertions cover invalid-field association/
  focus, no clinical-DRAFT activation, delayed preview/version changes, committed
  mutation plus failed read-back, pagination retention, combined filters, URL/back
  restoration, bulk cleanup and opening detail without resetting loaded pages.
- A fresh scoped reviewer found a detail-URL/list dependency regression. The
  browser test reproduced an extra list fetch; memoization now depends only on
  filter primitives and the reviewer confirmed no remaining concrete high/medium
  defects in the inspected remediation.
- Full verification also exposed an existing invitation race test's fixed-delay
  assumption. It now waits for the actual PostgreSQL lock-blocking condition and
  always restores the tenant; its 403/inactive assertions are unchanged.
- Sprint 2/3 browser theme assertions now target the shared `.rv-root`, preserving
  the same theme expectation after workspace/portal shell separation.

### Final fresh verification

| Directory | Exact command | Observed result |
| --- | --- | --- |
| `backend/` | `npm run format:check` | Passed |
| `backend/` | `npm run lint` | Passed |
| `backend/` | `npm run typecheck` | Passed |
| `backend/` | `npm test` | 33 files / 260 tests passed |
| `backend/` | `npm run build` | API and worker built |
| `backend/` | `node_modules/.bin/prisma.cmd validate` | Schema valid |
| `backend/` | `node_modules/.bin/prisma.cmd migrate status` | 11 migrations; database up to date |
| `frontend/` | `npm run format:check` | Passed |
| `frontend/` | `npm run lint` | Passed |
| `frontend/` | `npm run typecheck` | Passed |
| `frontend/` | `npm test` | 16 files / 76 tests passed |
| `frontend/` | `npm run build` | Passed; 44 pages generated |
| `frontend/` | `npm run build:browser` | Passed; relative API browser fixture built |
| `backend/` | `npm run test:browser:sprint5` | Expanded Arabic/English journey and regressions passed |
| `backend/` | `npm run test:browser` | E01/E02 AR/EN and 56 production route/theme/viewport checks passed |
| `backend/` | `npm run test:browser:sprint3` | E03/I10/I11 AR/EN and commercial route matrix passed |
| `backend/` | `npm run test:browser:sprint4` | AR/EN people journeys, caregiver/file fixture flow and populated route matrix passed |

The first full backend run in this continuation failed at the fixed-delay
invitation-race test and cascaded because it left its tenant suspended; the final
full run above passed after deterministic synchronization, without weakening
production authorization or test assertions. Existing `pg` concurrent-query
deprecation warnings remain. No new migration, dependency download, commit or
deployment was performed. Live private-storage/email gates remain externally open.

## Decision Freeze

ADR-0012 was amended and owner-approved on 2026-11-03. The approved rules are:

- only ACTIVE parent care plans permit candidate lookup and new assignment;
  standalone PLANNED visits remain assignable;
- supplied service requests must be APPROVED and match the exact tenant,
  patient and agency service before any write;
- plan-backed assignment locks tenant -> care plan -> visit -> caregivers,
  while pause/cancel locks tenant -> care plan -> affected visits in UUID order;
- bulk assignment order is semantic, duplicate visit IDs are invalid, and the
  request hash includes ordered visit/caregiver/version tuples plus `reason`;
- the first same-key bulk request reserves execution; a concurrent matching
  request returns `IDEMPOTENCY_IN_PROGRESS`, while a changed payload returns
  `IDEMPOTENCY_CONFLICT`;
- completed bulk rows are checkpointed and matching replays resume only
  unfinished rows before returning the stable ordered result.

`docs/07_API_CONTRACT.md` records these approved semantics. No public route or
request/response field changed. Tasks 2-5 implemented the assignment, linkage,
idempotency and shared-workspace slices.

## Fresh Verification Evidence

Commands were run from the listed project directory on 2026-11-03. A command is
not reported as passing unless its observed exit code was 0.

| Directory | Command | Exit | Observed result |
| --- | --- | ---: | --- |
| `backend/` | `npm run lint` | 0 | ESLint completed with no findings. |
| `backend/` | `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `backend/` | `npm test` | 0 | 29 files and 230 tests passed. Vitest also emitted the existing `pg` client concurrent-query deprecation warning. |
| `backend/` | `npm run build` | 0 | Built `dist/index.js` and `dist/worker.js`. |
| `frontend/` | `npm run lint` | 0 | ESLint completed with no findings. |
| `frontend/` | `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `frontend/` | `npm test` | 0 | 8 files and 40 tests passed. |
| `frontend/` | `npm run build` | 0 | Next.js compiled, typechecked and generated all 44 static pages. |
| `frontend/` | `npm run build:browser` | 0 | Rebuilt the browser fixture with a relative API base as required by the split-port harness. |
| `backend/` | `npm run test:browser:sprint5` | 0 | Arabic and English U01-U06/U09/U10/F10 workflow and route matrices passed using installed Chrome. |

Docker Desktop 29.8.2 was started from the existing local installation. Existing
`postgres:17-alpine` and `redis:8-alpine` images started without downloads and
were healthy on `localhost:5433` and `localhost:6380`. Installed Chrome was used;
no browser or package download was attempted.

The first browser invocation exited 1 at the initial login response wait because
the immediately preceding normal frontend build embedded the local development
API port `3001`, while the browser harness ingress uses `3130`. The documented
`npm run build:browser` prerequisite rebuilt with a relative API base; the
unchanged browser command then exited 0 with both locale matrices passing.

## Architecture Gates

- Domain ownership: **pass for the Task 1 documentation slice**. The approved
  rules name care plans and scheduling as the owning domains.
- Responsibility/depth: **pass for the Task 1 documentation slice**. No
  production module changed and no new shallow interface was introduced.
- Contracts/state: **pass for decision freeze, implementation pending**. The
  API contract and ADR agree; Tasks 2-4 must supply code and tests.
- Security/transactions: **pass for decision freeze, implementation pending**.
  Tenant privacy, lock order, no-partial-write linkage and safe checkpoint data
  are explicit; current implementation is not yet claimed compliant.
- Verification: **pass**. Backend and frontend lint, typecheck, full tests and
  builds pass; the existing Sprint 5 browser baseline passes in Arabic and
  English using installed Chrome and restored local PostgreSQL/Redis services.

## Task 2 — Parent-Plan Assignment State (2026-11-03)

Implemented the approved ADR-0012 decision 8 semantics:

- New `backend/src/modules/care-plans/care-plan-assignment-policy.ts` producing
  `isCarePlanAssignable(status)` and `lockAssignableCarePlanForVisit(tx,
  tenantId, carePlanId)`. The lock function takes the tenant-scoped plan row
  lock and rechecks assignability at that linearization point; rejection is
  `409 STATE_TRANSITION_INVALID` with no plan or patient content.
- `assignment.service.ts` commit-time core now locks the parent plan before the
  visit for new assignments (tenant → care plan → visit → caregiver), so a
  concurrent pause/cancel can never slip between the check and the commit.
  Reassignment of an already-confirmed SCHEDULED visit is unchanged, matching
  the approved pause/cancel KEEP disposition.
- `candidate.service.ts` rejects candidate lookup for visits whose parent plan
  is not ACTIVE (advisory read; commit still revalidates).
- New `backend/test/scheduling/plan-lifecycle-assignment.integration.test.ts`
  (10 tests) covers ACTIVE/DRAFT/PAUSED/COMPLETED/CANCELLED assignment,
  standalone assignability, candidate denial, privacy-safe error bodies, no
  partial writes on rejection, pause/cancel KEEP preservation plus blocked
  later assignment, and the pause/assignment race restricted to the two
  approved serializations.

### Fresh Verification Evidence (Task 2)

Commands run from `backend/` on 2026-11-03; exit code 0 observed for every
listed passing command.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm test -- test/scheduling/plan-lifecycle-assignment.integration.test.ts` (before implementation) | 1 | Red: 7 failed / 2 passed — DRAFT/PAUSED/COMPLETED/CANCELLED assignment returned 200, inactive-parent candidates returned 200, pause/cancel-KEEP retained visits were assignable. |
| `npm test -- test/scheduling/plan-lifecycle-assignment.integration.test.ts` (after implementation) | 0 | 10 passed (includes the race test; run twice, both serializations accepted). |
| `npm test -- test/scheduling/assignment.integration.test.ts` | 0 | 8 passed — travel-buffer, qualification, leave-race and bulk replay behavior unchanged. |
| `npm run lint` | 0 | ESLint completed with no findings. |
| `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |

### Task 2 Architecture Gates

- Domain ownership: **pass**. The assignment policy is owned by care-plans;
  scheduling consumes only its public interface. New cross-domain dependency:
  `scheduling → care-plans` via `care-plan-assignment-policy.ts` (intended seam
  named by the plan; no reverse import, no cycle).
- Responsibility/depth: **pass**. One canonical policy/check shared by writers
  and the advisory read; no duplicated lifecycle logic; no pass-through wrapper.
- Contracts/state: **pass**. No route, request or response field changed; the
  approved stable code `409 STATE_TRANSITION_INVALID` is reused.
- Security/transactions: **pass**. Tenant-scoped plan lock precedes the visit
  lock (ADR-0012 decision 6 order); errors carry no plan/patient content;
  failed assignments write no history/audit/outbox rows (asserted).
- Verification: **pass**. Red-then-green demonstrated for the focused suite;
  existing scheduling suite, lint and typecheck pass.

## Task 3 — Care-Plan Request Linkage (2026-11-03)

Implemented the approved ADR-0012 decision 9 semantics in the create workflow:

- `backend/src/modules/care-plans/care-plan.service.ts` now loads the supplied
  request by exact `(tenantId, id)` inside the create transaction, before any
  plan/version/audit/outbox write. A nonexistent or cross-tenant reference keeps
  the privacy-safe `404 RESOURCE_NOT_FOUND`. A same-tenant request that is not
  APPROVED, or whose `patientId`/`agencyServiceId` differs from the plan's, is a
  semantic mismatch and returns `409 STATE_TRANSITION_INVALID` with no request,
  patient or service content in the error.
- Manual plans with `serviceRequestId: null` are unaffected (pinned by both the
  new and the existing care-plan suites).
- New `backend/test/careplans/care-plan-linkage.integration.test.ts` (7 tests)
  covers the approved same-patient/service happy path, the unlinked (no
  patient) request, another same-tenant patient, another same-tenant service,
  a same-tenant non-APPROVED request, the cross-tenant 404, and the
  no-partial-write invariant (plan/version/audit/outbox counts unchanged after
  a rejected linkage).
- Behavior now matches the Task 1-approved `docs/07_API_CONTRACT.md` linkage
  text; no contract, route, request or response field changed.

Note: previously a same-tenant request that was merely not APPROVED returned
404 (status folded into the lookup filter). Decision 9 validates
`status === 'APPROVED'` together with exact patient/service and classifies
same-tenant failures as semantic mismatch, so the guard now distinguishes
inaccessible (404) from visible-but-not-linkable (409). Care-plan creation
remains gated by `careplans.manage`, whose audience (Owner/Admin/Coordinator)
already manages requests, so no additional information is exposed.

### Fresh Verification Evidence (Task 3)

Commands run from `backend/` on 2026-11-03; exit code 0 observed for every
listed passing command.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm test -- test/careplans/care-plan-linkage.integration.test.ts` (before implementation) | 1 | Red: 5 failed / 2 passed — unlinked, wrong-patient, wrong-service and no-partial-write cases returned 201; the same-tenant non-APPROVED case returned 404 instead of 409. |
| `npm test -- test/careplans/care-plan-linkage.integration.test.ts` (after implementation) | 0 | 7 passed. |
| `npm test -- test/careplans/careplans.integration.test.ts` | 0 | 12 passed — existing create/approve/activate/amend/lifecycle behavior unchanged; manual plans without a request remain valid. |
| `npm run lint` | 0 | ESLint completed with no findings. |
| `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `npm test` (full suite) | 0 | 31 files and 247 tests passed, including the Task 2 scheduling suites. The existing `pg` client concurrent-query deprecation warning remains. |

### Task 3 Architecture Gates

- Domain ownership: **pass**. Linkage stays owned by the care-plans module; no
  cross-domain import was added. The characterized behavior is positioned to
  move unchanged into `care-plan.repository.ts`/`care-plan-draft.service.ts`
  in Tasks 9-10 as planned.
- Responsibility/depth: **pass**. One canonical guard inside the create
  transaction; no duplicated linkage logic and no new shallow wrapper.
- Contracts/state: **pass**. No route, request or response field changed; the
  approved stable codes `404 RESOURCE_NOT_FOUND` and
  `409 STATE_TRANSITION_INVALID` are reused exactly as documented in
  `docs/07_API_CONTRACT.md`.
- Security/transactions: **pass**. The guard runs inside the create
  transaction before any plan/version/audit/outbox write and rejects closed
  (no partial rows asserted); tenant scope is server-resolved; errors carry no
  request, patient or service content.
- Verification: **pass**. Red-then-green demonstrated for the focused suite;
  existing care-plan suite, full backend suite, lint and typecheck pass.

## Task 4 — Bulk Assignment Idempotency Concurrency Safety (2026-11-03)

Implemented the approved ADR-0012 decision 10 semantics:

- `backend/src/contracts/careplans.ts`: `BulkAssignSchema` now rejects
  repeated `visitId` values (422 `VALIDATION_FAILED` at parse time, before any
  reservation or per-visit work) while preserving the 1-100 item bound.
- `backend/src/contracts/errors.ts`: added the ADR-approved
  `IDEMPOTENCY_IN_PROGRESS` stable error code (already listed in docs 07).
- `backend/src/modules/scheduling/assignment.service.ts`: one canonical
  `bulkAssignRequestHash` that preserves assignment input order and includes
  every visit/caregiver/version tuple plus the top-level `reason` (replacing
  the order-blind sorted hash that omitted `reason`). The first
  `(tenantId, principalId, key)` request atomically reserves execution via the
  unique key row before any per-visit commit. Each completed per-visit outcome
  is checkpointed into `responseSummary` immediately after its independent
  transaction, with a short execution lease refreshed per checkpoint. A
  concurrent matching request returns 409 `IDEMPOTENCY_IN_PROGRESS`; a changed
  payload returns 409 `IDEMPOTENCY_CONFLICT`; a matching request arriving
  after the lease lapses takes over the checkpoint row under `FOR UPDATE` and
  resumes unfinished items without rerunning completed ones, then marks the
  row completed and returns the stable ordered result. Pre-stabilization rows
  (no `state` field) keep replaying as final results. Stored checkpoints and
  summaries contain only visit IDs, stable codes and numeric visit state.
- New `backend/test/scheduling/bulk-assignment-idempotency.integration.test.ts`
  (8 tests): concurrent same-key bulk restricted to the two approved
  serializations with at-most-once execution (history/audit/outbox counted),
  completed-replay identity, changed-reason and reordered-payload
  `IDEMPOTENCY_CONFLICT`, duplicate-visit 422 with zero writes, deterministic
  in-flight `IDEMPOTENCY_IN_PROGRESS`, interrupted-run resume with exactly the
  seeded side effects plus one execution of the unfinished visit, and a safe
  stored-summary content pin.
- New `backend/test/contracts/careplans.test.ts`: pure duplicate-visit
  rejection and 1-100 bound pins. The plan's Step 6 fallback names "the
  existing care-plan contract test file", but no dedicated care-plan contract
  (DTO) test file existed, so the case was placed at the exact named path from
  Step 6 following the repo's `test/contracts/` DTO-test pattern.
- `docs/07_API_CONTRACT.md`: the bulk-assign paragraph now records the
  implemented 422 duplicate rejection, checkpoint/lease/resume mechanics and
  safe-summary guarantee. No route, request field, response field or status
  code changed.

Deferred structural note: `assignment.service.ts` is ~525 lines and now mixes
assignment commands with `visitList`/`visitDetail` read models. This split is
owned by Task 11 (`visit.queries.ts`) per the plan; no further extraction was
performed inside Task 4 to preserve the review boundary between behavioral
fixes (Tasks 2-4) and structural extraction (Tasks 9-11).

### Fresh Verification Evidence (Task 4)

Commands run from `backend/` on 2026-11-03; exit code 0 observed for every
listed passing command.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm test -- test/scheduling/bulk-assignment-idempotency.integration.test.ts` (before implementation) | 1 | Red: 6 failed / 2 passed — concurrent same-key produced a second execution pass ending in a 500 (double key create after the pre-reservation race), a changed reason and a reordered payload both replayed 200 (order-blind hash omitting `reason`), duplicate visit IDs executed (200), the in-flight request received `IDEMPOTENCY_CONFLICT` instead of `IDEMPOTENCY_IN_PROGRESS`, and the interrupted run returned 409 instead of resuming. One red iteration also exposed a test fixture availability-window bug, corrected before the recorded red run. |
| `npm test -- test/scheduling/bulk-assignment-idempotency.integration.test.ts` (after implementation) | 0 | 8 passed; stable across 4 consecutive runs (concurrency test included). |
| `npm test -- test/scheduling/assignment.integration.test.ts` | 0 | 8 passed — travel-buffer, qualification, leave-race, single-assign idempotency and existing bulk partial-outcome replay behavior unchanged. |
| `npm test -- test/contracts/careplans.test.ts` | 0 | 2 passed. |
| `npm test` (full backend suite) | 0 | 33 files and 257 tests passed. The existing `pg` client concurrent-query deprecation warning remains. |
| `npm run lint` | 0 | ESLint completed with no findings. |
| `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `npm run build` | 0 | Built `dist/index.js` and `dist/worker.js`. |
| `npx prettier --check` (five touched backend files) | 0 | All matched files use Prettier code style; the two untracked Sprint 5 source files and the two new test files were prettier-formatted, after which the focused suites, full suite (33 files / 257 tests) and build were re-run on the final state with identical passing counts. |

### Task 4 Architecture Gates

- Domain ownership: **pass**. Bulk assignment stays owned by the scheduling
  module; the only new cross-module import remains the planned Task 2 seam
  (`scheduling → care-plans` assignment policy). No reverse import, no cycle.
- Responsibility/depth: **pass**. The canonical hash, reservation, checkpoint
  and completion helpers hide the idempotency protocol behind narrow functions
  composed by `bulkAssign`; no generic CRUD or pass-through wrappers were
  added. The file-length review trigger is recorded above and owned by
  Task 11.
- Contracts/state: **pass**. No route, request or response field changed; the
  approved `IDEMPOTENCY_IN_PROGRESS` code was added to the stable registry
  already documented in docs 07; duplicate visits fail closed with 422 before
  any write.
- Security/transactions: **pass**. The unique key row is the atomic
  reservation linearization point; replay/takeover serializes on the row
  under `FOR UPDATE` without acquiring workflow locks; per-visit commits and
  the assignment lock order (tenant → care plan → visit → caregiver) are
  unchanged; checkpoints persist only safe operation data (asserted against
  caregiver/patient names).
- Verification: **pass**. Red-then-green demonstrated for the focused suite;
  existing scheduling suite, contract suite, full backend suite, lint,
  typecheck and build pass.

## Task 7 — Care-Plan Orchestration and UI (in progress, incomplete)

The care-plan route now imports the feature public interface. Care-plan list and
detail requests use feature API adapters/hooks, the editor applies the existing
60-day/domain validation before submit, care-plan copy/styles have feature-owned
files, and UI confirmation waits for the server response. Browser characterization
was extended for invalid create/edit content, preview-before-activation, exact
version approval visibility, response-pending feedback, preview invalidation,
stale-version feedback, and lifecycle dialog Escape/focus return.

Evidence so far (not a completion claim):

| Command / observation | Exit | Result |
| --- | ---: | --- |
| `npm run test:browser:sprint5` before client validation implementation | 1 | RED: submitting a 61-calendar-day create emitted a POST. |
| `npm run test:browser:sprint5` after the validation implementation | 0 | Both Arabic and English Sprint 5 workflow matrices passed. |
| `npm run typecheck` in `frontend/` | 0 | No diagnostics. |
| `npm run lint` in `frontend/` | 0 | No findings after cleanup. |
| `npm test -- test/care-plans-validation.test.ts test/care-plans-policies.test.ts test/care-plans-api.test.ts test/i18n.test.ts` in `frontend/` | 0 | 4 files / 21 tests passed. |
| `npm test` in `frontend/` | 0 | 12 files / 60 tests passed. |
| `npm run build` in `frontend/` | 0 | Build and static generation succeeded for 44 pages. |
| `npm run build:browser` in `frontend/` | 0 | Browser fixture build succeeded using installed dependencies. |
| Latest `npm run test:browser:sprint5` in `backend/` | 1 | English visit candidate assertion failed because no primary caregiver candidate was returned after the Arabic flow; the fresh reproduction below traced this to overlapping synthetic visits and the correct schedule-conflict filter. |

Fresh reproduction on 2026-11-03: `npm run test:browser:sprint5` from
`backend/` again exited 1 at `backend/test/browser/sprint5.e2e.ts:463` in the
English matrix. The visit has the same scheduled date/time as the Arabic flow's
already-assigned visit. `backend/src/modules/scheduling/filters.ts` correctly
returns `SCHEDULE_CONFLICT` for every caregiver assigned to the overlapping
window; the candidate service correctly exposes no ineligible caregiver. Thus
the current failure is a shared-tenant synthetic fixture collision, not a
care-plan rendering regression. The browser test is a required check and was
left unchanged; Task 7 is blocked at Step 2 until its fixture setup can represent
two independently eligible locale workflows without weakening the conflict
assertion.

Task 7 has not passed its complete verification contract. Its remaining work
includes resolving the latest browser failure, completing the planned focused
care-plan panel extraction and route-screen boundary review, running all final
named checks on the resulting state, and recording fresh architecture-gate
results. Task checkboxes remain unchecked.

### Task 7 follow-up (2026-11-03)

- Reproduced the prior English candidate failure on the current browser baseline:
  the English visit overlapped an Arabic assignment in the same synthetic
  tenant, and the server correctly excluded the conflicting caregiver.
- Isolated the locale workflows with separate synthetic plan date windows in
  `backend/test/browser/sprint5.e2e.ts` (Arabic December 2026, English January
  2027). The candidate eligibility assertion and all other browser assertions
  remain unchanged. `npm run build:browser` followed by
  `npm run test:browser:sprint5` passed for Arabic and English using installed
  Chrome; PostgreSQL emitted its existing concurrent-query deprecation warning.
- Added `use-plan-commands.ts` so the detail rendering module receives semantic
  command methods rather than constructing endpoint payloads or importing
  endpoint adapters. Added `plan-summary.tsx` as a typed, presentation-only
  summary panel. The screen route continues to use the public feature export.
- Fresh frontend evidence after these changes: focused care-plan/i18n tests
  passed (4 files / 21 tests); lint, typecheck and production build exited 0.
  `rg` is not installed or available on PATH in this environment (`where.exe rg`
  returned no match); the equivalent repository grep found no `apiRequest` or
  care-plan endpoint strings under care-plan components/screens.
- Task 7 remains incomplete: the editor, version/preview/draft/lifecycle panels
  have not all been moved into focused rendering modules; stale-response
  characterization and the final named boundary search still need to be
  completed. No Task 7 completion gate is claimed.

## Task 9 — Backend Facade Freeze and Shared Care-Plan Internals (2026-11-03)

Structural extraction only; no route, contract, response shape or workflow
behavior changed.

- New `backend/src/modules/care-plans/care-plan.types.ts`: the explicit
  `CarePlanService` interface with the existing twelve method names (`list`,
  `detail`, `create`, `editDraft`, `approveClinical`, `preview`, `activate`,
  `revise`, `pause`, `resume`, `complete`, `cancel`) plus the serialized
  projection types (`VersionProjection`, list/detail/create/preview/activation/
  lifecycle results) and the shared `VersionRow`. Typecheck now proves the
  facade matches the documented API shapes.
- `createCarePlanService(db, now)` is now explicitly typed
  `: CarePlanService` and the controller composes it as
  `const service: CarePlanService`; controller method calls and every
  serialized output are unchanged.
- New `backend/src/modules/care-plans/care-plan.repository.ts`: scoped loaders,
  locks and projections moved unchanged from the service — `versionProjection`,
  `lockPlan` (plan `FOR UPDATE` before dependent reads/writes), `openDraft`,
  `openDraftGuard`, `serviceSnapshot` (enabled-service config parse with the
  recurring-capability guard) and the exact linkage loader `findLinkedRequest`
  (the Task 3 tenant-scoped request lookup; the 404-miss vs 409-mismatch
  decision remains in the create workflow). No generic CRUD surface exists.
- New `backend/src/modules/care-plans/care-plan-content.ts`: one canonical
  recurrence-content mapping — `PlanContentInput`, `mapPlanContentToSpec`
  (validated input → recurrence spec for create/edit/revise),
  `versionRecurrenceSpec` (stored version JSON → recurrence spec for
  preview/activate, previously duplicated inline in both paths) and
  `parseTaskTemplates`. All five content-consuming paths now use these
  functions.
- `care-plan.service.ts` remains the stable facade (898 → 790 lines) with no
  Prisma loader/projection duplication of the moved logic. `recurrence.ts`,
  the assignment-policy seam and every scheduling import are untouched.

### Fresh Verification Evidence (Task 9)

Commands run from `backend/` on 2026-11-03; exit code 0 observed for every
listed passing command. Docker prerequisites were already healthy
(`raak-postgres-1` on localhost:5433, `raak-redis-1` on localhost:6380); no
package, browser or infrastructure download was attempted.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm run typecheck` (Step 1, interfaces added, before extraction) | 0 | `tsc --noEmit` completed with no diagnostics after fixing one interim TS2352 on the stored idempotency summary cast (`JsonValue` → `ActivationSummary` now via `as unknown as`, a typing-only change on the replay return). |
| `npm test -- test/careplans` (Step 2 baseline, before extraction) | 0 | 3 files and 29 tests passed. |
| `npm run typecheck` (Step 5, after extraction) | 0 | `tsc --noEmit` completed with no diagnostics. |
| `npm test -- test/careplans` (Step 5) | 0 | 3 files and 29 tests passed. |
| `npm test -- test/scheduling/plan-lifecycle-assignment.integration.test.ts` (Step 5) | 0 | 1 file and 10 tests passed. |
| `npm test` (full backend suite, supplementary) | 0 | 33 files and 257 tests passed — identical to the recorded Task 4 baseline counts, evidencing unchanged behavior. The existing `pg` client concurrent-query deprecation warning remains. |
| `npm run lint` | 0 | ESLint completed with no findings. |
| `npm run build` | 0 | Built `dist/index.js` and `dist/worker.js` on the final formatted state. |
| `npx prettier --check` (five touched care-plan files) | 0 | All matched files use Prettier code style; the two modified files were prettier-formatted and the four named Step 5 checks were re-run on that final state with identical passing counts. |

### Task 9 Architecture Gates

- Domain ownership: **pass**. All new modules live inside
  `modules/care-plans`; the controller composes only the facade; no
  cross-domain import was added and the `scheduling → care-plans` assignment
  policy seam is untouched.
- Responsibility/depth: **pass**. The repository hides lock order, draft
  state and projection semantics; the content module is the single
  recurrence-content mapping and removes the previously duplicated inline
  JSON→spec conversions; the facade keeps only workflow composition. No
  pass-through wrapper was created and no generic CRUD exists. The facade
  remains above the 400-500 line review trigger (790 lines); the remaining
  command-family split is exactly Task 10's owned scope, so no further
  splitting was performed here.
- Contracts/state: **pass**. No route, request field, response field or
  status code changed; `CarePlanService` now states the twelve method
  signatures and serialized shapes explicitly and typecheck enforces them.
- Security/transactions: **pass**. Plan `FOR UPDATE` lock order, tenant
  scoping, privacy-safe misses, exact-version checks and audit/outbox writes
  moved verbatim into the repository/facade split without behavioral edits;
  error content and codes are unchanged (pinned by the existing linkage,
  lifecycle and scheduling suites).
- Verification: **pass**. Step 2 demonstrated a green baseline before
  extraction (red/green not applicable to a pure refactor); every Step 5
  named command plus lint, build, the full backend suite (identical 33/257
  counts) and formatting checks pass on the final state.

Deferred: Task 10 extracts the list/detail/preview queries and the draft,
clinical-approval, activation and lifecycle command families behind
`createCarePlanQueries` and four workflow services; Task 11 separates visit
queries from assignment commands. No Sprint 6 visit-execution behavior was
implemented.

## Task 10 — Care-Plan Queries and Command Families (2026-11-03)

Structural extraction only; no route, contract, request field, response shape,
status code or workflow behavior changed. The Task 9 green baseline
(3 files / 29 tests in `test/careplans`) was re-confirmed fresh before the
first extraction, and the focused suite was re-run after every step.

- New `backend/src/modules/care-plans/care-plan.queries.ts`:
  `createCarePlanQueries(db)` owning `list`, `detail` and the read-only
  `generation-preview`. Each query keeps its own `careplans.read`
  `agencyAction` gate, tenant scoping and privacy-safe 404, and projects data
  without mutating plan, version or visit state.
- New `backend/src/modules/care-plans/care-plan-draft.service.ts`:
  `createCarePlanDraftRevisionService(db)` owning `create`, `editDraft` and
  `revise` — recurrence validation, the Task 3 exact-request linkage guard,
  one-open-draft enforcement, version increments and audit/outbox writes stay
  inside each command's single transaction.
- New `backend/src/modules/care-plans/care-plan-clinical-approval.service.ts`:
  `createCarePlanClinicalApprovalService(db, now)` owning `approveClinical` —
  live authorization gate, agency-verified reviewer qualification for the
  exact service, expiry, exact-current-version and draft-only checks, and the
  audit/outbox write remain together in one transaction.
- New `backend/src/modules/care-plans/care-plan-activation.service.ts`:
  `createCarePlanActivationService(db, now)` owning `activate` plus the
  previously module-level `activateVersion` helper — the idempotency-key
  hash/replay protocol, occurrence generation with snapshot writes, amendment
  replacement of future PLANNED visits and the activation audit/outbox write
  stay in one transaction-owning module; `activateVersion` is module-private.
- New `backend/src/modules/care-plans/care-plan-lifecycle.service.ts`:
  `createCarePlanLifecycleService(db, now)` owning `pause`, `resume`,
  `complete` and `cancel` plus the module-private `cancelFuturePlanned`
  disposition helper (KEEP preserves; CANCEL cancels only future unassigned
  PLANNED visits; SCHEDULED is never silently cancelled). The retained-visit
  non-assignability semantics remain owned by Task 2's assignment-policy seam
  (`care-plan-assignment-policy.ts`), which scheduling rechecks under lock at
  commit time; no lifecycle guard was rewritten in assignment terms.
- `backend/src/modules/care-plans/care-plan.service.ts` is now pure
  composition: `createCarePlanService(db, now)` returns the twelve methods
  delegated from the five composed modules, contains no Prisma workflow
  implementation, and its `CarePlanService` return type is unchanged. The
  controller still composes only `createCarePlanService`; a repository-wide
  search confirmed no file imports the new modules except the facade, and the
  moved helpers have no external importers.

### Fresh Verification Evidence (Task 10)

Commands run from `backend/` on 2026-11-03; exit code 0 observed for every
listed passing command. Docker prerequisites were already healthy
(`raak-postgres-1` on localhost:5433, `raak-redis-1` on localhost:6380); no
package, browser or infrastructure download was attempted. Red/green is not
applicable to a pure structural extraction; the check after every step is
`npm run typecheck` followed by `npm test -- test/careplans`.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm test -- test/careplans` (baseline before extraction) | 0 | 3 files and 29 tests passed. |
| `npm run typecheck` + `npm test -- test/careplans` (after Step 1, queries) | 0 / 0 | Typecheck clean; 3 files and 29 tests passed. (One interim TS2741 during the edit — the facade's `preview` delegation line was missing before the first run — fixed before verification.) |
| `npm run typecheck` + `npm test -- test/careplans` (after Step 2, draft/revision) | 0 / 0 | Typecheck clean; 3 files and 29 tests passed. |
| `npm run typecheck` + `npm test -- test/careplans` (after Step 3, clinical approval) | 0 / 0 | Typecheck clean; 3 files and 29 tests passed. |
| `npm run typecheck` + `npm test -- test/careplans` (after Step 4, activation) | 0 / 0 | Typecheck clean; 3 files and 29 tests passed. |
| `npm run typecheck` + `npm test -- test/careplans` (after Step 5, lifecycle) | 0 / 0 | Typecheck clean; 3 files and 29 tests passed. |
| `npm run typecheck` + `npm test -- test/careplans` (after Step 6, composition-only facade) | 0 / 0 | Typecheck clean; 3 files and 29 tests passed. |
| `npm run lint` (final) | 0 | ESLint completed with no findings. |
| `npm run typecheck` (final) | 0 | `tsc --noEmit` completed with no diagnostics. |
| `npm test -- test/careplans test/scheduling` (final) | 0 | 6 files and 55 tests passed — care-plan suites plus scheduling assignment, plan-lifecycle and bulk-idempotency suites (including the Task 2 pause/assignment race and Task 4 concurrency tests). The existing `pg` client concurrent-query deprecation warning remains. |
| `npm run build` (final) | 0 | Built `dist/index.js` and `dist/worker.js`. |
| `npx prettier --check` (six touched care-plan source files) | 0 | All matched files use Prettier code style; no re-run of the suite was required because no file changed after the final verification set. |

### Task 10 Architecture Gates

- Domain ownership: **pass**. All five new modules live inside
  `modules/care-plans`; the controller composes only the facade; no
  cross-domain import was added and the `scheduling → care-plans` assignment
  policy seam is untouched (searched: only the facade imports the new
  modules).
- Responsibility/depth: **pass**. Queries never mutate state; each command
  family hides its transaction, lock order, validation and history ownership
  behind one factory; the facade is composition-only with no pass-through
  Prisma workflow code. The facade dropped from 790 to 43 lines; the largest
  extracted module (activation, ~245 lines) is cohesive and below the review
  trigger. No generic CRUD or shallow wrapper was created.
- Contracts/state: **pass**. No route, request field, response field or
  status code changed; the facade's `CarePlanService` type pins all twelve
  method signatures and serialized shapes, and typecheck enforces delegation
  compatibility. Idempotency replay shapes are unchanged (pinned by the
  activation replay tests).
- Security/transactions: **pass**. Every `agencyAction` gate, plan `FOR
  UPDATE` lock order, tenant scope, privacy-safe miss, exact-version check,
  linkage guard, disposition rule and audit/outbox write moved verbatim into
  the extracted modules; transactions still own their history writes and no
  external call was introduced. Error codes and content are unchanged (pinned
  by the linkage, lifecycle, plan-lifecycle-assignment and scheduling
  suites).
- Verification: **pass**. The green baseline was re-confirmed before
  extraction; the focused suite passed after every one of the six extraction
  steps; and the final named command set (lint, typecheck, focused care-plan
  plus scheduling suites, build) passes on the final formatted state.

Deferred: Task 11 separates visit list/detail queries from assignment
commands (`backend/src/modules/scheduling/visit.queries.ts`), the remaining
structural work before the Task 12 gates and closeout. No Sprint 6
visit-execution behavior was implemented.

## Task 11 — Separate Visit Queries from Assignment Commands (2026-11-03)

Structural extraction only; no route, request field, response shape, status
code or workflow behavior changed. The scheduling baseline (3 files / 26 tests
in `test/scheduling`) was re-confirmed fresh before the first edit, and the
focused suite was re-run after extraction.

- New `backend/src/modules/scheduling/visit.queries.ts`:
  `createVisitQueries(db)` owning `visitList` and `visitDetail`, moved
  unchanged from the assignment service — the `visits.read` `agencyAction`
  gate, tenant scoping, tenant-timezone local-date window conversion with the
  ambiguous-window 422, the 20-row cursor pagination order (take 21, slice 20,
  `nextCursor` = rows[19].id), and the exact sensitive projections (patient
  id/displayName, caregiver id/name, no full patient rows) are byte-identical.
  An explicit `VisitQueries` interface plus exported projection interfaces
  (`VisitListItem`, `VisitListResult`, `VisitTaskProjection`,
  `VisitAssignmentHistoryEntry`, `VisitDetail`) pin the response shapes;
  typecheck enforces the implementations against them.
- `backend/src/modules/scheduling/assignment.service.ts` now owns only the
  assign/reassign/bulk commands; `visitList`, `visitDetail` and the now-unused
  `VisitListQuery`/`localToUtc` imports were removed. Verified by search: the
  file contains no `visitList`, `visitDetail`, `visits.read` or `localToUtc`
  reference.
- `backend/src/modules/scheduling/scheduling.controller.ts` composes
  `createVisitQueries(db)` alongside `createAssignmentService(db, now)` and
  routes GET `/agency/visits` and GET `/agency/visits/:id` through the queries
  module. No generic scheduling facade was added (no second caller needs one);
  route paths, methods, permission gates and response envelopes are unchanged.
- Contract barrels completed: `CarePlanEvents` and `SchedulingEvents` moved to
  the canonical `backend/src/contracts/events.ts` (single home; no duplicated
  constants), `contracts/careplans.ts` keeps the canonical DTO schemas/types,
  and `backend/src/contracts/index.ts` now also re-exports `./events` and
  `./careplans`. The five event importers
  (`assignment.service.ts`, `impact.service.ts`, `care-plan-activation.service.ts`,
  `care-plan-clinical-approval.service.ts`, `care-plan-draft.service.ts`,
  `care-plan-lifecycle.service.ts`) import the event constants from
  `../../contracts/events`. No OpenAPI generation is claimed. Event constant
  values are unchanged; only their module home moved.

### Pre-existing corruption found and repaired during verification

The first post-extraction scheduling run failed 8 of 26 bulk tests (200 with an
empty body, missing `IDEMPOTENCY_CONFLICT`/`IDEMPOTENCY_IN_PROGRESS`,
`data.summary` undefined) while single assign and the plan-lifecycle suites
stayed green. Diagnosis with a temporary out-of-repo diagnostic harness (since
removed) and an unconditional first-statement `throw` inside `bulkAssign`
proved the awaited call resolved `undefined` without ever executing the
function body. Root cause: `assignment.service.ts` had lost the IIFE
invocation — the `bulkAssign` arrow ended `})` instead of `})()` — so the
arrow returned the async function object instead of its promise; `res.json`
then serialized `{}` and the curried type happened to stay typecheck-clean.
The corrupted source predates the Task 11 edits (the Task 11 extraction edits
matched the corrupted text exactly and did not touch the bulkAssign tail); the
initial in-session baseline had passed because vitest served a still-valid
transform of the pre-corruption file until the Task 11 edits invalidated the
cache. The repair restores the characterized Task 4 invocation `})(),` with no
other change to bulk semantics; the full scheduling, care-plan, contract and
backend suites then passed with the recorded counts, and both vitest/vite
transform caches were cleared so no stale transform can mask source state.

### Fresh Verification Evidence (Task 11)

Commands run from `backend/` on 2026-11-03; exit code 0 observed for every
listed passing command. Docker prerequisites were already healthy
(`raak-postgres-1` on localhost:5433, `raak-redis-1` on localhost:6380); no
package, browser or infrastructure download was attempted. Red/green is not
applicable to a pure structural extraction; the baseline check before
extraction is the green `test/scheduling` run.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm test -- test/scheduling` (baseline before extraction) | 0 | 3 files and 26 tests passed. |
| `npm test -- test/scheduling` (immediately after extraction, before repair) | 1 | 8 failed / 18 passed — exposed the pre-existing missing-IIFE-invocation corruption described above (single assign, candidates and plan-lifecycle suites stayed green). |
| `npm test -- test/scheduling` (final, after repair + formatting) | 0 | 3 files and 26 tests passed — identical to the baseline counts. |
| `npm run typecheck` (final) | 0 | `tsc --noEmit` completed with no diagnostics; the barrel re-exports introduced no name collisions and the explicit projection types match the Prisma-inferred shapes. |
| `npm run lint` (final) | 0 | ESLint completed with no findings. |
| `npm run build` (final) | 0 | Built `dist/index.js` and `dist/worker.js`. |
| `npm test -- test/careplans test/contracts/careplans.test.ts` (supplementary) | 0 | 4 files and 31 tests passed — care-plan suites plus the duplicate-visit contract pins after the events import move. |
| `npm test` (full backend suite, supplementary) | 0 | 33 files and 257 tests passed — identical to the recorded Task 9/10 baseline counts, evidencing unchanged behavior. The existing `pg` client concurrent-query deprecation warning remains. |
| `npm test -- test/scheduling/plan-lifecycle-assignment.integration.test.ts` (supplementary) | 0 | 1 file and 10 tests passed — the Task 2 assignment-policy seam is untouched. |
| boundary search in `assignment.service.ts` | 0 matches | No `visitList`, `visitDetail`, `visits.read` or `localToUtc` reference remains in the command module. |
| `npx prettier --check` (eleven touched backend files) | 0 | All matched files use Prettier code style (after formatting `scheduling.controller.ts`); the final named checks were re-run on that formatted state with identical passing counts. |

### Task 11 Architecture Gates

- Domain ownership: **pass**. Visit reads are owned by
  `modules/scheduling/visit.queries.ts`; the controller composes the query and
  command modules directly with no generic facade; no cross-domain import was
  added and the `scheduling → care-plans` assignment-policy seam is untouched.
- Responsibility/depth: **pass**. The assignment service (532 → 419 lines) now
  contains only the assign/reassign/bulk command family with its transaction,
  idempotency and lock-order protocol; the queries module (203 lines) hides
  authorization, tenant scope, local-date conversion and projections behind
  one factory and an explicit interface. The assignment file sits at the
  400-500 line review trigger; review found one cohesive responsibility
  (the bulk idempotency protocol is inseparable from the bulk command it
  guards), so no further split was made in this task. No pass-through wrapper
  or generic CRUD surface was created.
- Contracts/state: **pass**. No route, request field, response field or status
  code changed; the response projections are now explicit, interface-pinned
  types; canonical event constants have the single home `contracts/events.ts`
  with unchanged values; `contracts/index.ts` completes the care-plan/scheduling
  barrel without duplicating constants. OpenAPI generation is not claimed.
- Security/transactions: **pass**. Each query keeps its own `visits.read`
  `agencyAction` gate and tenant scope inside its transaction; list/detail
  projections carry no full patient rows; the command module's lock order,
  idempotency reservation and audit/outbox atomicity moved nowhere (verified
  byte-identical apart from the removed query methods and repaired invocation).
- Verification: **pass**. Green baseline before extraction; focused suite,
  typecheck, lint, build on the final formatted state; supplementary care-plan,
  contract, full-suite and Task 2 lifecycle runs pass with recorded counts.
  The pre-existing corruption was found by these checks, proven with direct
  observation, repaired to the characterized behavior, and re-verified — no
  check was weakened, skipped or edited.

Deferred: Task 12 remains — repository boundary searches, complete frontend
and backend verification with format checks, migration/browser checks, the
five architecture gates, and the follow-up plan boundaries. No Sprint 6
visit-execution behavior was implemented.

## Completion and Next Task

Tasks 1-7 were completed first. Task 8 evidence follows below; after Task 8,
Tasks 1-8 were complete, and the Task 9, Task 10 and Task 11 evidence above
records the backend facade freeze, the queries plus command-family split, and
the visit-query/assignment-command separation. Task 12 closeout evidence is in
the final section below. All twelve tasks are complete; the next plan is Sprint
6, which has not been started.

### Task 7 Step 2 — Fresh browser baseline (2026-11-03)

The existing Sprint 5 synthetic browser workflows were run after the current
care-plan UI characterization changes. The existing PostgreSQL and Redis
containers were healthy before execution, and the harness used installed Chrome;
no package, browser or infrastructure downloads were attempted.

| Directory | Command | Exit | Observed result |
| --- | --- | ---: | --- |
| `frontend/` | `npm run build:browser` | 0 | Next.js browser fixture compiled and generated all 44 static pages, including care-plan and visit workspace routes. |
| `backend/` | `npm run test:browser:sprint5` | 0 | Arabic and English U01-U06/U09/U10/F10 create/approve/preview/activate, assignment, leave/reassignment and route-matrix workflows passed. The existing `pg` concurrent-query deprecation warning was emitted. |

Step 2's scoped baseline is green for the supported browser behavior; no new
failure requiring a behavioral repair was observed in this run. Later Task 7
steps were subsequently completed and their final verification is recorded
below.

### Task 7 — Completion evidence (2026-11-03)

- List/editor/detail state orchestration is owned by care-plan hooks. List
  requests use abort and generation guards; detail requests use a generation
  guard so late responses cannot replace the selected plan. Editor options are
  abortable, and the hook exposes semantic create arguments rather than making
  screen JSX assemble an API payload.
- Extracted the plan editor, version/approval controls, generation preview,
  draft/revision panels, lifecycle dialog and summary into focused rendering
  modules. The detail module composes typed state and callbacks; panel rendering
  code contains no endpoint paths or API transport calls.
- The care-plans route imports the `CarePlansScreen` public feature export.
  Arabic/English care-plan dictionaries and `care-plans.css` are owned by the
  feature. No public route or backend contract changed.
- Existing browser characterization includes invalid create/edit prevention,
  response-pending feedback, preview invalidation, exact-version approval,
  stale-version conflict feedback and lifecycle keyboard/focus behavior. The
  pre-fix 61-day create assertion was previously observed RED (POST issued), and
  the corrected implementation passed; the current browser run below passes
  both locales after the extraction.
- The request-generation test demonstrated RED before its module existed and
  GREEN after the guard was wired into list/detail hooks.

Fresh final checks after the Task 7 source changes:

| Directory | Command / search | Exit | Observed result |
| --- | --- | ---: | --- |
| `frontend/` | `npm test -- test/care-plans-validation.test.ts test/care-plans-policies.test.ts test/care-plans-api.test.ts test/i18n.test.ts` | 0 | 4 files / 21 tests passed. |
| `frontend/` | `npm test -- test/care-plans-request-generation.test.ts` (before implementation) | 1 | Expected RED: suite could not resolve the not-yet-created request-generation module; 0 tests executed. |
| `frontend/` | `npm test -- test/care-plans-request-generation.test.ts` (after implementation) | 0 | 1 file / 2 tests passed; latest-request and unmount invalidation behavior pinned. |
| `frontend/` | `npm run lint` | 0 | ESLint completed with no findings. |
| `frontend/` | `npm run typecheck` | 0 | TypeScript completed with no diagnostics. |
| `frontend/` | `npm test` | 0 | 13 files / 62 tests passed. |
| `frontend/` | `npm run build` | 0 | Next.js production build succeeded; all 44 pages generated. |
| `frontend/` | `npm run build:browser` | 0 | Browser fixture build succeeded; workspace care-plan and visit routes generated. |
| `backend/` | `npm run test:browser:sprint5` | 0 | Arabic and English workflow and route matrices passed using installed Chrome; existing `pg` concurrent-query deprecation warning emitted. |
| frontend source boundary | `functions.grep` for `apiRequest|/agency/care-plans` in care-plan `components/*.tsx` and `screens/*.tsx` | 0 matches | Both searches returned “No files found”; endpoint strings and transport calls remain in feature API/hook modules, not rendering modules. `rg` is unavailable on PATH (`where.exe rg` reported no matching files), so the provided content-search tool was used for the same patterns. |
| repository root | `git diff --check` | 0 | No whitespace errors. |

The Prettier-only supplementary check was also attempted and exited 1, reporting
style differences in the newly edited care-plan modules; Prettier is not a
Task 7 verification command. This remains a formatting follow-up and is not
represented as a passing check.

### Task 7 Architecture Gates

- Domain ownership: **pass**. Care-plan UI, copy, styles and endpoint adapters
  are owned by `features/care-plans`; the route consumes only its public
  `CarePlansScreen` export. No cross-feature internal import was added.
- Responsibility/depth: **pass**. Hooks own request state and stale-response
  guards; components render typed data and semantic events; editor, version,
  preview, draft/revision and lifecycle responsibilities are split into focused
  modules. The screen contains no API endpoint, transport method or payload
  construction.
- Contracts/state: **pass**. Existing API adapter tests pin the same paths,
  methods, payloads and idempotency behavior. Client validation remains feedback
  only; exact-version approval, preview-gated activation and lifecycle behavior
  remain unchanged.
- Security/transactions: **pass**. No authorization decision moved client-side;
  backend remains authoritative for tenant scope, exact version and lifecycle
  transitions. No patient or clinical draft is persisted in browser storage.
- Verification: **pass** for the Task 7 named test, lint, typecheck, build,
  source-boundary and browser checks. Browser characterization passes in both
  locales after extraction.

Deferred: the optional Prettier check reports style differences in touched
care-plan files. Visit-domain separation remains Task 8; no Task 8 implementation
has begun.

## Task 5 — Workspace Ownership Out of Catalog (2026-11-03)

- Added locale-specific workspace copy and `workspaceNavigationItems(locale)`
  with eight stable destinations. The pure navigation module imports no
  business-feature code; active matching includes nested request-detail paths,
  and `WorkspaceNavigation` supplies `aria-current="page"`.
- Added the locale-validating `app/[locale]/workspace/layout.tsx` and one
  shared `WorkspaceFrame` for the eight workspace routes. It preserves the
  existing `PortalShell`, `ThemeContext`, light/dark toggle, locale direction,
  skip link and route-relative locale switch.
- Moved the existing customer-facing frame implementation to
  `components/layout/portal-frame.tsx`. Portal branding projection, route links,
  locale/theme behavior and logo rendering are retained. Portal frame copy is
  read from message JSON rather than importing feature modules.
- Migrated workspace screens to render content within the shared layout;
  patient and caregiver screens keep `PortalFrame` only in their portal/own
  profile mode. All imports of catalog-owned shared frames/navigation were
  removed before deleting those two catalog files. Existing route pages remain
  thin and inherit the new layout without route/API changes.
- Added `frontend/test/workspace-navigation.test.ts` for Arabic/English
  destination parity, locale prefixes, unique destinations and nested active
  route behavior. The initial run before creating the navigation module failed
  with the expected module-not-found error. The first implementation run also
  exposed an incorrect locale-sensitive assertion in the new parity test; the
  expectation was corrected to compare locale-normalized destinations, and the
  final focused run passed.

### Fresh Verification Evidence (Task 5)

Commands run from `frontend/` on 2026-11-03 after the final source change:

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm test -- test/workspace-navigation.test.ts` (before module implementation) | 1 | Expected red: suite could not resolve `components/layout/workspace-navigation`; 0 tests executed. |
| `npm test -- test/workspace-navigation.test.ts test/i18n.test.ts` | 0 | 2 files, 9 tests passed (4 navigation, 5 i18n). |
| `npm run lint` | 0 | ESLint completed with no findings. |
| `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `npm run build` | 0 | Next.js compiled, typechecked and generated all 44 static pages; all eight workspace route paths are present. |

Source search for `features/catalog/(frame|workspace-nav)` and old component
names found only the new shared `workspace-navigation` module and its tests;
there are no production imports from the removed catalog files.

### Task 5 Architecture Gates

- Domain ownership: **pass**. Workspace and portal framing live in
  `components/layout`; navigation does not consume catalog, people or
  scheduling copy modules. Feature screens own only their feature content.
- Responsibility/depth: **pass**. The route-group layout composes one shared
  frame and navigation; portal-only projection remains in `PortalFrame`. No
  endpoint/workflow logic was moved into layout code.
- Contracts/state: **pass**. Existing route paths, API contracts and status
  behavior are unchanged. Locale is validated at the shared layout, and route
  selection remains locale-prefixed.
- Security/transactions: **pass**. The layout introduces no data access or
  authorization decisions and does not change backend transaction or history
  behavior.
- Verification: **pass**. The specified red-before-module test and green
  focused suites are evidenced; lint, typecheck and production build pass.

Deferred: browser-level visual/interactions verification was not part of Task 5's
named verification commands. The existing approved shell primitives were reused;
the next UI slice must follow the design-system preview/shared-UI acceptance
workflow. Care-plan pure seams are complete in Task 6; workflow extraction
remains in Tasks 7-8.

## Task 6 — Care-Plan Pure Seams (2026-11-03)

- Added typed frontend care-plan DTO/form contracts and a focused version-to-form
  mapper in `frontend/features/care-plans/`.
- Added locale-independent plan-content validation for calendar ordering and
  inclusive 60-day maximum, weekday uniqueness/range, duration, optional goal and
  instruction bounds, task content/count, and lifecycle reason requirements.
  DST, authorization and concurrency remain server-owned.
- Added pure selectors for selected/current/open-draft version resolution,
  revision, exact-current-version clinical approval applicability, preview-gated
  activation, lifecycle actions and submit eligibility. Clinical approval
  applicability is based on plan/version state only; it does not infer user
  authorization from a client role.
- Added a typed endpoint adapter for list/detail/create/draft/revise/approve/
  preview/activate and lifecycle actions. It uses the unchanged `/v1` routes,
  methods, payloads and activation idempotency header through `apiRequest`.
- Added three Vitest suites (16 tests) covering validation boundaries, policy
  outcomes and exact adapter routes/methods/bodies/header. No dependency,
  backend import, route change or UI change was introduced.

### Fresh Verification Evidence (Task 6)

Commands run from `frontend/` on 2026-11-03 after final formatting and source
changes; all listed final commands exited 0.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm test -- test/care-plans-validation.test.ts test/care-plans-policies.test.ts test/care-plans-api.test.ts` (before implementation) | 1 | Expected red: all 3 suites failed to resolve their not-yet-created modules; 0 tests executed. |
| `npm test -- test/care-plans-validation.test.ts test/care-plans-policies.test.ts test/care-plans-api.test.ts` (final) | 0 | 3 files and 16 tests passed. |
| `npm test` | 0 | 12 files and 60 tests passed. |
| `npm run lint` | 0 | ESLint completed with no findings. |
| `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `npm run build` | 0 | Next.js compiled, typechecked and generated all 44 static pages, including both care-plan workspace locales. |
| `npm exec prettier -- --check features/care-plans/contracts.ts features/care-plans/validation.ts features/care-plans/mappers.ts features/care-plans/policies.ts features/care-plans/api.ts test/care-plans-validation.test.ts test/care-plans-policies.test.ts test/care-plans-api.test.ts` | 0 | All matched files use Prettier code style. |
| `npm exec prettier -- --check ../docs/superpowers/plans/2026-11-02-pre-sprint-6-architecture-stabilization.md ../docs/plans/sprint-05-architecture-stabilization-status.md` (supplementary Markdown check) | 1 | Prettier reported style differences in both full Markdown files. This command is not a Task 6 verification step; no whole-file reformat was applied. |

During verification, an initial policy assertion used a non-clinical fixture
for an approval-eligible version; the fixture was corrected to represent a
clinical service. Strict typecheck also identified unsafe test-call indexing;
the tests now report an explicit missing-call error instead. The final focused
and full suites, lint, typecheck and build all ran against the resulting files.
The policy suite first failed on newest-first version history by selecting the
oldest version (expected version 2, received version 1); its test demonstrated
RED, the selector was corrected to fall back to current/open-draft/first
(newest) in API order, and the final policy suite passed. A second RED run
confirmed the clinical approval applicability policy has no client-role input;
the state-only interface then passed.

### Task 6 Architecture Gates

- Domain ownership: **pass**. Types, content validation, policies, mappings and
  endpoint adapter are owned by `features/care-plans`; no cross-feature or
  backend-source dependency was added.
- Responsibility/depth: **pass**. Pure policy/validation rules and endpoint
  construction each have a single named home; rendering/UI orchestration remains
  for Task 7.
- Contracts/state: **pass**. The adapter mirrors existing backend routes,
  request bodies and methods, including activation idempotency; no public
  contract changed. Client checks provide feedback only.
- Security/transactions: **pass**. No tenant or principal authority is inferred
  client-side; DST, authorization, transaction and race rules remain backend
  authoritative. No clinical/patient content is logged or placed in URLs.
- Verification: **pass**. All three suites demonstrated pre-implementation
  module-resolution failure; the newest-first selector regression also ran
  RED→GREEN. Focused suites, full frontend tests, lint, typecheck, build and
  changed-file format checks pass.

Deferred: browser workflow characterization, hooks, rendering extraction,
feature translations/styles and route migration remain owned by Task 7; visit
module separation remains owned by Task 8.

## Task 8 — Split Visits from Care Plans (2026-11-03)

The visit domain is now its own frontend feature module and the
`features/scheduling` umbrella is deleted.

- New `frontend/features/visits/` module: `contracts.ts` (visit-only DTOs
  mirrored from the `/v1` projections; parent-plan eligibility is not encoded —
  the care-plan reference is typed as an opaque `{ id, status: string,
  currentVersion }` snapshot), `policies.ts` (visit-local status tones,
  assign/reassign/bulk-selection gates from visit status only, the shared
  5-300 trimmed reason boundary with optional bulk reason, bulk submission
  readiness, ordered bulk payload construction), `api.ts` (typed list/detail/
  caregiver-options/candidates/assign/reassign/bulk-assign adapter hiding all
  endpoint strings, methods, payload construction and idempotency headers),
  `copy.ts` (visit dictionary, error mapping, localized service snapshot and
  date formatting), `request-generation.ts` (stale-response guard),
  `visits.css` (visit-scoped styles previously owned by `scheduling.css`),
  `hooks/use-visits.ts` (list filters, queue toggle, cursor pagination,
  caregiver options and the bulk-assign command with generation guards),
  `hooks/use-visit-detail.ts` (detail reload guard, candidate lookup,
  assign/reassign commands that wait for the server and list refresh before
  success feedback), `screens/visits-screen.tsx`, focused components
  (`visit-list.tsx`, `candidate-picker.tsx`, `visit-detail-panel.tsx`,
  `bulk-assignment-panel.tsx`) that receive typed state and emit semantic
  callbacks only, and `index.ts` exporting only `VisitsScreen`.
- New `frontend/messages/{ar,en}/visits.json` with visit-local copy (same
  approved strings, carried over from the scheduling namespace); no route,
  method, payload or visible label changed.
- `frontend/app/[locale]/workspace/visits/page.tsx` imports only
  `VisitsScreen` from the feature public interface.
- Deleted `frontend/features/scheduling/` (contracts, copy, status-tone,
  visits, visit-detail, scheduling.css) and
  `frontend/messages/{ar,en}/scheduling.json` after the last import moved.
- `frontend/lib/i18n.ts` no longer embeds the scheduling namespace (no page
  consumed it); `frontend/test/i18n.test.ts` now checks ar/en parity for the
  `visits` namespace (and the existing `care-plans` namespace, strengthening
  the pre-existing parity list) in place of the deleted scheduling namespace.
- `backend/test/browser/sprint5.e2e.ts` imports the two feature dictionaries
  and merges them (state labels merged deeply) instead of the deleted
  scheduling namespace; no assertion, selector, route or fixture changed.
- Approved DOM contracts were preserved for the browser harness: the visit
  detail section keeps `aria-label` = "Visit detail/تفاصيل الزيارة" with the
  visit id in `p.raak-scheduling-code`, table rows render in `tbody tr`, and
  all control ids and button labels are unchanged.

### Fresh Verification Evidence (Task 8)

Commands run on 2026-11-03; a command is only listed as passing when its
observed exit code was 0 on the final source state (after Prettier
formatting of the touched files).

| Directory | Command | Exit | Observed result |
| --- | --- | ---: | --- |
| `frontend/` | `npm test -- test/visits-policies.test.ts test/visits-api.test.ts` (before implementation) | 1 | Expected red: both suites failed with module-not-found; 0 tests executed. |
| `frontend/` | `npm test -- test/visits-policies.test.ts test/visits-api.test.ts` (after implementation) | 0 | 2 files / 10 tests passed. Two initial red assertions were fixture defects, not implementation gaps: `'short'` is exactly 5 characters (backend minimum) and the bulk payload pin had assumed status filtering that the approved UI never performed (eligibility is enforced by the disabled checkbox; the payload carries exactly the selected visits in list order). Fixtures were corrected; behavior pins unchanged. |
| `frontend/` | `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. (Two interim diagnostics during development were real defects and were fixed: the service-snapshot helper signature and a missing `close` dictionary key.) |
| `frontend/` | `npm run lint` | 0 | ESLint completed with no findings. |
| `frontend/` | `npm test` | 0 | 15 files and 72 tests passed (13 files / 62 tests before Task 8). |
| `frontend/` | `npm run build` | 0 | Next.js compiled, typechecked and generated all 44 static pages, including `/ar/workspace/visits` and `/en/workspace/visits`. |
| `frontend/` | `npm run build:browser` | 0 | Browser fixture rebuilt with the relative API base; 44 pages generated. |
| `backend/` | `npm run typecheck` | 0 | No diagnostics after the harness import migration. |
| `backend/` | `npm run test:browser:sprint5` | 0 | Arabic and English U01-U06/U09/U10/F10 matrices passed using installed Chrome, exercising the migrated visits module end to end (assign, leave flag, reassignment queue, route matrix). The existing `pg` concurrent-query deprecation warning was emitted. |
| boundary search | content-search for `features/scheduling\|apiRequest\|/agency/visits` in `frontend/features/visits/components` and `frontend/features/visits/screens` | 0 matches | No scheduling imports and no endpoint orchestration in rendering modules. |
| boundary search | content-search for `features/scheduling\|apiRequest\|/agency/visits` in `frontend/app` | matches only in pre-existing `auth-forms.tsx`/`tenant-admin.tsx` | These are unrelated auth/platform route components that predate this plan (their domain split belongs to later stages); no `features/scheduling` import and no `/agency/visits` reference remains anywhere in `frontend/app`. |
| repository-wide | content-search for `features/scheduling\|scheduling.json\|scheduling.css` in `frontend/` | 0 matches | The umbrella and its message/style files have no remaining references. |

`rg` is not installed on PATH in this environment (`where.exe rg` reported no
match, consistent with the Task 7 record); the repository content-search tool
evaluated the identical patterns over the exact directories named by the plan.

Touched-file Prettier check: the frontend visits/test/i18n files and
`backend/test/browser/sprint5.e2e.ts` were brought to Prettier style and the
full command set above was re-run on that final state with identical passing
results. The pre-existing Prettier differences inside Task 7's care-plan
files remain deferred and were not touched.

### Task 8 Architecture Gates

- Domain ownership: **pass**. Visits are owned by `features/visits`; the
  module imports nothing from `features/care-plans` (verified: no
  `care-plans` or `statusTone` reference inside the visits module). The route
  consumes only the `VisitsScreen` public export. No feature cycles.
- Responsibility/depth: **pass**. Endpoint strings, HTTP methods, payload
  construction and idempotency-key creation live only in `api.ts` and the
  hooks; list filters/table, candidate picker, detail actions and bulk
  assignment are focused rendering modules emitting semantic callbacks; the
  screen owns composition and selection state only.
- Contracts/state: **pass**. The adapter pins the exact `/v1` paths, methods,
  bodies (including assign idempotency headers and no header on
  candidates/reassign) and the server projection shapes; no public route,
  request or response field changed. Client validation remains feedback only;
  the 5-300 reason boundary mirrors the backend schema without replacing it.
- Security/transactions: **pass**. No parent-plan eligibility is inferred from
  incomplete client data (the care-plan snapshot is typed opaque and is not
  used to gate actions); assignment eligibility, conflicts, travel buffer and
  version concurrency remain server-authoritative; no patient content is
  logged or persisted in browser storage.
- Verification: **pass**. Red-then-green demonstrated for both focused
  suites; full frontend tests, lint, typecheck, production build, browser
  fixture build and the Sprint 5 browser matrix (Arabic and English) pass on
  the final state.

Deferred structural note: `createRequestGeneration` now exists as two
identical 8-line pure helpers (`features/care-plans` and `features/visits`)
because Task 8 may not modify the Task 7 care-plan module. When a third
consumer appears — or in a later touched sprint — promote it to
`components/patterns/request-generation.ts` per the design document's shared
interaction-pattern home and migrate both features. No other duplication was
introduced; `visits.css` intentionally keeps the established
`raak-scheduling-*` class names scoped under `.raak-visits` so the approved
appearance and the browser harness DOM contracts stay byte-identical;
renaming them is cosmetic-only and can follow later.

## Task 12 — Architecture Gates and Sprint Closeout (2026-11-03)

No production code changed in Task 12. Closeout work was: boundary searches,
a repo-wide Prettier formatting pass so both projects' `format:check` gates
pass, complete frontend/backend verification on the final formatted state,
migration and browser checks, the five architecture gates and the follow-up
plan boundaries. Documentation: `docs/08_ARCHITECTURE.md` now records the
implemented care-plan/scheduling module shape, the assignment-policy seam and
the documented lock orders; `docs/10_UI_UX_DESIGN_SYSTEM.md` now records that
workspace/portal shell compositions live in `frontend/components/layout/`;
`docs/07_API_CONTRACT.md` required no change (Tasks 1-4 already recorded every
approved behavior clarification; verified against the implemented routes);
the design spec required no non-contractual clarification.

### Repo-wide formatting pass (prerequisite for format:check)

`npm run format:check` initially failed in both projects with 30 unformatted
files each — a mix of sprint-touched files and pre-existing committed files
this plan never touched (frontend auth/platform route pages, design-preview
messages, `lib/form-validation.ts`, `test/capability-token.test.ts`; backend
auth/agency/platform/staff modules and their tests). Task 12's verification
contract requires `format:check` to pass, so the repositories' own
`npm run format` scripts (`prettier --write .`) were run in both projects.
All changes are style-only; after formatting, the complete verification set
below was re-run on the final state with identical test/build counts,
demonstrating unchanged behavior. Unrelated formatted files are listed for
owner review:

- Frontend (30 files rewritten: 15 sprint-touched care-plan files + 14
  pre-existing unformatted files + the already-worktree-modified
  `app/[locale]/_components/auth-forms.tsx`): the
  sprint-touched files are the care-plan module's `api.ts`, `care-plans.css`,
  `components/plan-{detail,draft-panel,editor,lifecycle-dialog,version-panel}.tsx`,
  `copy.ts`, `hooks/{use-care-plans,use-plan-editor}.ts`, `policies.ts`,
  `request-generation.ts`, `screens/care-plans-screen.tsx`,
  `messages/{ar,en}/care-plans.json`. The pre-existing unformatted files are
  `app/[locale]/_components/{page-shell,tenant-admin}.tsx`,
  `app/[locale]/{accept-invitation,login,page,platform/tenants,register,
  reset-password,verify-email}/page.tsx`,
  `app/[locale]/workspace/requests/[id]/page.tsx`,
  `messages/{ar,en}/design-preview.json`, `lib/form-validation.ts`,
  `test/capability-token.test.ts`.
- Backend (30 files rewritten: 11 sprint-touched + 19 pre-existing): the
  sprint-touched files are `prisma/{seed,seed-scheduling}.ts`,
  `src/modules/care-plans/recurrence.ts`,
  `src/modules/common/{interval,local-time}.ts`,
  `src/modules/scheduling/filters.ts`,
  `test/careplans/{care-plan-linkage,careplans,recurrence}.test*.ts`,
  `test/scheduling/{assignment,plan-lifecycle-assignment}.integration.test.ts`.
  The pre-existing unformatted files are `src/contracts/auth.ts`,
  `src/modules/agency/agency.service.ts`,
  `src/modules/auth/{cookies,crypto,guards,host-resolver,rate-limit,
  session.service}.ts`, `src/modules/platform/platform.service.ts`,
  `src/modules/staff/staff.service.ts`,
  `test/auth/{auth.routes,guards}.integration.test.ts`,
  `test/auth/{rate-limit,session.service}.test.ts`,
  `test/contracts/{auth,quotes}.dto.test.ts`,
  `test/e2e/e01-registration.flow.integration.test.ts`,
  `test/platform/tenants.integration.test.ts`,
  `test/staff/invitations.integration.test.ts`.

### Step 1 — Dependency/source boundary searches

`rg` is not installed or available on PATH in this environment (`where.exe rg`
returned no match), consistent with every prior task record. The repository
content-search tool evaluated the identical regex patterns over the exact
paths named by the plan:

| Pattern | Paths | Matches | Result |
| --- | --- | ---: | --- |
| `features/catalog/(frame\|workspace-nav)\|features/scheduling` | `frontend/` (entire tree, production and tests) | 0 | No catalog-owned shell imports and no scheduling-umbrella references remain anywhere. |
| `apiRequest\|/agency/care-plans\|/agency/visits` | `frontend/features/care-plans/components`, `frontend/features/care-plans/screens`, `frontend/features/visits/components`, `frontend/features/visits/screens` | 0 | No endpoint strings or transport calls in any rendering module. |

Expected "no production matches" is met with zero matches total; no
test-assertion or documentation exceptions were needed.

### Steps 2-3 — Complete verification evidence

Commands run on 2026-11-03; a command is listed as passing only when its
observed exit code was 0 on the final formatted state. `npm run format:check`
failed initially (see the formatting section above) and passes after the
formatting pass.

| Directory | Command | Exit | Observed result |
| --- | --- | ---: | --- |
| `frontend/` | `npm run format:check` (after `npm run format`) | 0 | "All matched files use Prettier code style!" |
| `frontend/` | `npm run lint` | 0 | ESLint completed with no findings. |
| `frontend/` | `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `frontend/` | `npm test` | 0 | 15 files and 72 tests passed (identical to the Task 8 count — formatting changed no behavior). |
| `frontend/` | `npm run build:browser` | 0 | Browser fixture build; all 44 static pages generated with the relative API base. |
| `frontend/` | `npm run build` | 0 | Next.js production build; all 44 static pages generated. |
| `backend/` | `npm run format:check` (after `npm run format`) | 0 | "All matched files use Prettier code style!" |
| `backend/` | `npm run lint` | 0 | ESLint completed with no findings. |
| `backend/` | `npm run typecheck` | 0 | `tsc --noEmit` completed with no diagnostics. |
| `backend/` | `npm test` | 0 | 33 files and 257 tests passed (identical to the Task 9/10/11 baseline counts — including the Task 2 race, Task 3 linkage, Task 4 concurrency and full scheduling suites). The existing `pg` client concurrent-query deprecation warning remains. |
| `backend/` | `npm run build` | 0 | Built `dist/index.js` and `dist/worker.js`. |

### Step 4 — Migration and browser checks

Documented migration validation commands (as used by Sprints 2-5 closure
records) were run from `backend/` against the healthy local
`raak-postgres-1` (postgres:17-alpine on localhost:5433; `raak-redis-1`
redis:8-alpine on localhost:6380 was also healthy). No download of packages,
browsers or infrastructure was attempted; installed Chrome was used.

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm exec -- prisma migrate status` | 0 | 11 migrations found; "Database schema is up to date!". |
| `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | 0 | "No difference detected." (Prisma's informational 7→8 upgrade notice was emitted; no action taken in this sprint.) |
| `backend/` `npm run test:browser:sprint5` (first attempt) | 1 | Timed out at the login response wait — the Step 2 command order leaves the plain `npm run build` last, overwriting the browser fixture's relative API base with the development port (the exact prerequisite behavior recorded since Task 1). |
| `frontend/` `npm run build:browser` (documented prerequisite re-run) | 0 | Browser fixture rebuilt; 44 pages with the relative API base. |
| `backend/` `npm run test:browser:sprint5` (unchanged harness command) | 0 | Arabic and English U01-U06/U09/U10/F10 plan create/approve/preview/activate, visit assign, leave flag, reassignment and route-matrix workflows passed using installed Chrome. The existing `pg` concurrent-query deprecation warning was emitted. |

The harness was never modified and no assertion was weakened; the first
failure was the documented build-order fixture state, resolved by the
documented prerequisite build, after which the identical command passed.

### Step 5 — The five architecture gates (final sprint record)

- **Domain ownership: pass.** Shared workspace/portal shells and navigation
  live in `frontend/components/layout/` with the locale-validating workspace
  layout; `features/catalog` no longer owns any shared layout file (deleted
  in Task 5, zero remaining references). `features/care-plans` and
  `features/visits` are separate domains exporting only their screens;
  visits imports nothing from care-plans internals (Step 1 searches). On the
  backend, care-plans exposes one composition-only facade over queries and
  four command families with repository/content internals; scheduling owns
  visit queries and assignment commands separately. The one intentional
   cross-domain dependencies include `scheduling → care-plans` via
  `care-plan-assignment-policy.ts` (planned seam, no reverse import, no
   cycle), caregiver configuration writers → the public scheduling impact-scan
   seam, and scheduling → the public caregiver eligibility policy seam. These
   narrow lower-level seams do not import caregiver service implementations.
- **Responsibility/depth: pass.** Controllers/routes compose services and
   contain no workflow implementation; care-plan/visit JSX contains no endpoint paths, HTTP
   methods or multi-step mutation logic (Step 1 searches). This gate does not
   claim the deferred catalog/commercial/people/auth rendering modules have
   already migrated. The care-plan
   facade is composition-only; `assignment.service.ts` holds assignment commands
   while `bulk-reservation.ts` owns durable fenced execution; `visit.queries.ts` hides
  authorization, date-window conversion and projections behind one factory.
  Files near the 400-500 line review trigger were reviewed in Tasks 4, 10
  and 11 and split only where cohesive responsibilities justified it.
- **Contracts/state: pass.** `CarePlanService` pins the twelve method
  signatures and serialized shapes; `VisitQueries` and exported projection
  interfaces pin visit list/detail shapes; canonical DTO schemas, stable
  error codes and event constants have single homes in `backend/src/contracts`
  with the completed barrel; no route, request field, response field or
  status code changed in this sprint (the three Stage 0 behavioral repairs
  used pre-approved stable codes only). Workflow eligibility is centralized:
  backend `care-plan-assignment-policy.ts`, frontend `policies.ts` modules.
  `docs/07_API_CONTRACT.md` matches implemented behavior. OpenAPI generation
  is not claimed (Stage 6/Sprint 7 scope).
- **Security/transactions: pass.** Tenant scope is server-resolved in every
  query/command path (denial and cross-tenant 404 suites pass). Documented
  lock orders hold: plan-backed assignment tenant → care plan → visit →
  caregiver; standalone tenant → visit → caregiver; pause/cancel tenant →
  care plan → affected visits in UUID order; the parent-plan assignability
  recheck happens under lock at each writer's linearization point (Task 2
  race test pins the two approved serializations). Linkage guards run before
  any write with no-partial-write pinned; bulk reservation/checkpoint rows
  store only resource IDs and stable codes (content pin test); audit/outbox
  writes remain atomic with state changes. Deferred: the shared tenant
  writer lock remains until Stage 5's query/command transaction entry points.
- **Verification: pass.** Every named Task 12 command exits 0 on the final
  formatted state with exact counts recorded above; red-then-green evidence
  exists for the three Stage 0 behavioral fixes and the frontend module
  introductions; the Sprint 5 browser matrices pass in Arabic and English;
  migration history is valid and diff-clean. The pre-existing `pg`
  concurrent-query deprecation warning is an upstream library notice, not a
  test failure.

Deferred concerns and their owning stages (no work started on any):

1. Stage 3 — commercial/requesting domain split (frontend `requesting`
   separation from catalog, backend request/quote decomposition) during its
   next touched product sprint.
2. Stage 4 — `features/people` umbrella split into patients/caregivers/
   documents modules and backend scoped-loader consolidation when those
   domains are next touched.
3. Stage 5 — tenant query/command transaction entry points
   (`withAgencyQuery`/`withAgencyCommand`) replacing the shared tenant
   writer lock, only after the required contention/suspension-race/cross-
   tenant test design.
4. Stage 6 (Sprint 7) — explicit response/event schema completion, optional
   OpenAPI/frontend contract generation, worker event-registry
   consolidation and CI dependency-rule enforcement.
5. Cosmetic-only follow-ups recorded earlier: the duplicated 8-line
   `createRequestGeneration` helper (promote to `components/patterns/` when
   a third consumer appears) and the `raak-scheduling-*` CSS class names
   scoped under `.raak-visits` (rename when the browser harness DOM
   contracts are next deliberately revised).

### Step 6 — Follow-up plan boundaries

No implementation code was created for deferred stages in this sprint. The
recorded future plan boundaries are: commercial/requesting restructuring is
bounded to its next touched product sprint plus one direct shared seam;
patients/caregivers/documents restructuring is bounded to the sprint that
next touches those domains; tenant lock-infrastructure replacement requires
a separate contention/race design and migration plan before any gate
replacement; contracts/worker/CI enforcement aligns with Sprint 7
notification scope rather than pulling notification work forward. Each
future plan must restate the six sprint-plan items from the design
document's Sprint Integration Rule (product behavior, domain debt, smallest
boundary improvement, characterization/new-behavior tests, five gate
results, deferred concerns).

### Stage exit record

Stage 0 (baseline and invariant repairs), Stage 1 (shared frontend seams)
and Stage 2 (care plans and scheduling) exit criteria are demonstrated by
the recorded evidence: architecture rules documented (ADR-0012 + this file +
docs 08), baseline and characterization tests protect the moved workflows,
the three confirmed defects have reviewed failing-then-passing fixes, the
production workspace uses the approved shared shell with no business feature
owning global navigation, no JSX embeds care-plan/visit HTTP requests,
backend command families have focused interfaces behind the unchanged
controller-facing facade, visit queries no longer live in the assignment
command implementation, and the full check set plus browser matrices are
green. Sprint 6 product behavior was not implemented or silently changed.

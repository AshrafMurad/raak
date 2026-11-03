# Pre-Sprint-6 Architecture Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the care-plan and scheduling architecture before Sprint 6 by repairing confirmed invariants, moving shared workspace ownership out of business features, and separating UI, validation, policies, API orchestration, queries and command workflows behind stable interfaces.

**Architecture:** Keep the existing Next.js plus Express modular monolith and all public routes stable. Establish a workspace layout seam, split the frontend scheduling umbrella into `care-plans` and `visits`, and retain `createCarePlanService()` as a backend facade while extracting cohesive query and command modules. Behavioral fixes are completed and verified before structural movement so architecture diffs do not hide state-machine changes.

**Tech Stack:** TypeScript 5.9 strict mode, Next.js 16 App Router, React 19, Express 5, Zod 4, Prisma 7/PostgreSQL, Vitest 4, Supertest, existing Chrome/Playwright harness.

**Spec:** `docs/superpowers/specs/2026-11-02-incremental-architecture-stabilization-design.md`

## Global Constraints

- Implement this as one bounded stabilization sprint before Sprint 6; do not start Sprint 6 visit-execution behavior in this plan.
- D01-D23, tenant isolation, append-only history, exact-version approval and scheduling transaction invariants remain authoritative.
- `docs/adr/ADR-0012-sprint5-care-plans-matching.md` must be approved or amended before Task 2; architecture approval does not approve that ADR's product interpretations.
- Preserve every existing `/v1` path, request field, response field and status code unless Task 1 records a separately owner-approved contract correction.
- Frontend validation provides feedback only; backend Zod validation and domain services remain authoritative.
- UI files may render typed state and emit semantic events, but must not own endpoint strings, HTTP methods, idempotency headers or authoritative state transitions.
- Do not import backend source into the frontend. Do not add a query, validation or component-testing dependency in this sprint.
- No microservices, global state library, blanket Prisma repository wrappers or line-count-driven splitting.
- Use synthetic records only. Do not place patient, clinical, recipient or capability data in logs, URLs, test names or outbox payloads.
- Preserve unrelated worktree changes. Do not commit unless the owner separately authorizes commits.

## Review Focus

- A PAUSED, COMPLETED or CANCELLED parent plan must never allow a retained PLANNED visit to be newly assigned; Task 2 pins this with API and race tests.
- A supplied approved request must match the plan's exact tenant, patient and service without leaking cross-tenant existence; Task 3 pins this and verifies no partial writes.
- Concurrent bulk requests sharing one idempotency key must not execute an assignment twice or lose a partial outcome; Task 4 pins the selected ADR behavior.
- Extracted frontend workflows must never display success before server confirmation or let stale responses replace newer state; Tasks 7 and 8 pin API and browser behavior.
- Backend extraction must preserve authorization, audit/outbox atomicity, occurrence/task idempotency and exact serialized response shapes; Tasks 9-11 run characterization and race suites after every extraction.

---

## File Map

### Shared frontend layout

- Create `frontend/app/[locale]/workspace/layout.tsx`: locale-aware workspace route composition.
- Create `frontend/components/layout/workspace-frame.tsx`: workspace theme, header, locale switch and shell.
- Create `frontend/components/layout/workspace-navigation.tsx`: workspace navigation and active-state logic.
- Create `frontend/components/layout/portal-frame.tsx`: portal-only replacement for `features/catalog/frame.tsx`.
- Create `frontend/messages/{ar,en}/workspace.json`: shared workspace and navigation copy.
- Delete `frontend/features/catalog/{frame,workspace-nav}.tsx` only after all callers migrate.

### Frontend care-plan module

- Create `frontend/features/care-plans/{index,api,contracts,copy,mappers,validation,policies}.ts`.
- Create `frontend/features/care-plans/hooks/{use-care-plans,use-plan-detail}.ts`.
- Create `frontend/features/care-plans/screens/care-plans-screen.tsx`.
- Create focused files under `frontend/features/care-plans/components/` for editor, detail summary, version panel, generation preview, draft panel and lifecycle dialog/controls.
- Create `frontend/messages/{ar,en}/care-plans.json` and `frontend/features/care-plans/care-plans.css`.

### Frontend visit module

- Create `frontend/features/visits/{index,api,contracts,copy,policies}.ts`.
- Create `frontend/features/visits/hooks/{use-visits,use-visit-detail}.ts`.
- Create `frontend/features/visits/screens/visits-screen.tsx` and focused visit components.
- Create `frontend/messages/{ar,en}/visits.json` and `frontend/features/visits/visits.css`.
- Delete `frontend/features/scheduling/` and scheduling translation files only after all imports migrate.

### Backend care-plan module

- Keep `backend/src/modules/care-plans/care-plan.service.ts` as the stable facade.
- Create `care-plan.types.ts`, `care-plan.repository.ts`, `care-plan-content.ts`, `care-plan.queries.ts`, `care-plan-draft.service.ts`, `care-plan-clinical-approval.service.ts`, `care-plan-activation.service.ts` and `care-plan-lifecycle.service.ts`.
- Create `care-plan-assignment-policy.ts` as the narrow scheduling-to-care-plans seam.
- Create `backend/src/modules/scheduling/visit.queries.ts` and leave assignment commands in `assignment.service.ts`.

### Tests and documentation

- Create focused backend integration tests under `backend/test/careplans/` and `backend/test/scheduling/` for confirmed invariant fixes.
- Create pure frontend Vitest files for navigation, care-plan validation/policies/API and visit policies/API.
- Extend `backend/test/browser/sprint5.e2e.ts` rather than adding a new browser framework.
- Update ADR-0012, API contract, architecture design references and create `docs/plans/sprint-05-architecture-stabilization-status.md` during final reconciliation.

---

### Task 1: Freeze Decisions and Baseline

**Files:**
- Modify: `docs/adr/ADR-0012-sprint5-care-plans-matching.md`
- Modify: `docs/07_API_CONTRACT.md`
- Create: `docs/plans/sprint-05-architecture-stabilization-status.md`

**Interfaces:**
- Consumes: approved architecture design and current Sprint 5 implementation.
- Produces: owner-approved assignment lifecycle, request linkage, bulk idempotency and lock-order rules that Tasks 2-4 implement.

- [x] **Step 1: Record the exact decisions requiring owner disposition**

Add an ADR section covering: only ACTIVE parent plans are assignable; standalone visits remain assignable; supplied requests must be APPROVED and match patient/service; pause/assignment lock order; bulk payload order semantics; concurrent same-key behavior; interrupted bulk resume behavior.

- [x] **Step 2: Obtain owner approval or amendment of ADR-0012**

Expected: ADR status changes from `proposed` to an explicit approved/amended status. Stop Tasks 2-4 if any rule remains ambiguous.

- [x] **Step 3: Capture fresh baseline verification**

Run in `backend/`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Run in `frontend/`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: record exact pass/fail counts and environment blockers in the status file; do not describe a failing baseline as accepted.

- [x] **Step 4: Run the existing Sprint 5 browser baseline if its prerequisites are available**

Run: `npm run test:browser:sprint5` from `backend/` if the script exists and its documented DB/browser prerequisites are available.

Expected: record the exact result. A missing script, DB, Redis or browser prerequisite is a blocker, not a fabricated pass.

### Task 2: Enforce Parent-Plan Assignment State

**Files:**
- Create: `backend/src/modules/care-plans/care-plan-assignment-policy.ts`
- Modify: `backend/src/modules/scheduling/assignment.service.ts`
- Modify: `backend/src/modules/scheduling/candidate.service.ts`
- Create: `backend/test/scheduling/plan-lifecycle-assignment.integration.test.ts`

**Interfaces:**
- Consumes: Task 1's approved lifecycle and lock-order rules.
- Produces: `lockAssignableCarePlanForVisit(tx, tenantId, carePlanId): Promise<void>` and `isCarePlanAssignable(status): boolean` for scheduling commands/queries.

- [x] **Step 1: Write failing lifecycle tests**

Add tests asserting: ACTIVE permits assignment; DRAFT/PAUSED/COMPLETED/CANCELLED reject with the approved stable code; standalone PLANNED visits remain assignable; candidate lookup rejects an inactive parent; pause/cancel with KEEP preserves but blocks later assignment.

- [x] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- test/scheduling/plan-lifecycle-assignment.integration.test.ts`

Expected: at least the paused/cancelled assignment assertions fail against the current implementation.

- [x] **Step 3: Implement the narrow assignment policy seam**

Implement the two produced functions. Lock/read only the tenant-scoped plan needed by the visit; return no patient or plan content in errors.

- [x] **Step 4: Apply the policy to candidate and commit-time assignment paths**

Every assignment writer must recheck after acquiring the approved locks. Candidate lookup is advisory but must not advertise candidates for a non-assignable plan.

- [x] **Step 5: Add the pause/assignment race test**

Permit only two valid serializations: assignment commits first and pause preserves the SCHEDULED visit, or pause commits first and assignment fails. Never permit a new assignment after the PAUSED state linearization point.

- [x] **Step 6: Verify the focused and existing scheduling suites**

Run:

```powershell
npm test -- test/scheduling/plan-lifecycle-assignment.integration.test.ts
npm test -- test/scheduling/assignment.integration.test.ts
```

Expected: all tests pass with no changed travel-buffer, qualification or leave-race behavior.

### Task 3: Enforce Care-Plan Request Linkage

**Files:**
- Modify: `backend/src/modules/care-plans/care-plan.service.ts`
- Create: `backend/test/careplans/care-plan-linkage.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 linkage rule.
- Produces: characterized linkage behavior that later moves unchanged into `care-plan.repository.ts` and `care-plan-draft.service.ts`.

- [x] **Step 1: Write failing linkage tests**

Cover: approved request linked to the same patient/service succeeds; unlinked request fails; another patient fails; another service fails; cross-tenant request returns 404; failure creates no plan, version, audit or outbox row.

- [x] **Step 2: Verify the semantic mismatch tests fail**

Run: `npm test -- test/careplans/care-plan-linkage.integration.test.ts`

Expected: current same-tenant patient/service mismatch cases expose the missing guard.

- [x] **Step 3: Implement the minimal tenant-scoped linkage guard**

Validate `status === 'APPROVED'`, exact `patientId` and exact `agencyServiceId` in the create transaction before any plan/version/audit/outbox write. Preserve privacy-safe 404 for inaccessible references and use the Task 1 approved code for same-tenant semantic mismatch.

- [x] **Step 4: Verify linkage and existing care-plan behavior**

Run:

```powershell
npm test -- test/careplans/care-plan-linkage.integration.test.ts
npm test -- test/careplans/careplans.integration.test.ts
```

Expected: all tests pass; valid manual plans with `serviceRequestId: null` remain valid.

### Task 4: Make Bulk Assignment Idempotency Concurrency-Safe

**Files:**
- Modify: `backend/src/contracts/careplans.ts`
- Modify: `backend/src/modules/scheduling/assignment.service.ts`
- Create: `backend/test/scheduling/bulk-assignment-idempotency.integration.test.ts`
- Modify: `docs/07_API_CONTRACT.md`

**Interfaces:**
- Consumes: Task 1's approved order, in-progress and interruption semantics.
- Produces: one canonical bulk request hash and replay/checkpoint behavior behind the unchanged bulk endpoint.

- [x] **Step 1: Write failing idempotency tests**

Cover: concurrent same key executes each visit at most once; replay returns stored completed result; changed reason/version/order follows the approved conflict rule; duplicate visit IDs are rejected; partial replay adds no duplicate assignment history/audit/outbox.

- [x] **Step 2: Verify the concurrent and reason-hash tests fail**

Run: `npm test -- test/scheduling/bulk-assignment-idempotency.integration.test.ts`

Expected: current pre-reservation race and omitted reason are demonstrated.

- [x] **Step 3: Add strict duplicate-visit validation**

Extend `BulkAssignSchema` to reject repeated `visitId` values before work begins. Preserve the 1-100 item bound.

- [x] **Step 4: Implement canonical hashing and atomic reservation**

Hash every approved semantic field. Reserve `(tenantId, principalId, key)` before per-visit commits and store only safe operation state/results in `responseSummary`.

- [x] **Step 5: Implement checkpoint/replay behavior**

After each independent visit transaction, persist its safe result according to Task 1. Replays must not rerun completed visits; provider or patient content must not enter the stored summary.

- [x] **Step 6: Verify bulk, assignment and schema suites**

Run:

```powershell
npm test -- test/scheduling/bulk-assignment-idempotency.integration.test.ts
npm test -- test/scheduling/assignment.integration.test.ts
npm test -- test/contracts/careplans.test.ts
```

Expected: all available focused tests pass. If the named contract test file does not exist, add the duplicate-validation case to the existing care-plan contract test file and run that exact path.

### Task 5: Move Workspace Ownership Out of Catalog

**Files:**
- Create: `frontend/components/layout/workspace-navigation.tsx`
- Create: `frontend/components/layout/workspace-frame.tsx`
- Create: `frontend/components/layout/portal-frame.tsx`
- Create: `frontend/app/[locale]/workspace/layout.tsx`
- Create: `frontend/messages/ar/workspace.json`
- Create: `frontend/messages/en/workspace.json`
- Modify: `frontend/lib/i18n.ts`
- Modify: all eight `frontend/app/[locale]/workspace/**/page.tsx` route trees and their current screen wrappers
- Test: `frontend/test/workspace-navigation.test.ts`

**Interfaces:**
- Produces: `WorkspaceFrame({ locale, children })`, `PortalFrame(...)`, and pure `workspaceNavigationItems(locale)` with no imports from business features.
- Consumes: existing `PortalShell`, `Button`, theme context and approved visual tokens.

- [x] **Step 1: Write failing navigation tests**

Assert exact AR/EN item parity, locale-prefixed hrefs, unique destinations and active-route matching without importing catalog/people/scheduling copy.

- [x] **Step 2: Verify the tests fail before the module exists**

Run: `npm test -- test/workspace-navigation.test.ts`

Expected: module-not-found failure.

- [x] **Step 3: Add workspace copy and navigation**

Create typed workspace dictionaries and `workspaceNavigationItems(locale)`. `WorkspaceNavigation` derives active state from `usePathname` and sets `aria-current="page"`.

- [x] **Step 4: Add the shared workspace layout and frame**

`app/[locale]/workspace/layout.tsx` validates the async locale param and renders one `WorkspaceFrame`. Derive locale-switch destination from the current pathname; preserve the approved shell appearance and current theme behavior.

- [x] **Step 5: Separate portal framing**

Move portal-specific behavior from `features/catalog/frame.tsx` to `components/layout/portal-frame.tsx` without changing its branding projection or public routes.

- [x] **Step 6: Remove per-screen workspace wrappers**

Migrate services, branding, requests, request detail, patients, caregivers, care plans and visits. Mixed portal/workspace screens render only feature content in workspace mode and retain `PortalFrame` only in portal mode.

- [x] **Step 7: Delete catalog-owned shared layout files after the last import moves**

Delete `features/catalog/frame.tsx` and `features/catalog/workspace-nav.tsx`; verify no production import remains.

- [x] **Step 8: Verify layout behavior**

Run:

```powershell
npm test -- test/workspace-navigation.test.ts test/i18n.test.ts
npm run typecheck
npm run build
```

Expected: one workspace shell per route, dictionary parity, and successful build.

### Task 6: Establish Care-Plan Pure Seams

**Files:**
- Create: `frontend/features/care-plans/contracts.ts`
- Create: `frontend/features/care-plans/validation.ts`
- Create: `frontend/features/care-plans/policies.ts`
- Create: `frontend/features/care-plans/mappers.ts`
- Create: `frontend/features/care-plans/api.ts`
- Test: `frontend/test/care-plans-validation.test.ts`
- Test: `frontend/test/care-plans-policies.test.ts`
- Test: `frontend/test/care-plans-api.test.ts`

**Interfaces:**
- Produces: explicit care-plan DTO/form types; `validatePlanContent`; state eligibility functions; version/form mappers; typed endpoint functions.
- Consumes: `apiRequest`, `Locale`, current backend route contract.

- [x] **Step 1: Write validation tests**

Pin date ordering, 60/61-day inclusive span, unique weekdays 0-6, duration 15-720, goal/instruction/task bounds, maximum 30 tasks, cancellation reason and pause-with-CANCEL reason.

- [x] **Step 2: Write policy tests**

Pin selected/current/open-draft resolution, revision eligibility, exact-version approval/activation eligibility, lifecycle action matrix and submit eligibility. Do not infer server authorization from a client role.

- [x] **Step 3: Write API adapter tests**

Mock `fetch` and assert exact path, method, body and idempotency header for list/detail/create/draft/revise/approve/preview/activate/lifecycle functions.

- [x] **Step 4: Verify all three suites fail before implementation**

Run: `npm test -- test/care-plans-validation.test.ts test/care-plans-policies.test.ts test/care-plans-api.test.ts`

Expected: missing-module failures.

- [x] **Step 5: Implement the pure modules and API adapter**

Keep validation error codes locale-independent. Keep backend-only DST, authorization and concurrency rules out of frontend validation. Hide every endpoint string and payload constructor in `api.ts`.

- [x] **Step 6: Verify the pure seams**

Run the command from Step 4.

Expected: all tests pass without React DOM dependencies.

### Task 7: Split Care-Plan Orchestration and UI

**Files:**
- Create: `frontend/features/care-plans/hooks/use-care-plans.ts`
- Create: `frontend/features/care-plans/hooks/use-plan-detail.ts`
- Create: `frontend/features/care-plans/screens/care-plans-screen.tsx`
- Create: focused files under `frontend/features/care-plans/components/`
- Create: `frontend/features/care-plans/{copy.ts,care-plans.css,index.ts}`
- Create: `frontend/messages/{ar,en}/care-plans.json`
- Modify: `frontend/app/[locale]/workspace/care-plans/page.tsx`
- Modify: `backend/test/browser/sprint5.e2e.ts`

**Interfaces:**
- Consumes: Task 6 modules and Task 5 workspace layout.
- Produces: public `CarePlansScreen` export; UI components that receive typed state and semantic callbacks only.

- [x] **Step 1: Add browser characterization before moving JSX**

Pin: create/edit validation, preview-before-activation, exact-version approval denial, no success before response, preview invalidation after draft/revision, lifecycle dialog Escape/focus return and stale conflict feedback.

- [x] **Step 2: Run the scoped browser baseline and record current behavior**

Run the Sprint 5 browser command documented by Task 1.

Expected: existing supported behavior passes; new tests exposing a confirmed defect fail before its fix.

- [x] **Step 3: Move list/detail orchestration into hooks**

Use `AbortController` or an equivalent request generation guard so stale loads cannot replace newer plan IDs. Expose typed state, selection and semantic actions; API paths remain in `api.ts`.

- [x] **Step 4: Extract editor and detail panels by responsibility**

Create editor, summary, version, preview, draft and lifecycle modules. Components must not import `apiRequest` or construct request bodies.

- [x] **Step 5: Split translations and feature styles**

Move care-plan copy to its namespace. Keep generic shared styles central and care-plan editor/task/lifecycle styles local.

- [x] **Step 6: Switch the route to the feature public interface**

`app/[locale]/workspace/care-plans/page.tsx` imports only `CarePlansScreen` from `features/care-plans`.

- [x] **Step 7: Verify source boundaries and behavior**

Run:

```powershell
npm test -- test/care-plans-validation.test.ts test/care-plans-policies.test.ts test/care-plans-api.test.ts test/i18n.test.ts
npm run lint
npm run typecheck
npm run build
```

Search with `rg "apiRequest|/agency/care-plans" frontend/features/care-plans/components frontend/features/care-plans/screens`.

Expected: no endpoint/API orchestration in rendering modules; all commands pass.

### Task 8: Split Visits from Care Plans

**Files:**
- Create: `frontend/features/visits/{index,api,contracts,copy,policies,visits.css}.ts`
- Create: `frontend/features/visits/hooks/{use-visits,use-visit-detail}.ts`
- Create: `frontend/features/visits/screens/visits-screen.tsx`
- Create: focused files under `frontend/features/visits/components/`
- Create: `frontend/messages/{ar,en}/visits.json`
- Modify: `frontend/app/[locale]/workspace/visits/page.tsx`
- Test: `frontend/test/visits-policies.test.ts`
- Test: `frontend/test/visits-api.test.ts`

**Interfaces:**
- Consumes: Task 2's server-owned assignment eligibility and Task 5 workspace shell.
- Produces: public `VisitsScreen`; visit-local status tones/policies; no imports from care-plan internals.

- [x] **Step 1: Write failing visit policy/API tests**

  Pin assignment/reassignment/bulk selection rules exposed by the server projection, reason requirements, status tones, endpoint paths, methods, bodies and idempotency headers.

- [x] **Step 2: Implement visit contracts, policies and API adapter**

  Do not encode parent-plan eligibility from incomplete client data; server remains authoritative and the UI consumes explicit action eligibility if Task 2 adds it to projections.

- [x] **Step 3: Move visit orchestration and rendering**

  Extract list filters/table, detail, candidate picker and bulk assignment. Components emit semantic callbacks only.

- [x] **Step 4: Remove cross-domain status imports**

  Visits must not import `statusTone` or any internal file from `features/care-plans`.

- [x] **Step 5: Switch the route and remove the scheduling umbrella**

  After all imports move, delete superseded `features/scheduling/` files and scheduling message/style files.

- [x] **Step 6: Verify frontend boundaries**

Run:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

Search with `rg "features/scheduling|apiRequest|/agency/visits" frontend/features/visits/components frontend/features/visits/screens frontend/app`.

Expected: no scheduling umbrella imports, no endpoint orchestration in render modules, and all frontend checks pass.

### Task 9: Freeze the Backend Facade and Extract Shared Care-Plan Internals

**Files:**
- Create: `backend/src/modules/care-plans/care-plan.types.ts`
- Create: `backend/src/modules/care-plans/care-plan.repository.ts`
- Create: `backend/src/modules/care-plans/care-plan-content.ts`
- Modify: `backend/src/modules/care-plans/care-plan.service.ts`
- Modify: `backend/src/modules/care-plans/care-plan.controller.ts`

**Interfaces:**
- Produces: explicit `CarePlanService` with the existing twelve method names; scoped loaders/projections; one recurrence-content mapping.
- Consumes: Tasks 2-4 stabilized behavior and existing Zod inputs.

- [x] **Step 1: Add the explicit service interfaces without moving behavior**

Type `createCarePlanService(db, now): CarePlanService`. Controller method calls and serialized outputs remain unchanged.

- [x] **Step 2: Run typecheck and care-plan suites**

Run: `npm run typecheck; npm test -- test/careplans`

Expected: passes before extraction.

- [x] **Step 3: Extract scoped loaders and projections**

Move plan/version locks, open-draft lookup, recurring service snapshot, exact linkage loader and version projection to `care-plan.repository.ts`. Do not create generic CRUD methods.

- [x] **Step 4: Extract recurrence input mapping**

Move `PlanContentInput`, recurrence spec mapping and JSON-to-domain parsing to `care-plan-content.ts`; all create/edit/revise/preview/activate paths use the same functions.

- [x] **Step 5: Verify unchanged behavior**

Run:

```powershell
npm run typecheck
npm test -- test/careplans
npm test -- test/scheduling/plan-lifecycle-assignment.integration.test.ts
```

Expected: all pass with no controller or contract change.

### Task 10: Extract Care-Plan Queries and Command Families

**Files:**
- Create: `backend/src/modules/care-plans/care-plan.queries.ts`
- Create: `backend/src/modules/care-plans/care-plan-draft.service.ts`
- Create: `backend/src/modules/care-plans/care-plan-clinical-approval.service.ts`
- Create: `backend/src/modules/care-plans/care-plan-activation.service.ts`
- Create: `backend/src/modules/care-plans/care-plan-lifecycle.service.ts`
- Modify: `backend/src/modules/care-plans/care-plan.service.ts`

**Interfaces:**
- Produces: `createCarePlanQueries`, `createCarePlanDraftRevisionService`, `createCarePlanClinicalApprovalService`, `createCarePlanActivationService`, `createCarePlanLifecycleService` composed by the stable facade.
- Consumes: Task 9 repository/content interfaces.

- [x] **Step 1: Extract list/detail/preview queries**

  Queries may project data but may not mutate plan/version/visit state. Run care-plan integration tests immediately.

- [x] **Step 2: Extract create/edit/revise**

  Keep recurrence validation, one-open-draft enforcement, Task 3 linkage, version increments and audit/outbox ownership together.

- [x] **Step 3: Extract exact-version clinical approval**

  Keep live authorization, linked reviewer qualification, exact service code, expiry and immutable-version checks together.

- [x] **Step 4: Extract activation/generation**

  Keep idempotency, occurrence generation, snapshots, amendment replacement and activation audit/outbox in one transaction-owning module.

- [x] **Step 5: Extract lifecycle transitions**

  Keep pause/resume/complete/cancel and future-PLANNED disposition together; reuse Task 2's assignment policy semantics.

- [x] **Step 6: Reduce the original service to composition**

  `createCarePlanService` returns the composed modules and contains no Prisma workflow implementation.

- [x] **Step 7: Verify after every extraction and once in full**

  Run after each step: `npm test -- test/careplans`.

  Final run:

  ```powershell
  npm run lint
  npm run typecheck
  npm test -- test/careplans test/scheduling
  npm run build
  ```

  Expected: all focused backend checks pass; controller interface and API response snapshots remain unchanged.

### Task 11: Separate Visit Queries from Assignment Commands

**Files:**
- Create: `backend/src/modules/scheduling/visit.queries.ts`
- Modify: `backend/src/modules/scheduling/assignment.service.ts`
- Modify: `backend/src/modules/scheduling/scheduling.controller.ts`
- Modify: `backend/src/contracts/careplans.ts`
- Modify: `backend/src/contracts/{index,events}.ts`

**Interfaces:**
- Produces: `createVisitQueries(db)` with `visitList` and `visitDetail`; assignment service owns only assign/reassign/bulk commands.
- Consumes: unchanged controller route contract and Task 2 assignment policy.

- [x] **Step 1: Add explicit query interfaces and move list/detail unchanged**

Preserve filters, local-date conversion, pagination order and sensitive projections exactly.

- [x] **Step 2: Compose query and command modules in the controller**

Do not add a generic scheduling facade unless two callers need one.

- [x] **Step 3: Complete contract barrels**

Export canonical care-plan types/events without duplicating constants. Keep response projections explicit; do not claim OpenAPI generation in this sprint.

- [x] **Step 4: Verify scheduling and contract behavior**

Run:

```powershell
npm test -- test/scheduling
npm run typecheck
npm run build
```

Expected: all pass and `assignment.service.ts` contains no list/detail query implementation.

### Task 12: Apply Architecture Gates and Close the Stabilization Sprint

**Files:**
- Modify: `docs/superpowers/specs/2026-11-02-incremental-architecture-stabilization-design.md` only if implementation evidence requires a non-contractual clarification
- Modify: `docs/08_ARCHITECTURE.md`
- Modify: `docs/10_UI_UX_DESIGN_SYSTEM.md` only if shared implementation paths changed
- Modify: `docs/07_API_CONTRACT.md` for approved behavior clarifications
- Modify: `docs/plans/sprint-05-architecture-stabilization-status.md`

**Interfaces:**
- Consumes: all prior task evidence.
- Produces: verified Stage 0-2 exit record and deferred Stage 3-6 follow-up scope.

- [x] **Step 1: Run dependency/source boundary searches**

Run from repository root:

```powershell
rg "features/catalog/(frame|workspace-nav)|features/scheduling" frontend
rg "apiRequest|/agency/care-plans|/agency/visits" frontend/features/care-plans/components frontend/features/care-plans/screens frontend/features/visits/components frontend/features/visits/screens
```

Expected: no production matches. Test assertions and documentation references may remain only when intentional and explained.

- [x] **Step 2: Run complete frontend verification**

Run in `frontend/`:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build:browser
npm run build
```

Expected: all pass with exact counts recorded.

- [x] **Step 3: Run complete backend verification**

Run in `backend/`:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all pass with exact counts recorded.

- [x] **Step 4: Run migration and browser checks**

Run the repository's existing migration validation command if documented and the Sprint 5 browser harness with available installed Chrome. Do not download browsers or infrastructure.

Expected: migration history remains valid; AR/EN, RTL/LTR, mobile/desktop, light/dark, keyboard/focus and workflow checks pass or blockers are recorded exactly.

- [x] **Step 5: Complete the five architecture gates**

Record Domain ownership, Responsibility/depth, Contracts/state, Security/transactions and Verification results. Name every deferred concern and its owning future stage.

- [x] **Step 6: Define follow-up plan boundaries**

Create no implementation code for them here. Record separate future plans for: commercial/requesting during its next touched sprint; patients/caregivers/documents when touched; tenant query/command lock infrastructure after contention/race design; contracts/worker enforcement in Sprint 7.

---

## Recommended Review Boundaries

Review each task independently. In particular, do not combine Tasks 2-4 behavioral fixes with Tasks 9-11 structural extraction in one review unit. If commits are later authorized, those task boundaries are the intended atomic rollback boundaries.

## Definition of Complete

- ADR-0012 and the three Stage 0 behaviors have explicit owner-approved semantics.
- Confirmed assignment, linkage and bulk-idempotency defects have failing-then-passing proof.
- Shared workspace layout/navigation no longer belongs to `catalog`.
- Care plans and visits are separate frontend modules with UI, validation, policies, API and orchestration responsibilities separated.
- Care-plan rendering modules contain no endpoint or HTTP implementation details.
- Backend care-plan queries and cohesive command families compose behind the unchanged controller-facing service interface.
- Visit queries no longer live in assignment command implementation.
- Full frontend/backend checks and applicable browser/migration checks have fresh recorded evidence.
- Sprint 6 product behavior has not been implemented or silently changed.

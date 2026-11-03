# Incremental Architecture Stabilization Design

Date: 2026-11-02  
Status: owner-approved 2026-11-02

## Intent

Prevent Raak from becoming difficult to change as Sprints 6 and 7 add visit
execution, customer changes, notifications, reporting and launch hardening. The
work will improve module boundaries incrementally while preserving the current
modular-monolith deployment, locked product decisions, security controls and
completed vertical slices.

The architectural work is not a separate rewrite. Each change must either
remove a demonstrated dependency problem, reduce mixed workflow responsibility,
or establish a reusable seam required by the next product slice.

## Current State

Raak is one repository with self-contained Next.js and Express projects. The
backend is a modular monolith with a separate BullMQ worker. PostgreSQL remains
the transactional system of record and tenant scope is resolved by the server.

The foundation is appropriate, but implementation boundaries have weakened:

- Frontend route adapters are generally thin, while large client screens own
  endpoint details, async state, workflow eligibility, DTO mapping and rendering.
- Frontend feature folders are sprint-oriented umbrellas. `catalog` owns shared
  workspace framing, and `people` combines patients, caregivers, documents,
  access grants and customer account workflows.
- Backend controllers are generally thin, but large services combine commands,
  queries, authorization, Prisma access, projections, transactions, audit and
  outbox work.
- Repository/query ownership is inconsistent, response contracts are mostly
  implicit, and workflow tests are much stronger in the backend than frontend.
- Shared tenant authorization currently takes a tenant `FOR UPDATE` lock for
  many reads and writes, making architecture and concurrency concerns inseparable.

## Goals

1. Keep the modular monolith and make its internal domain boundaries explicit.
2. Align frontend features with the documented business domains and user
   surfaces without changing approved UI behavior.
3. Keep route handlers/controllers thin and move workflow orchestration behind
   small, testable interfaces.
4. Separate domain queries from commands where their transaction, locking and
   authorization needs differ.
5. Standardize frontend API, async-state, pagination and conflict behavior.
6. Make cross-feature imports intentional and prevent feature dependency cycles.
7. Require architectural checks in every subsequent sprint definition of done.
8. Preserve tenant isolation, append-only history, state-machine and transaction
   invariants throughout the migration.

## Non-Goals

- No microservices, event sourcing, distributed transactions or separate domain
  databases.
- No repository abstraction around every Prisma operation.
- No global Redux-style store by default.
- No framework or design-system replacement.
- No visual redesign of the approved preview baseline.
- No simultaneous relocation of every existing file.
- No line-count target. A cohesive large implementation may remain large; a
  mixed-responsibility file must be split even if it is shorter.
- No product behavior changes hidden inside architecture work.

## Constraints

- D01-D23 and the security/business invariants remain authoritative.
- Current Sprint 5 behavior and proposed ADR-0012 require owner reconciliation
  before architecture work may encode its interpretations as permanent policy.
- Existing public route and API contracts remain stable unless a separately
  approved contract change is documented.
- Refactors involving sensitive workflows require baseline characterization and
  denial/race tests before moving orchestration.
- No large dependency installation is required for the initial architecture
  slices. A query library or contract generator requires a separate bounded
  decision and download estimate.
- Existing unrelated worktree changes must be preserved.

## Approaches Considered

### 1. Incremental stabilization with sprint gates (selected)

Establish a small set of dependency and workflow rules, then improve the modules
that each sprint touches. Begin with care plans/scheduling and commercial because
they contain the largest mixed workflow implementations and Sprint 6 depends on
their behavior.

Trade-off: the repository temporarily contains old and new module shapes, but
each migrated domain has a clear completion gate and compatibility shims are not
kept after all in-repo callers move.

### 2. Big-bang architecture rewrite (rejected)

Move all frontend and backend files into a new structure before continuing
feature development.

Rejected because it creates a large review surface, weakens evidence for security
and concurrency behavior, and delays product delivery without independently
valuable slices.

### 3. Split only the largest files (rejected)

Extract UI components and service helpers until files are shorter.

Rejected because it does not fix dependency direction, transaction ownership,
implicit contracts or duplicated async workflows. It risks producing many
shallow modules with larger interfaces and lower locality.

## Target Architecture

### Deployment

Deployment remains:

```text
Browser -> Next.js -> Express modular monolith -> PostgreSQL/private storage
                                      |
                                      -> Outbox -> BullMQ worker -> providers
```

### Frontend surfaces

Next.js route groups represent the distinct application surfaces:

```text
app/[locale]/
  (platform)/
  (portal)/
  (workspace)/
  (caregiver)/
```

Route files validate route inputs and compose a screen. Surface layouts own
navigation, theme and shell concerns. A business feature must not own the shared
workspace or portal shell.

### Frontend domain modules

The target domains are:

```text
features/
  identity/
  platform/
  catalog/
  requesting/
  commercial/
  patients/
  caregivers/
  documents/
  care-plans/
  visits/
```

Each migrated feature exposes a narrow `index.ts` interface. Its internal shape
may include:

```text
api.ts          Typed endpoint functions and response validation
contracts.ts    Frontend-safe DTO and form types
validation.ts   User-input validation for immediate UI feedback
policies.ts     Pure workflow eligibility and state derivations
mappers.ts      API DTO to view/form model conversion where shapes differ
hooks/          Async state and workflow orchestration when reusable
screens/        Route-level composition and workflow orchestration
components/     Feature-specific rendering and local interaction
```

This is responsibility-based separation, not a requirement to create every file
for every feature. UI modules render typed state and emit events; they do not own
endpoint paths, HTTP methods, payload construction or authoritative business
rules. Frontend validation improves feedback, while backend Zod schemas remain
the authoritative trust boundary. A responsibility stays colocated when it is
small, cohesive and has only one workflow owner.

Cross-feature imports use the target feature's public interface. Shared user
surface composition belongs in `components/layout`; reusable interaction
patterns such as page state, confirmation and pagination belong in
`components/patterns`; owned primitives remain in `components/ui`.

### Frontend data behavior

`apiRequest` remains the low-level security-aware HTTP adapter. Feature API
modules hide paths, methods, idempotency headers and payload construction.

A small internal async resource convention will standardize:

- idle/loading/success/error states using typed discriminated unions;
- request cancellation or stale-response protection;
- mutation success, validation and version-conflict handling;
- append versus replace pagination behavior;
- explicit refresh/invalidation after commands.

No patient or clinical draft is persisted in local browser storage. Operational
list filters and selected records use URL search parameters where refresh/back
navigation should preserve coordinator context.

### Backend domain modules

The backend remains an Express modular monolith. A migrated domain has one public
module interface and separates transport, application workflows, domain policy
and persistence ownership:

```text
modules/<domain>/
  <domain>.controller.ts       HTTP transport only
  <domain>.schema.ts           Domain request/response validation when not canonical
  <domain>.queries.ts          Read authorization and projections
  <workflow>.service.ts        One cohesive command/workflow family
  <domain>.policy.ts           Pure resource/state eligibility
  <domain>.repository.ts       Scoped loaders, locks and projections where useful
  index.ts                     Public module interface
```

This structure is intentionally pragmatic. A repository is introduced only when
it centralizes tenant-scoped loading, lock order, projection or repeated query
semantics. Simple workflow-local Prisma writes may remain in the application
service.

### Backend transaction entry points

The current shared agency gate will evolve into two explicit interfaces:

```text
withAgencyQuery(auth, action, query)
withAgencyCommand(auth, action, command)
```

Both re-resolve the live session, principal, tenant status and coarse permission.
Queries do not take a tenant writer lock. Commands use a tenant lifecycle lock
that permits safe concurrent agency activity while blocking suspension races;
domain workflows then acquire resource locks in their documented deterministic
order.

This change is security- and concurrency-sensitive. It requires contention,
suspension-race, cross-tenant and workflow race tests before replacement of the
existing gate.

### Contracts

Canonical Zod contracts remain in `backend/src/contracts`. Migrated APIs add
explicit response schemas and event schemas, not only request schemas. The
frontend consumes frontend-safe generated or deliberately mirrored contracts
without importing backend implementation source.

OpenAPI generation is a target seam, but not a prerequisite for the first
refactor. The first slices must make contracts complete enough that generation
can be added without redesigning domain interfaces.

### Worker and outbox

Outbox payloads contain resource IDs and safe routing metadata, not raw recipient
addresses, plaintext tokens, action links or patient content. A generic event
registry dispatches supported events to handlers. Unsupported events become
visible operational failures rather than silently accumulating.

Worker consolidation remains bounded to the Sprint 7 notification slice unless a
security defect requires earlier correction.

## Architectural Gates

Every implementation sprint after approval applies these gates to changed
production modules.

### Gate A: Domain ownership

- Every changed workflow has one named owning domain.
- A feature cannot import another feature's internal file.
- Shared shells/navigation do not live in a business feature.
- New cross-domain dependencies are listed in the slice report with their public
  interface and direction.

### Gate B: Responsibility and depth

- Controllers/routes contain transport and composition, not business workflows.
- JSX does not contain endpoint paths, HTTP methods or multi-step mutation logic.
- A service does not combine unrelated command families and broad read models.
- Extracted modules hide meaningful behavior; pass-through wrappers are rejected.
- Files around 400-500 lines trigger review, not automatic splitting.

### Gate C: Contracts and state

- Request and response shapes are explicit and status/error codes are typed.
- Workflow eligibility is centralized in a policy/selector rather than repeated
  across buttons, controllers and services.
- Pagination and async feedback follow the shared convention.
- Contract changes update docs and require the normal approval path.

### Gate D: Security and transactions

- Tenant scope is server-resolved and present in every repository/query path.
- Commands recheck live authority and resource policy at the application seam.
- Lock order and transaction scope are documented for concurrent workflows.
- Audit/outbox/history remain atomic with state changes.
- Sensitive response projections and outbox payloads remain minimal.

### Gate E: Verification

- Refactors begin with characterization tests for preserved behavior.
- Changed workflows include success, denial, stale-version and relevant race
  scenarios.
- Frontend production workflows gain interaction tests, not only pure helper
  tests.
- Lint, typecheck, scoped tests, full project tests and builds pass before a slice
  is reported complete; browser checks follow the existing sprint acceptance
  requirements.

## Migration Sequence

### Stage 0: Baseline and invariant repairs

Freeze architecture expansion long enough to document module dependencies and
characterize the current highest-risk workflows. Treat the current uncommitted
Sprint 5 implementation as evidence to review, not as an accepted architecture or
behavioral baseline. Resolve ADR-0012 and fix any confirmed invariant defects
before moving its code. In particular, verify plan lifecycle versus visit
assignment, care-plan/request/patient/service consistency, and concurrent bulk
idempotency.

Exit: architecture rules are documented, baseline tests protect the workflows to
be moved, and confirmed security/state defects have separate reviewed fixes.

### Stage 1: Shared frontend seams

Move workspace/portal shell and navigation ownership out of `catalog`. Establish
the feature API and typed async-state conventions using care plans as the first
consumer. Do not relocate every feature yet.

Exit: production workspace uses the approved shared shell, no business feature
owns global navigation, and one real workflow demonstrates the data convention.

### Stage 2: Care plans and scheduling

Split frontend care plans from visits and decompose `plan-detail.tsx` by cohesive
workflow panels. Split backend care-plan queries, draft/revision, approval,
activation and lifecycle command families while preserving recurrence and
transaction invariants.

Exit: no JSX embeds care-plan HTTP requests, backend command families have
focused interfaces, dependency gates pass, and existing Sprint 5 acceptance plus
new characterization tests remain green.

### Stage 3: Commercial and requesting

Separate requesting from catalog and decompose request/quote workflows. Centralize
quote/request state policies and response projections. Remove compatibility
imports once all in-repo callers use the new interfaces.

Exit: request and commercial domains have one-way dependencies and no mixed
request/quote screen or backend service owns unrelated workflow families.

### Stage 4: Patients, caregivers and documents

Split the frontend `people` umbrella into patient, caregiver and document domain
modules. Consolidate backend scoped loaders/resource policies where repeated,
preserving the distinct patient, customer and caregiver identities and document
authorization checks.

Exit: patient and caregiver features are independently navigable/testable, and
document access remains policy-driven with exact projection tests.

### Stage 5: Transaction infrastructure

Replace tenant-wide writer locking with query/command transaction entry points
after all required race and lifecycle tests exist. Migrate domains one at a time;
do not switch every service in one patch.

Exit: private reads no longer take tenant writer locks, commands retain suspension
and cross-tenant safety, and measured contention improves without race failures.

### Stage 6: Contracts, worker and final enforcement

Complete response/event schemas, introduce OpenAPI/frontend contract generation
if approved, consolidate worker dispatch, and enforce dependency rules in CI.
This stage aligns with Sprint 7 rather than pulling notification scope forward.

Exit: module dependency checks are automated, supported events have registered
handlers and dedupe tests, and frontend/backend contracts have one verifiable
source path.

## Sprint Integration Rule

Architecture work is capped to the domain touched by the product sprint plus one
direct shared seam required by that domain. A sprint may not opportunistically
restructure unrelated modules.

Each sprint plan must include:

1. Product behavior being delivered or preserved.
2. Existing architecture debt in the touched domain.
3. The smallest boundary improvement required before adding behavior.
4. Characterization and new behavior tests.
5. The five architecture gate results.
6. Deferred concerns that remain outside the sprint.

If a gate cannot pass without expanding into unrelated domains, the dependency is
recorded and exposed through a narrow temporary interface. The temporary seam has
an owner and removal stage; indefinite compatibility layers are not accepted.

## Success Measures

The stabilization is succeeding when:

- new product workflows do not increase cross-feature dependency cycles;
- route/controller files contain no business transaction orchestration;
- endpoint strings and payload construction are absent from feature JSX;
- large services shrink by cohesive workflow extraction, not helper proliferation;
- each state transition has one canonical policy and command path;
- frontend workflow tests cover denial/conflict/error recovery;
- tenant isolation and race suites continue to pass;
- architecture gates add bounded effort to each sprint rather than creating a
  separate permanent refactor project.

## Builder Decisions

The implementer may decide exact internal filenames and whether a pure helper
stays colocated, provided domain ownership, public interfaces and gates remain
clear. The implementer may also choose a minimal internal async-resource utility
shape. Adding a third-party state/query library, changing API routes, or changing
locked workflow semantics requires separate approval.

## Approval Effect

Approval authorizes creation of an implementation plan for these stages. It does
not authorize product-code changes, dependency installation, commits, deployment,
or locked product-decision changes.

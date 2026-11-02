# Sprint 3 — commercial journey checklist

Date: 2026-11-01
Scope owner: `docs/13_IMPLEMENTATION_PLAN.md` Sprint 3; ADR-0010 boundary respected
(no patient/clinical, scheduling, payments or subscription billing).

## Preconditions (verified before code)

- [x] Docs read in required order; ADR-0010 and sprint-02-status handoff read.
- [x] Git state inspected (clean tree, 75 commits, Sprint 2 merged).
- [x] Sprint 2 suite green before depending on its APIs
      (backend lint/typecheck/test 163 passed; frontend lint/typecheck/test 36 passed).
- [x] Live email-provider/domain validation gate remains open (Sprint 2 external gate);
      automated runs use synthetic capture only.

## Backend

- [x] Contracts `src/contracts/quotes.ts`: draft/edit/send/accept/reject/revision DTOs,
      server-side totals, strict unknown-field rejection.
- [x] Outbox identifiers: quote.sent / quote.responded / quote.revision_requested /
      quote.revision_sent + request lifecycle events; payloads carry IDs only.
- [x] Permission action `quotes.manage` (Owner/Admin/Coordinator) in central registry.
- [x] Schema (additive migration): quotes, quote_revision_requests, idempotency_keys;
      request decision columns; history reason; notification event type;
      partial uniques: one effective SENT per group, one DRAFT per group,
      one PENDING revision per group.
- [x] Requesting module: request-info -> AWAITING_CUSTOMER, portal respond,
      approve prerequisites (accepted quote OR fixed-price acknowledgment snapshot,
      feasibility attestation, coordinator authority), reject with reason,
      portal withdraw; history/audit/outbox in one transaction.
- [x] Commercial module: draft create/edit, send (freeze + supersede + resolve
      revision atomically), lazy expiry, verified customer accept (Idempotency-Key,
      single-use semantics, explicit version consent), reject, revision request,
      coordinator revision list/decline/resolve-with-replacement.
- [x] Verified-access enforcement: guest session bound to the request or owning
      customer account only; other requests 404; drafts never customer-visible.
- [x] Projections privacy-minimal: no contact/beneficiary/notes in quote payloads.

## Tests (backend)

- [x] Unit: quote totals math (U10), revision-pending acceptance denial (U11),
      DTO validation.
- [x] Integration: happy E03 chain; denial matrix (roles, cross-tenant 404,
      wrong-request guest 404, unauthenticated 401); expiry/replay; I10
      (v1 superseded acceptance denied); I11 (same key = one acceptance/outbox);
      concurrent send/accept races; approve prerequisites; fixed-price path;
      terminal-state guards.
- [x] Migration/seed replay on disposable DB; prisma validate/diff.

## Frontend

- [x] Workspace request detail: decisions (info/approve/reject), quote versions,
      draft editor + send, revision queue (decline / resolve-with-replacement).
- [x] Portal verified request view: status timeline, info response, withdraw,
      quote versions with accept/reject/revision request and disabled states.
- [x] Shared-UI reuse only (Field/Button/Dialog/StatusBadge/Feedback/Select);
      no page-local competing primitives.
- [x] Translations ar/en in feature namespace; RTL/LTR; loading/error/empty states.

## Browser E2E

- [x] Sprint 3 harness (installed Chrome, same-origin ingress, synthetic data):
      E03 quote revision journey AR + EN; fragment replay denial; I10/I11 UI-level.

## Docs

- [x] 07 API contract Sprint 3 section (routes, DTOs, codes).
- [x] 06 data model: new tables, constraints, indexes.
- [x] 04 business rules: implementation notes for expiry/idempotency where needed.
- [x] 11 notifications: new durable events; delivery remains Sprint 7 matrix.
- [x] 12 test plan + 13 implementation plan: Sprint 3 milestone ownership notes.
- [x] sprint-03-status.md with command ledger, demonstrated/open criteria, handoff.

## Verification gate

- [x] backend + frontend lint, typecheck, tests, builds; prisma validate,
      migrate status, disposable-DB replay; browser E2E; git diff --check.
- [x] No commits/pushes/deployments (owner-run only).

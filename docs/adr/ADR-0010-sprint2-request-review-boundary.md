# ADR-0010 — Sprint 2 request-review acceptance boundary

Date: 2026-11-01
Status: Accepted — product owner approval, 2026-11-01

## Context

The Sprint 2 implementation request requires E02 in Arabic and English while
limiting implementation to Sprint 2. The authoritative documents disagree about
the final portion of that journey:

- `12_TEST_PLAN.md`, E02: portal → guest submission → verified status →
  **coordinator receives queue → reviews**.
- `13_IMPLEMENTATION_PLAN.md`, Sprint 2: catalog, branding, guest form,
  verification, locale validation, spam protection, **queue states** and receipt.
- The same plan assigns **review queue and states** to phase 3, and coordinator
  request decisions to Sprint 3. `03_USER_FLOWS.md` F03 describes that review.
- `11_NOTIFICATIONS.md` and F02 require the new-request coordinator in-app
  notification. Persisting that notification is distinct from implementing a
  review queue or a SUBMITTED → UNDER_REVIEW command.

ADR-0009 resolves E01 ownership but does not resolve E02 ownership. Choosing to
move review into Sprint 2 or to split the E02 exit would change a documented
milestone. Neither choice is silently treated as approved.

## Decision (owner-approved)

Include the minimum coordinator review slice in Sprint 2:

1. Tenant-scoped, paginated `GET /agency/requests` and restricted detail.
2. Central policy for Owner/Admin/Coordinator reads and start-review, enforced at
   HTTP and service boundaries, with tenant/resource constraints.
3. `POST /agency/requests/:id/start-review` atomically performs only
   SUBMITTED → UNDER_REVIEW, with status history, audit and expected-version
   conflict handling. It creates no patient, quote, plan or visit.
4. Workspace queue/detail built from the promoted shared UI.
5. E02 in both languages includes coordinator notification, opening the queue
   and starting review. Subsequent request decisions remain Sprint 3.

The owner explicitly approved including only coordinator queue/detail and
SUBMITTED → UNDER_REVIEW in Sprint 2, demonstrating E02 as currently written.

Alternative: preserve the strict Sprint 2 work-order boundary and formally split
E02 into intake/verified status/notification in Sprint 2 and queue/review in
Sprint 3. Full E02 would remain open until Sprint 3, like the E01 split in
ADR-0009. This also requires approval before changing milestone documentation.

## Customer-account scope reconciliation

The Sprint 1 status report labels customer self-registration as Sprint 2 work.
The authoritative Sprint 2 work order does not assign self-registration or
request claiming to Sprint 2. F05 and E04 put account registration, fresh claim
verification and patient grants in the customer onboarding journey; Sprint 4
explicitly owns F05. The proposed implementation therefore supports guest
request access without account creation and preserves existing tenant-customer
login. It does not infer request ownership from a matching account email or
create PatientAccess. The handoff sentence is not authority to expand scope.

## Consequences

- Docs: update milestone ownership in `12_TEST_PLAN.md` and
  `13_IMPLEMENTATION_PLAN.md`, keeping the complete E02 requirement intact.
- API: existing specified queue/detail/start-review routes are implemented
  earlier; document exact DTOs, pagination, projections and conflict codes.
- Schema: additive request/history/outbox/notification tables are already needed
  for Sprint 2; start-review additionally uses request version and history.
- Migration: additive only; no alteration of applied Sprint 1 migrations.
- QA: include race of concurrent start-review, role denials, cross-tenant
  reads/mutations and notification access in the Sprint 2 matrix.
- Locked D01–D23, patient authority and commercial/scheduling rules are unchanged.

## Approval

Owner instruction: “include only coordinator queue/detail and SUBMITTED →
UNDER_REVIEW in Sprint 2, allowing E02 to pass as written.”

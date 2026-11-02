# ADR-0011 — Sprint 4 conservative access and acceptance reconciliation

Date: 2026-11-02.
Status: accepted by the owner on 2026-11-02, including the acceptance mapping below.

## Context

D04/D05/D09 require independently verified request ownership, explicit patient
authority and manual duplicate decisions. The scope catalog defines VIEW_DOCUMENTS
but no patient attachment-write scope. The permission matrix calls coordinator
grant management “controlled”, without specifying a delegation mechanism.

The architecture describes a proposed presigned object-upload transport. Direct
storage download URLs cannot enforce immediate grant revocation after issuance.
The API contract does not freeze upload/download DTOs before this implementation.

## Conservative implementation details

- Owner/Admin issue/revoke grants and verify qualifications. Coordinators manage
  operational patients/caregivers and upload ordinary attachments/qualification
  evidence, but cannot issue grants or access authorization-evidence documents.
  No coordinator delegation is inferred from their role.
- Customer VIEW_DOCUMENTS permits reading PATIENT_ATTACHMENT content only. It
  does not authorize uploads or expose authorization/qualification evidence.
  Customer writes remain denied until an explicit write permission is approved.
- Customer sign-in uses `/portal/accounts/login`, which explicitly selects the
  customer audience even if a staff identity shares that tenant email. The legacy
  `/auth/login` staff-first behavior is preserved. Same-email identities remain
  independent; a staff session cannot perform customer claims or acquire grants.
  Independent same-email accounts across tenants remain supported as before.
- Uploads are API-mediated, session/CSRF protected, size-bounded and create-only
  in private S3-compatible storage. This is the basic transport behind the existing
  upload-intent/finalize contract, not a public storage URL. No external call occurs
  in a database transaction.
- Download returns a 60-second opaque capability URL on the API origin, bound to
  the current session. It is hash-authorized in PostgreSQL rather than a public
  S3 bearer URL. Every content request rechecks principal, tenant, parent,
  classification, scan status and grant, including after storage I/O. Revocation
  denies even a previously issued link on subsequent requests. Already delivered
  bytes cannot be recalled.
- A scan is reserved before scanner I/O. Only one finalizer can run; expired or
  abandoned reservations quarantine. Provider absence/error never means CLEAN.

These choices implement deny-by-default and do not add patient authority, clinical
capabilities or change locked decisions. Enabling customer writes or coordinator
delegation requires a separately approved authorization contract.

## Acceptance mismatch — owner-approved correction

`13_IMPLEMENTATION_PLAN.md` Sprint 4 exit previously named I12. `12_TEST_PLAN.md` I12 means
“pending customer change request leaves the original visit unchanged”, owned by
Sprint 6. It is neither relabelled nor implemented here.

Approved Sprint 4 evidence mapping: **F05/F06, E04 in AR/EN, U12, I16, exact I01
patient/document isolation, caregiver foundations and denial/race matrices**.
The owner explicitly approved this correction on 2026-11-02. The implementation
plan and test-matrix references are updated accordingly; no Sprint 6 requirement
is weakened or moved. This changes documentation and acceptance ownership only:
no schema, API or migration changes, and no relaxation of required QA evidence.
Private S3 and live email verification remain owner-deferred/open; mapping
approval does not accept either infrastructure gate or claim I12 passes.

## Impacts

Additive customer-capability, patient/grant/review, caregiver qualification/service/
availability and private-document persistence; new typed routes documented in 07.
UI composes existing shared primitives and maintains independent realm journeys.
QA must prove active grant scopes, wrong-parent denial, fresh claims, scan races,
revoked download links and migration/seed replay. Live email/S3/ClamAV checks remain
external verification gates when those services are unavailable.

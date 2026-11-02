# Sprint 4 — People and Access Implementation Plan

Date: 2026-11-02. Status: local implementation verified; private-storage acceptance
is owner-deferred/open; milestone remapping is owner-approved. See sprint-04-status.md.

## Goal and architecture

Implement F05/F06 and E04 as tenant-bound workflows using the existing Express,
Prisma, session/CSRF, central policy, audit/outbox and Next.js shared-UI modules.
Keep customer request ownership distinct from independently reviewed patient
authority. No scheduling, care plans or visit execution is included.

Specifications: docs 01–13, ADR-0007, ADR-0009 and ADR-0010; D01–D23 remain locked.

## Checklist and dependencies

- [x] Review authoritative specifications, locked decisions, ADRs and Sprint 3 handoff/review.
- [x] Inspect Git state: clean at start; PostgreSQL/Redis containers healthy;
      installed Node 24.21.0 and npm 11.19.0. No downloads authorized or needed yet.
- [x] Customer onboarding: `backend/src/modules/customers/`,
      `backend/src/contracts/people.ts`, additive Prisma migration, API integration
      tests. Registration uses hashed credentials and single-use tenant-bound email
      verification; a separate customer-bound claim capability proves current request
      ownership. Matching email alone never associates a request.
- [x] Patient operations: `backend/src/modules/patients/`, same contract/migration,
      API tests; minimal profile list/detail/edit, staff-only same-tenant duplicate
      suggestions, explicit reviewed create/link of APPROVED requests.
- [x] PatientAccess: patient module with central `patients.grants` authority,
      reviewer/time/method/scopes/evidence/expiry and immediate revocation. Start with
      Owner/Admin issuance; coordinator delegation is not inferred from their role.
- [x] Caregiver setup: `backend/src/modules/caregivers/`, caregiver contracts and
      additive persistence; preserve existing invitation/account linkage. Separate
      operational status, verified qualifications and service authorizations.
- [x] Availability: validated multi-interval weekly persistence, single interval
      per weekday UI, dated overrides/leave, revisions; eligibility response explicitly
      excludes booking/conflict confirmation and Sprint 5 matching.
- [x] Documents application controls: `backend/src/modules/documents/`, private storage/scanner adapter,
      parent/classification/scope authorization, size/type/signature checks and
      quarantine. Missing adapters must return unavailable, never CLEAN or public URLs.
- [x] Frontend: feature-local customer/patient/caregiver/document compositions,
      locale routes, `messages/{ar,en}/people.json`; reuse `components/ui/` and layout
      primitives after inspecting their current interfaces. Extend board if needed.
- [x] Synthetic fixtures and repeatable migration/seed replay.
- [x] Documentation: API/schema/permissions plus status/review/local-check reports.
- [x] Local verification: lint/typecheck/tests/build both projects, Prisma validate,
      status/drift, disposable DB replay, installed-browser AR/EN/theme/viewport checks,
      and scoped maintainability/security review. Record commands and actual results.
- [ ] External acceptance: genuinely private storage (cached emulator failed
      anonymous-read denial) and live email proof; owner deferred both to later.
- [x] Owner approved ADR-0011's milestone correction on 2026-11-02.
- [x] Real ClamAV proof: owner-provisioned healthy pinned engine returned CLEAN
      for the synthetic control and REJECTED for in-memory EICAR on 2026-11-02.

## Transaction and authorization invariants

- Server host resolution establishes tenant; session establishes principal. No
  body tenantId, email similarity, relationship or platform role grants content.
- Recheck current tenant/account/session/policy within workflow transactions.
- Serialize writers in existing order: tenant first, then scoped resource. Claim
  token consumption and owner association commit together; competing claim cannot
  overwrite ownership. Quote/version/acceptance rows are never rewritten.
- Recompute duplicate candidates inside the create/link transaction, persist each
  decision and ignored-candidate reason. Never auto-merge; patient linking is
  replay-safe and cannot replace a prior link with another patient.
- Every grant read checks tenant, customer, exact scope, status, revokedAt and
  expiry against server time. Customer summaries exclude restricted operational
  fields; caregiver cannot browse patients. Audit/outbox accompanies mutations.
- Document authorization checks parent, classification, current grant and scan
  status at access time. No external provider calls in DB transactions. Signed
  access must have documented short TTL/revocation limits; unavailable scan/storage
  remains a blocking verification gate.

## Acceptance mapping — owner-approved 2026-11-02

`13_IMPLEMENTATION_PLAN.md` Sprint 4 exit previously named I12, but `12_TEST_PLAN.md`
defines I12 as pending visit-change requests preserving the original appointment.
That requirement remains with Sprint 6 and will not be relabelled or claimed here.
Approved Sprint 4 mapping: **F05/F06, E04 (AR/EN), U12, I16 and exact I01
patient/document-by-ID isolation**, plus caregiver qualification/availability and
denial/race evidence. Owner approval is recorded in ADR-0011 and the milestone
text is corrected. Private S3/live email gates remain owner-deferred/open.

## Test interfaces and review focus

The requested public HTTP API, pure DTO/domain rules, and real browser journeys
are the test interfaces; PostgreSQL assertions additionally prove durable atomicity
and constraints. Use real isolated synthetic tenants, injected clocks/email/storage
and scanner adapters; no real PHI or fabricated delivery/scan success.

Prioritize wrong-host capability use without consumption; stale/replayed claims;
duplicate candidates appearing between preview and save; exact grant-expiry and
revocation/download boundaries; qualification expiry on the eligibility date;
overlapping weekly/effective periods and leave; untrusted file metadata/signatures;
and restricted projection leakage. Each owning module needs denial and concurrency
tests before acceptance. External live email delivery remains open from Sprint 3.

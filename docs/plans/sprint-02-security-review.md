# Sprint 2 scoped review

Date: 2026-11-01
Scope: new catalog, guest intake/verification/review, delivery worker, additive
schema and shared-UI adoption. This is engineering review evidence, not a
clinical, legal or regulatory certification.

## Baseline and changed trust paths

Sprint 1's host/session/CSRF/policy protections were verified before changes.
New guest capability routes remain on the server-resolved agency host; staff
mutations use both the HTTP policy and transactional current-account checks.
The requesting transaction coordinates a tenant, offering, request, initial
history/audit/outbox and per-principal safe notifications. Capability consumption
creates a request-only guest session; no patient/grant association exists.

Higher-risk paths reviewed: strict body validation, catalogue publication and
area consistency, tenant suspension serialization, one-use capability claims,
status projections, AES-GCM delivery-secret handling, worker recipient/state
rechecks, provider calls outside transactions, dedupe/lease/failure recovery,
public logo decoding/re-encoding and same-tenant composite FKs.

## Findings and remediation

| Finding | Severity at discovery | Resolution / proof |
|---|---|---|
| Split-port dev origins denied; Idempotency-Key missing from CORS | High functional blocker | Exact allowlist + matching tenant hostname; preflight header allowed; real API regression reproduced 403 before fix |
| Query encoded into pathname with configured API origin | Medium | Parse resource pathname/query separately; frontend regression reproduced `%3Fcursor` before fix |
| Retained failed BullMQ job could strand durable outbox delivery | Medium | Retry retained failures, bounded infrastructure retries, durable delivery leases; real Redis/BullMQ failure/recovery test |
| Expired final delivery lease could remain SENDING forever | Medium | Explicit FAILED/LEASE_EXHAUSTED reconciliation and regression test; never falsely mark SENT |
| Published edit/branding removal could invalidate intake areas | Medium | Revalidate published offerings in both commands; API regression reproduced 200 instead of 422 before fix |
| Same-tab email fragment navigation did not re-process a capability | Medium functional | Browser replay check reproduced missing verification action; hash listener plus async revision guard fixed it; both localized browser journeys and production matrix pass |

The read-only independent reviewer did not identify a concrete cross-tenant
read or guest verification bypass in the inspected paths. Findings were fixed
by the implementer and verified through tests; this is not a claim of a second
independent post-fix audit.

## Preserved invariants

- Client tenant/role/status/patient fields rejected; every resource read/write
  scoped to resolved tenant and authorized principal or verified guest request.
- Reference-only access denied; tenant/purpose/email/expiry/single-use bound
  capabilities and request-only sessions; private guest projections omit intake
  identity and notes.
- Idempotency/published-version checks and serialized initial transition.
- No external provider calls in domain DB transactions; events contain IDs;
  delivery secret encrypted and scrubbed, authorization secrets hashed.
- Restrictive, bounded PNG pixel re-encoding for explicitly public branding;
  no sensitive-document upload or public original file introduced.
- No confirmed appointment, patient, PatientAccess or email-only account claim
  from guest request submission/verification.

## Limits / remaining operational gates

No live email provider/domain proof, multi-instance IP limit proof, deployment
edge/TLS test, performance budget measurement or complete MVP security audit is
claimed. Provider API keys and verified sender configuration are external;
automated email checks use capture delivery and failure injection. Other business
notification/event kinds remain owned by later sprints. See the status report's
exact command ledger and acceptance matrix for demonstrated coverage.

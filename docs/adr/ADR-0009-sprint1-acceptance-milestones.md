# ADR-0009 — Sprint 1 acceptance milestone reconciliation

Date: 2026-11-01
Status: Accepted (product owner instruction, Sprint 1 closure slice)

## Context

The Sprint 1 exit criterion in `docs/13_IMPLEMENTATION_PLAN.md` reads
"E01 and I01/I05/I06/I15 pass", but Sprint 1 intentionally delivered only the
control plane and auth foundation. Two of those cases cannot be demonstrated
in full within Sprint 1's scope:

- **E01** (agency registration) ends with "configure brand/services → portal
  visible", which requires the Sprint 2 catalog, branding and portal work.
- **I01** (tenant A requests tenant B patient/visit/document by id) requires
  patient/visit/document objects that first exist in Sprints 4–6.

The underlying requirements must not be weakened; only their milestone
ownership is clarified.

## Decision (owner-approved)

1. **E01 split:** Sprint 1 proves E01 steps 1–4 at the API level:
   register → email verification → PENDING_APPROVAL → operator activation
   (plus owner login observing ACTIVE). Full E01 — branding/service
   configuration and a visible branded portal — remains open and must be
   demonstrated in Sprint 2. The full acceptance text in
   `docs/12_TEST_PLAN.md` is unchanged.
2. **I01 ownership:** exact patient/visit/document object-by-ID isolation
   remains mandatory and is demonstrated in the sprints that own those
   domains (patients/documents in Sprint 4, visits in Sprint 5–6), including
   the release gates. Sprint 1 demonstrates the equivalent boundary it owns:
   host-realm isolation and session isolation — cross-host session denial,
   wrong-tenant login denial, wrong-host invitation acceptance denial (I06),
   and suspension killing sessions (I15).
3. I05 (duplicate email across tenants), I06 (invitation misuse) and I15
   (suspension mid-session) are Sprint 1 exit criteria and remain fully in
   force there.
4. **I06 strengthened beyond the original plan:** invitation tokens must be
   consumed on the invitation's own server-resolved tenant host. Acceptance
   attempted on another tenant host or the platform host is rejected with a
   generic non-enumerating error without consuming the token or creating an
   account. Expiry, single-use, suspension and concurrency protections are
   unchanged. This closes the host-mismatch gap in the Sprint 1 plan's
   original "host-agnostic acceptance" assumption.

## Consequences

- `docs/13_IMPLEMENTATION_PLAN.md` Sprint 1/Sprint 2 exit wording and
  `docs/12_TEST_PLAN.md` milestone mapping now state this split explicitly.
- Sprint 2 must demonstrate full E01; Sprints 4–6 must demonstrate exact I01
  isolation per object type before their exit criteria are met.
- The MVP release gates in `docs/02_SCOPE_AND_ACCEPTANCE.md` are unaffected:
  nothing is deferred past them.
- API contract docs (`05`, `07`) now document tenant-host-bound invitation
  acceptance.

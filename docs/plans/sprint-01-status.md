# Sprint 1 verification status

Status: **Sprint 1 control plane and auth implemented, hardened, locally
verified, and closed** (closure slice 2026-11-01, ADR-0009). This is a
foundation milestone, not MVP or production readiness.

## Milestone reconciliation (ADR-0009, owner-approved)

- Sprint 1 proves **E01 steps 1–4** (register → verify email →
  PENDING_APPROVAL → operator activation) at API level. **Full E01**
  (branding/services configuration → portal visible) remains open and is a
  Sprint 2 exit requirement.
- **Exact I01** patient/visit/document object-by-ID isolation remains
  mandatory in the owning domain sprints (patients/documents Sprint 4,
  visits Sprints 5–6) and in the release gates. Sprint 1 demonstrates the
  boundary it owns: **host-realm and session isolation** (cross-host session
  denial, wrong-tenant login denial, wrong-host invitation acceptance,
  suspension revoking sessions). No patient/visit/document objects exist in
  Sprint 1, so object-by-ID cases cannot exist there yet.
- I05, I06, I15 remain fully demonstrated in Sprint 1 (nothing weakened).

## Implemented (Sprint 1 core)

- Identity schema and migration `20261027181752_sprint1_identity`: platform
  operators, tenant staff/customer accounts, staff invitations, opaque
  server-side sessions (sha256-at-rest), email capability tokens, caregiver
  link and append-only audit events; synthetic idempotent seed.
- Crypto utilities (scrypt N=16384/r=8/p=1, random tokens, timing-safe
  compare), session service with CSRF binding and realm-separated host-only
  cookies, host-realm resolver (trusted `Host` only; deny by default),
  deny-by-default permission gate, in-memory rate limiting.
- Routes: agency registration → owner email verification → realm login/logout/
  me → forgot/reset password; staff invitation issue/accept; platform tenant
  list/detail/activate/suspend with session revocation and operator audit.
- Frontend: AR/EN register, login, verify-email, reset-password,
  accept-invitation and platform tenant screens with RTL/LTR, locked tokens,
  mobile-overflow-safe layouts, `Referrer-Policy: no-referrer`.
- Email action links carry capability tokens in the URL **fragment** (never
  query strings); clients consume the fragment once and clear it after use.
- Concurrency hardening: tenant lifecycle compare-and-set transitions,
  tenant-row locking for login/invitation issue/accept against concurrent
  suspension, atomic capability-token claims (single-use + expiry in one
  conditional update), sibling password-reset token invalidation under a
  principal-row lock with stale-issuance suppression, unique-violation mapping
  for duplicate slug registration and concurrent same-email acceptance.
- ADR-0008: owner-approved same-origin `/v1` ingress on platform/tenant hosts
  with validated host preservation; docs 03/07/08 updated accordingly.

## Closure slice (2026-11-01) — implemented changes

1. **I06 host binding closed.** `POST /v1/staff/invitations/accept` now
   requires the invitation's own server-resolved tenant host
   (`backend/src/modules/staff/staff.service.ts`,
   `staff.controller.ts`). Wrong-tenant or platform-host acceptance is
   rejected with the same generic `UNAUTHENTICATED` error as an unknown
   token (no enumeration), **without consuming the token or creating an
   account**; retry on the correct host succeeds. Expiry, single-use,
   suspension-lock and concurrency protections preserved. Red/green proof:
   with the old service code the new test failed (`expected 200 to be 401`),
   with the fix all 15 invitation tests pass. Generated links already target
   `{slug}.<base>/ar/accept-invitation#token=…` and the frontend form posts
   same-origin, so no frontend change was required.
2. **I05 exact coverage.** Customer accounts with the same email in two
   tenants: independent logins on their own hosts, distinct sessions,
   server-resolved tenant binding verified via `/auth/me`, cross-tenant and
   customer-on-platform session denial, and refusal of customer credentials
   on the platform host (`backend/test/auth/auth.routes.integration.test.ts`).
   Staff duplicate-email coverage retained.
3. **Service-boundary authorization.** Single central `authorize()` registry
   with a shared `principalFromAuth()` helper
   (`backend/src/modules/auth/permissions.ts`); the HTTP permission gate and
   the service boundary evaluate the same policy (docs 05 rule 5).
   `staff.createInvitation` and all platform control-plane methods
   (list/detail/activate/suspend/audit) re-check the policy at the service
   boundary; denial proven through direct service calls with non-privileged
   principals (coordinator/suspended staff; staff-principal on platform
   operations).
4. **Docs reconciled.** ADR-0009 recorded; `docs/13_IMPLEMENTATION_PLAN.md`
   Sprint 1/Sprint 2 exits, `docs/12_TEST_PLAN.md` milestone mapping,
   `docs/05_AUTH_AND_PERMISSIONS.md`, `docs/07_API_CONTRACT.md` and this
   plan's Task 7 updated. Original full acceptance requirements preserved.

## Fresh backend evidence (closure slice, run from `backend/`; live PostgreSQL 5433 / Redis 6380)

| Command/check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 16 files, **144 tests passed, 0 skipped** (was 136 pre-closure; +3 I05 customer, +3 I06 host/race, +2 service-boundary denial) |
| `npm run build` | exit 0, `dist/index.js` + `dist/worker.js` emitted |
| `npm exec -- prisma validate` | schema valid |
| `npm run migrate` twice on temporary empty DB `raak_sprint1c_verify` | both migrations applied; replay: no pending migrations |
| `npm run seed` twice on that DB | both exit 0, stable counts (2 tenants, 1 operator, 3 staff, 1 customer, 2 invitations) |
| `npm exec -- prisma migrate status` on that DB | schema up to date |
| Temporary DB cleanup | `raak_sprint1c_verify` dropped; `pg_database` check confirms only dev/shadow databases remain |

Note: the previously recorded "last backend test run blocked by Docker being
down" was an environment failure, not a code regression — with Docker Desktop
started and the existing `raak-postgres-1`/`raak-redis-1` containers (images
already present, no downloads) the full suite passes. No owner-run downloads
were needed this slice.

## Fresh frontend evidence (closure slice, run from `frontend/`; includes the owner's uncommitted design-preview work, preserved)

| Command/check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 5 files, 32 tests passed, 0 skipped |
| `npm run build` | exit 0 |

## Security review and hardening (Sprint 1 core, carried forward)

Three independent read-only review rounds over the full Sprint 1 diff plus
fix verification rounds. All actionable findings fixed with regression tests
(suspension-vs-login/mutation TOCTOU, concurrent lifecycle double-apply,
token expiry bypass between check and consumption, concurrent duplicate
registration 500s, sibling password-reset link survival, reset issuance race,
invitation acceptance bypassing suspension, concurrent same-email acceptance
500s, invitation email 404s, capability tokens in query strings/referrers,
production route wiring, production topology vs docs — resolved by ADR-0008).
The closure slice adds the invitation-host mismatch fix and service-boundary
re-authorization. Residual deployment risks (external validation gates, not
code defects):

- ADR-0008 edge routing, external-host preservation, forwarding-header
  sanitization, wildcard TLS/DNS and host-only cookie behavior require
  production deployment validation.
- Locale-fragment behavior lacks real-browser E2E (Playwright) coverage for
  hydration/middle-click/context-menu navigation.
- In-memory rate limiting is per-process; shared enforcement needed before
  multi-instance deployment.

## Not implemented / deferred (exact remaining gates)

- **Full E01** — branding, service catalog and visible branded portal:
  Sprint 2 exit requirement (ADR-0009).
- **Exact I01** patient/visit/document object-by-ID isolation: mandatory in
  Sprints 4–6 (patients/documents Sprint 4; visits Sprints 5–6) and in the
  MVP release gates.
- Agency settings, branding, notification policies, service catalog and
  customer-facing portal screens (Sprint 2; E01 steps 5+).
- Customer account self-registration screen (Sprint 2 guest intake); customer
  accounts exist via seed/tests only.
- Playwright browser E2E suite (API-level E01 proof
  `backend/test/e2e/e01-registration.flow.integration.test.ts` covers
  register → verify → pending → activate → login observes ACTIVE).
- Real email delivery (worker still logs outbox events; tests read outbox
  rows).
- Remaining release gates in `docs/12_TEST_PLAN.md` (quotes, plans, visits,
  notifications, reports, backup/restore rehearsal) — owned by later sprints.

## Owner-run downloads (>~50 MB)

None required this sprint or closure slice. No large downloads were executed
by the agent. (Docker Desktop was started by the agent as an installed local
application; no images were pulled.)

## Handoff

- Next work order: Sprint 2 — agency catalog, guest intake and customer
  registration per `docs/13_IMPLEMENTATION_PLAN.md`. Sprint 2 must also
  demonstrate full E01 end to end (ADR-0009).
- Sprint 1 definition of done (`docs/plans/sprint-01-control-plane-auth.md`)
  is met with the ADR-0009 milestone mapping: I05 (staff + customer),
  I06 (including tenant-host bound acceptance), I15 plus CSRF/cross-host/
  wrong-tenant matrices green, concurrency matrices green, E01 steps 1–4
  green at API level, service-boundary authorization proven, Super Admin
  tenant list functional in AR/EN, all lint/typecheck/test/build/migrate
  checks green with fresh evidence above.

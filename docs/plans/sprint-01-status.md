# Sprint 1 verification status

Status: **Sprint 1 control plane and auth implemented, hardened and locally
verified**. This is a foundation milestone, not MVP or production readiness.

## Implemented

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

## Fresh backend evidence (run from `backend/`)

| Command/check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 16 files, 136 tests passed, 0 skipped (live PostgreSQL) |
| `npm run build` | exit 0, `dist/index.js` + `dist/worker.js` emitted |
| `npm exec -- prisma validate` | schema valid |
| `npm run migrate` twice on temporary empty DB `raak_sprint1_verify` | both migrations applied; replay: no pending migrations |
| `npm run seed` twice on that DB | both exit 0, stable counts (2 tenants, 1 operator, 3 staff, 1 customer, 2 invitations) |
| `npm exec -- prisma migrate status` on that DB | schema up to date |
| Production bundle bootstrap smoke (`dist/index.js` with DATABASE_URL/BASE_DOMAIN/PLATFORM_HOST) | `/v1/auth/me` on `afiya.localhost` → 401 `UNAUTHENTICATED`; `/v1/platform/tenants` on `platform.localhost` → 401 — auth/platform routes mounted in the real process |

The temporary database (and one stray `=public` database created by a local
PowerShell interpolation slip during rehearsal) were dropped; a
`pg_database` query confirmed neither remains. The normal development
database is preserved. Ports: PostgreSQL 5433, Redis 6380.

## Frontend evidence (run from `frontend/`)

| Command/check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 4 files, 28 tests passed, 0 skipped |
| `npm run build` | exit 0; all auth/platform/accept-invitation routes emitted |
| `/ar/register` response header | `Referrer-Policy: no-referrer` |

Real-browser smoke (installed headless Chrome via CDP, built `next start`):

- 360px and 1440px: no horizontal overflow (`scrollWidth == viewport`) on
  register, login, accept-invitation and platform tenants; localized
  headings correct in AR/EN.
- `#token=` fragment retained until consumption; language-switch href
  preserves the fragment (switch renders non-interactive until hydration on
  capability pages so it can never drop the token).
- Legacy `?token=` links: token stripped from the location and **refused**
  (submit disabled); no token in server-rendered HTML.
- Screenshots: `C:\Users\ashra\AppData\Local\Temp\opencode\sprint1-final-*.png`.

## Security review and hardening

Three independent read-only review rounds over the full Sprint 1 diff plus
fix verification rounds. All actionable findings fixed with regression tests:

- suspension-vs-login/mutation TOCTOU (High) → tenant-row locking + CAS
  lifecycle transitions; concurrent lifecycle double-apply; token expiry
  bypassed between check and consumption; concurrent duplicate registration
  returning 500; sibling password-reset links surviving a completed reset;
  reset issuance racing reset completion; invitation acceptance bypassing
  suspension; concurrent same-email acceptance returning 500; invitation
  emails leading to a 404; capability tokens in query strings/referrers;
  production API route wiring (`db` never injected in `src/index.ts`);
  production topology contradicting docs (resolved by owner-approved
  ADR-0008).

Final review verdict: **no actionable findings remain**. Residual deployment
risks (external validation gates, not code defects):

- ADR-0008 edge routing, external-host preservation, forwarding-header
  sanitization, wildcard TLS/DNS and host-only cookie behavior require
  production deployment validation.
- Locale-fragment behavior lacks real-browser E2E (Playwright) coverage for
  hydration/middle-click/context-menu navigation.
- In-memory rate limiting is per-process; shared enforcement needed before
  multi-instance deployment.

## Not implemented / deferred

- Agency settings, branding, notification policies, service catalog and
  customer-facing portal screens (Sprint 2; E01 steps 5+).
- Customer account self-registration screen (Sprint 2 guest intake); customer
  accounts exist via seed/tests only.
- Playwright browser E2E suite (API-level E01 proof
  `backend/test/e2e/e01-registration.flow.integration.test.ts` covers
  register → verify → pending → activate → login observes ACTIVE).
- Real email delivery (worker still logs outbox events; tests read outbox
  rows).

## Owner-run downloads (>~50 MB)

None required this sprint. No large downloads were executed by the agent.

## Handoff

- Next work order: Sprint 2 — agency catalog, guest intake and customer
  registration per `docs/13_IMPLEMENTATION_PLAN.md`.
- Definition of done for Sprint 1 (`docs/plans/sprint-01-control-plane-auth.md`)
  is met: I05/I06/I15 plus CSRF/cross-host/wrong-tenant matrices green,
  concurrency matrices green, E01 steps 1–4 green at API level, Super Admin
  tenant list functional in AR/EN.

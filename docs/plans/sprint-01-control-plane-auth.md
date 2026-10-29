# Sprint 1 — Control Plane and Auth (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tenant lifecycle (register → verify → operator activate/suspend), staff/customer/platform auth realms with secure sessions, CSRF, tenant host resolution, permission service, staff invitations, and the Super Admin tenant list.

**Architecture:** Express module per domain (`backend/src/modules/<domain>/` with controller/schema/service/repository) on existing Sprint 0 shell. Opaque server-side sessions (sha256-at-rest secret) in `auth_sessions`; host-only cookies per realm; double-submit CSRF bound to the session row; deny-by-default `authorize()` policy gate; all state changes audited via append-only `audit_events` and outbox email events committed in the same transaction. Frontend adds locale-aware auth screens and the platform tenant list to the existing Next.js shell.

**Tech Stack:** Node 22 + Express + Prisma (PostgreSQL) + Zod + Vitest (supertest against real PG); Next.js 16 App Router; `node:crypto` scrypt for passwords (no new deps); in-memory rate limiter (single instance, documented limitation).

**Spec:** `docs/13_IMPLEMENTATION_PLAN.md` (Sprint 1), `docs/05_AUTH_AND_PERMISSIONS.md`, `docs/06_DATA_MODEL.md` (identity tables), `docs/07_API_CONTRACT.md`, `docs/12_TEST_PLAN.md` (E01, I01-analog, I04-analog, I05, I06, I15).

## Global Constraints

- Tenant is server-resolved from trusted Host only; never trust client `tenantId`/slug headers (`docs/05` rule 2). Deny by default everywhere.
- 404 (not 403) for nonexistent OR inaccessible tenant-scoped objects; stable `error.code` envelope from `docs/07` registry: `UNAUTHENTICATED, FORBIDDEN, RESOURCE_NOT_FOUND, VALIDATION_FAILED, TENANT_INACTIVE, TENANT_SLUG_TAKEN, TOKEN_EXPIRED, TOKEN_ALREADY_USED, RATE_LIMITED`.
- Cookies: opaque secret, `HttpOnly`, `Secure`, `SameSite=Lax`, host-only (no Domain attr), separate cookie names per realm. CSRF token rotated on login; all mutating cookie-authenticated routes require matching `X-CSRF-Token`.
- Tokens (email verification, password reset, invitations): 32-byte random, stored sha256-hashed only, single-use (`consumedAt`), expiry enforced server-side. Timing-safe comparisons.
- Passwords: scrypt (N=16384, r=8, p=1) with per-user salt; never logged; login failures generic.
- All emails go through outbox events committed with the state change; payload contains only recipient email + action link (no sensitive data — I18 discipline). Worker stub logs them; tests read outbox rows.
- Every schema/status/audit write in one Prisma transaction; no external calls inside transactions.
- Synthetic seed only (no real PHI). Staff fixture emails like `owner.a@example-invalid`.
- TS strict; Zod strictObject DTOs in `backend/src/contracts`; frontend consumes API JSON, never imports backend source.
- Wrong-tenant tests required for every new tenant-scoped route (Sprint 1 exit bullet).

## Scope decisions (assumptions recorded; ADR if owner disagrees)

1. **E01 split:** Sprint 1 delivers E01 steps 1–4 (register form → email verify → pending → operator activates). "Configure brand/services → portal visible" requires Sprint 2 catalog and completes there. E2E asserted via API integration test now; Playwright journey when portal screens exist.
2. **New endpoint `POST /v1/auth/reset-password`** added to doc 07 (forgot-password is useless without consumption). Doc updated in Task 10.
3. **Single `audit_events` table** with nullable `tenantId` (covers doc 07 `/platform/audit` operator rows and doc 06 tenant AUDIT_EVENT). Doc 06 note updated in Task 10.
4. **Dev hosts:** staff/customer realm = `{slug}.localhost`, platform realm = `platform.localhost` (browser-resolvable, host-only cookies work); `BASE_DOMAIN` + `PLATFORM_HOST` env drive the trusted-host allowlist. Production subdomain strategy unchanged.
5. **Agency settings/branding/notification-policies routes deferred** to Sprint 2 (Sprint 1 bullet list does not include them).
6. **Customer accounts:** realm model + login/me/logout supported now (needed for I05 duplicate-email test); customer registration screen is Sprint 2+ (guest intake). Sprint 1 creates customer accounts only via seed/tests.
7. **In-memory rate limiting** (register/login/forgot/invite-accept): acceptable single-instance MVP; swap to Redis when worker fan-out demands (noted as risk).
8. **Production API ingress:** owner approved tenant/platform same-origin `/v1`
   routing with validated host preservation (ADR-0008), replacing the earlier
   illustrative central browser API hostname.

## Review Focus

1. **Cross-tenant session/host mix:** staff A session cookie replayed against tenant B host (or platform host) must be rejected as UNAUTHENTICATED/FORBIDDEN, never authenticated. → Task 5 tests.
2. **Suspended tenant mid-session (I15):** next authenticated call denied even with a previously valid session/CSRF. → Task 8 tests.
3. **Token replay/expiry (I04-analog, I06):** consumed/expired verification, reset and invitation tokens refused exactly once semantics (second use → TOKEN_ALREADY_USED/EXPIRED); invitation token bound to its tenant. → Tasks 6, 7 tests.
4. **Duplicate email across tenants (I05):** same email at A and B = independent accounts; login resolves tenant by host first; no enumeration or cross-sign-in. → Task 6 tests.
5. **Host-header spoofing/unknown host:** untrusted Host (not under BASE_DOMAIN/PLATFORM_HOST) → request rejected before tenant lookup; platform routes unreachable with staff/customer cookies. → Task 5 tests.
6. **CSRF absent/mismatched token on every mutating route** → 403 FORBIDDEN. → Task 5 tests (matrix).

---

### Task 1: Identity Prisma schema + migration + seed

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<ts>_sprint1_identity/migration.sql` (via `prisma migrate dev`)
- Modify: `backend/prisma/seed.ts`

**Interfaces (Produces — used by all later tasks):**
- Models: `PlatformOperator{id,emailNormalized@unique,passwordHash,status,sessionVersion}`, `StaffAccount{id,tenantId,emailNormalized,passwordHash,role(OWNER|AGENCY_ADMIN|CARE_COORDINATOR|CAREGIVER),status(PENDING_VERIFICATION|ACTIVE|SUSPENDED),emailVerifiedAt?,sessionVersion,@@unique([tenantId,emailNormalized])}`, `CustomerAccount{id,tenantId,emailNormalized,passwordHash,status,emailVerifiedAt?,sessionVersion,@@unique([tenantId,emailNormalized])}`, `StaffInvitation{id,tenantId,emailNormalized,role,tokenHash@unique,expiresAt,consumedAt?,createdByStaffId,caregiverProfileJson?,@@index([tenantId,emailNormalized])}`, `AuthSession{id,principalType,principalId,tenantId?,secretHash@unique,csrfTokenHash,expiresAt,revokedAt?,sessionVersion,@@index([principalId])}`, `EmailToken{id,tenantId?,purpose(OWNER_VERIFICATION|PASSWORD_RESET),principalType,principalId,tokenHash@unique,expiresAt,consumedAt?}`, `AuditEvent{id,tenantId?,actorType,actorId?,action,subjectType,subjectId?,reason?,metadataJson,at,@@index([tenantId,at])}`.
- Seed additions: platform operator `operator@example-invalid`/`PlatformOp!01`; tenant A (`agency-a`) owner + coordinator + customer; tenant B (`agency-b`) owner + customer where B owner email == A coordinator email (I05 fixture); one consumed + one expired invitation sample. Passwords via the Task 2 hashing util.

- [ ] **Step 1: Add models to schema.prisma** per doc 06 identity tables with `@map` snake_case, `@db.Uuid`, enums mapped (`staff_role`, `staff_status`, `principal_type`, `email_token_purpose`).
- [ ] **Step 2: Generate + migrate:** `npm run generate`; `npm run migrate:dev -- --name sprint1_identity` (dev DB from compose, port 5433). Expected: migration applied, client regenerated.
- [ ] **Step 3: Extend seed** with the fixtures above (idempotent: skip when counts > 0). Run `npm run seed` twice → stable counts, exit 0.
- [ ] **Step 4: Run `npm run typecheck && npm run lint && npm test`** — all pass (existing 44 backend tests unaffected).
- [ ] **Step 5: Commit** `feat(db): sprint 1 identity models, migration and synthetic seed`

### Task 2: Crypto utilities (password + token)

**Files:**
- Create: `backend/src/modules/auth/crypto.ts`
- Test: `backend/test/auth/crypto.test.ts` (unit, no DB)

**Interfaces (Produces):**
- `hashPassword(password: string): Promise<PasswordHash>` / `verifyPassword(password: string, stored: PasswordHash): Promise<boolean>` — scrypt N=16384,r=8,p=1, 16-byte salt, format `scrypt$<n>$<r>$<p>$<saltB64>$<hashB64>`; `PasswordHash = string`.
- `generateToken(): { token: string; tokenHash: string }` — 32 random bytes base64url; `tokenHash = sha256hex(token)`.
- `hashToken(token: string): string`; `safeEqual(a: string, b: string): boolean` (timing-safe).

- [ ] **Step 1: Write failing unit tests:** verify round-trip; wrong password false; hash format rejects tampered params; `generateToken` uniqueness/length; `safeEqual` true/false.
- [ ] **Step 2: Run** `npm test -- auth/crypto` → FAIL (module missing).
- [ ] **Step 3: Implement** with `node:crypto` only.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** `feat(auth): scrypt password and hashed-token utilities`

### Task 3: Session service + CSRF + cookies

**Files:**
- Create: `backend/src/modules/auth/session.service.ts`, `backend/src/modules/auth/cookies.ts`
- Test: `backend/test/auth/session.service.test.ts` (integration, real PG via existing vitest harness)

**Interfaces (Produces):**
- `createSession(tx, { principalType, principalId, tenantId?, sessionVersion, ttlSeconds }): Promise<{ sessionToken: string; csrfToken: string; expiresAt: Date }>` — inserts `AuthSession` with `secretHash=sha256(sessionToken)`, `csrfTokenHash=sha256(csrfToken)`.
- `resolveSession(db, sessionToken): Promise<ResolvedSession | null>` — joins principal account + tenant; null when missing/revoked/expired/`account.sessionVersion !== session.sessionVersion`/tenant not ACTIVE (platform exempt; owner allowed when tenant PENDING_APPROVAL).
- `revokeSession(db, sessionId)`, `revokeAllSessionsForTenant(tx, tenantId)` (used by Task 8 suspend), `rotateCsrf(db, sessionId)`.
- Cookie helpers: `setSessionCookies(res, realm, { sessionToken, csrfToken, expiresAt })` and `clearSessionCookies(res, realm)`; realm ∈ `PLATFORM | AGENCY`; names `raak_session_platform` / `raak_session_agency`, `raak_csrf_platform` / `raak_csrf_agency`; session cookie HttpOnly+Secure+SameSite=Lax host-only; CSRF cookie readable (no HttpOnly), host-only.

- [ ] **Step 1: Write failing integration tests:** create→resolve round-trip; resolve null after revoke; null after expiry; null after `sessionVersion` bump; suspended tenant → null; pending tenant + OWNER role → resolves; customer/staff realms carry `tenantId`, platform does not.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (tenant/account status checks via joined reads inside resolve).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): opaque session service, csrf binding and realm cookies`

### Task 4: Contracts — auth/platform DTOs and permission registry

**Files:**
- Create: `backend/src/contracts/auth.ts`, `backend/src/contracts/platform.ts`
- Modify: `backend/src/contracts/index.ts`
- Test: `backend/test/contracts/auth.dto.test.ts`

**Interfaces (Produces):**
- Zod strict schemas: `RegisterAgencyDto{ slug, legalName, displayName, timezone, currency(3 uppercase), supportEmail, ownerEmail, ownerPassword(min 10, max 128) }`, `LoginDto{ email, password }`, `VerifyEmailDto{ token }`, `ForgotPasswordDto{ email }`, `ResetPasswordDto{ token, newPassword }`, `CreateInvitationDto{ email, role(AGENCY_ADMIN|CARE_COORDINATOR|CAREGIVER), caregiverProfile?{ name, professionalCategory } }`, `AcceptInvitationDto{ token, password }`, `PlatformTenantActionDto{ reason(min 3 for suspend) }`; response schemas `AuthMeDto`, `PlatformTenantSummaryDto{ tenantId, slug, displayName, status, counts }, PlatformTenantDetailDto`, `PlatformAuditEntryDto`; pagination via existing `contracts/pagination.ts`.
- `STAFF_ROLES`, `RESERVED_SLUGS = ['www','api','app','admin','platform','staging','portal']`, `SLUG_PATTERN`.

- [ ] **Step 1: Write failing tests:** valid fixtures parse; unknown/extra fields rejected; role enum rejects OWNER invitations (owner exists only via registration); slug rejects reserved/uppercase/leading-hyphen; suspend reason required min 3.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(contracts): sprint 1 auth and platform DTOs`

### Task 5: HTTP guards — tenant host resolver, session guard, CSRF, permissions, rate limit

**Files:**
- Create: `backend/src/modules/auth/host-resolver.ts`, `backend/src/modules/auth/guards.ts`, `backend/src/modules/auth/permissions.ts`, `backend/src/modules/auth/rate-limit.ts`
- Modify: `backend/src/server.ts` (wire guards into pipeline before routes; keep health unguarded)
- Test: `backend/test/auth/guards.integration.test.ts` (supertest + PG)

**Interfaces (Produces):**
- `resolveHostRealm(req): HostRealm` where `HostRealm = { kind: 'PLATFORM' } | { kind: 'AGENCY'; tenant: ResolvedTenantContext } | { kind: 'REJECTED' }` — parse Host against `BASE_DOMAIN`/`PLATFORM_HOST` allowlist; slug→tenant lookup (unknown slug = REJECTED, non-enumerating 404).
- `requireSession(req, res, next)` → attaches `AuthenticatedRequest` = `{ session: ServerSessionContext; realm: HostRealm; account: StaffAccount|CustomerAccount|PlatformOperator }`; rejects when session tenant ≠ resolved host tenant (AGENCY realm) or principalType mismatch on PLATFORM realm → `UNAUTHENTICATED`.
- `requirePermission(action: PermissionAction)` using `authorize(principal, action, resource?): AuthzDecision` — deny-by-default map: PLATFORM_OPERATOR → `platform.tenants.read|activate|suspend`, `platform.audit.read`; AGENCY OWNER/ADMIN (+tenant ACTIVE) → `staff.invitations.create`; everything else denied in Sprint 1.
- `requireCsrf` on mutating methods: `X-CSRF-Token` header timing-safe-matches session `csrfTokenHash`.
- `rateLimit(key, limit, windowMs)` middleware factory (in-memory Map).

- [ ] **Step 1: Write failing integration tests:** unknown Host rejected 404; `{slug}.localhost` resolves seeded tenant; spoofed `X-Tenant-ID` ignored; staff A cookie on B host → UNAUTHENTICATED; staff cookie on platform host → UNAUTHENTICATED; operator cookie on agency host → UNAUTHENTICATED; mutation without/with-wrong CSRF → 403; caregiver role calling invitation create → 403; anonymous `platform/tenants` → 401.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): host realm resolver, session/csrf guards and permission gate`

### Task 6: Auth routes — register, verify-email, login, logout, me, forgot/reset

**Files:**
- Create: `backend/src/modules/auth/auth.controller.ts`, `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/agency/agency.controller.ts`, `backend/src/modules/agency/agency.service.ts`
- Test: `backend/test/auth/auth.routes.integration.test.ts`

**Interfaces (Produces):**
- `POST /v1/agencies/register` (public, rate-limited 5/h/IP): transaction — slug check (`TENANT_SLUG_TAKEN`), create Tenant PENDING_APPROVAL + StaffAccount OWNER PENDING_VERIFICATION + EmailToken OWNER_VERIFICATION (24h) + OutboxEvent `email.owner_verification` (link contains raw token) + AuditEvent `tenant.registered`. 201 `{ tenantId, slug, status }`.
- `POST /v1/auth/verify-email`: consume EmailToken (expired → `TOKEN_EXPIRED`, reused → `TOKEN_ALREADY_USED`), set `emailVerifiedAt`, account ACTIVE, audit. 200.
- `POST /v1/auth/login` (rate-limited 10/15m/IP+email): host-realm resolved first; staff realm loads by `(tenantId,emailNormalized)`; customer realm analogous; platform host → PlatformOperator. Generic `UNAUTHENTICATED` on any failure (no enumeration). Checks: password, account ACTIVE+verified, tenant ACTIVE (owner + PENDING tenant allowed). Creates session + CSRF, rotates cookies, audits `auth.login`.
- `POST /v1/auth/logout`: revoke + clear cookies (audited).
- `GET /v1/auth/me`: `AuthMeDto` (principalType, role, tenant slug/status, email).
- `POST /v1/auth/forgot-password` (rate-limited): always 202 generic; when account exists create PasswordReset EmailToken (30m) + outbox `email.password_reset`.
- `POST /v1/auth/reset-password`: consume token, set password, bump `sessionVersion` (revokes other sessions), audit.

- [ ] **Step 1: Write failing integration tests:** happy register→verify→login→me→logout; duplicate slug 409 `TENANT_SLUG_TAKEN`; reserved slug 422; login before verify → UNAUTHENTICATED; login wrong host/slug (B host + A credentials) → UNAUTHENTICATED; **I05** same email seeded in A and B: each login only on its own host, sessions carry distinct tenantIds, no session works cross-host; expired token → `TOKEN_EXPIRED`; consumed token reuse → `TOKEN_ALREADY_USED`; reset-password invalidates prior sessions; outbox rows exist with link-only payload (assert no password/name leakage).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** controllers thin, services transactional (idiomatic to health module structure). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): agency registration, email verification and realm login routes`

### Task 7: Staff invitations

**Files:**
- Create: `backend/src/modules/staff/staff.controller.ts`, `backend/src/modules/staff/staff.service.ts`
- Test: `backend/test/staff/invitations.integration.test.ts`

**Interfaces (Produces):**
- `POST /v1/staff/invitations` (OWNER/ADMIN, tenant ACTIVE, CSRF): transaction — create StaffInvitation (role ∈ ADMIN/COORDINATOR/CAREGIVER, optional `caregiverProfileJson` snapshot for later caregiver row), token 48h hashed, outbox `email.staff_invitation`, audit `staff.invited`. 201 `{ invitationId, expiresAt }`.
- `POST /v1/staff/invitations/accept` (public, rate-limited): consume token single-use; expired → `TOKEN_EXPIRED`, reused → `TOKEN_ALREADY_USED`; create StaffAccount ACTIVE bound to invitation tenantId+role (caregiver profile persisted to `caregivers` table minimal row with `staffAccountId` link, `operationalStatus=INACTIVE` until Sprint 4 qualification flow); audit `staff.invitation_accepted`. Caregiver account login allowed (used by later sprints).

- [ ] **Step 1: Write failing integration tests:** owner creates invite; admin creates; coordinator forbidden; caregiver forbidden; suspended tenant forbidden; **I06** expired invitation accept → refused; consumed reuse → `TOKEN_ALREADY_USED`; invitation from tenant A accepted while Host = tenant A only (token carries its own tenant; accept is host-agnostic public route but binds account to invitation tenant — assert account cannot log in on tenant B host with same credentials, wrong-tenant matrix); CSRF required; outbox row present.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(staff): invitation issue and accept with tenant-bound accounts`

### Task 8: Platform control plane — tenants list/detail, activate, suspend, audit

**Files:**
- Create: `backend/src/modules/platform/platform.controller.ts`, `backend/src/modules/platform/platform.service.ts`
- Test: `backend/test/platform/tenants.integration.test.ts`

**Interfaces (Produces):**
- `GET /v1/platform/tenants` (operator; paginated `?limit&cursor&status`): summary + aggregate counts (owners/staff/customers per tenant).
- `GET /v1/platform/tenants/:tenantId`: metadata, owner email, status, counts; unknown id → 404 `RESOURCE_NOT_FOUND`.
- `POST /v1/platform/tenants/:tenantId/activate` (Idempotency-Key not required; reason audited): PENDING_APPROVAL|SUSPENDED → ACTIVE + audit `tenant.activated` + outbox `email.tenant_activated`.
- `POST /v1/platform/tenants/:tenantId/suspend`: ACTIVE → SUSPENDED, `reason` required, transaction revokes all tenant sessions (`revokeAllSessionsForTenant`) + audit `tenant.suspended`. Invalid transitions → 409 `STATE_TRANSITION_INVALID`.
- `GET /v1/platform/audit`: operator-scope audit entries, paginated, minimal metadata.

- [ ] **Step 1: Write failing integration tests:** operator happy activate/suspend; staff token → 403; anonymous → 401; unknown tenant 404; double-suspend 409; **I15** staff of tenant logged in → operator suspends tenant → same cookie+CSRF next `/auth/me` (or invitation create) → denied; login after suspend → `UNAUTHENTICATED`; audit rows written with actor/reason; suspend then activate restores login; suspended-tenant login attempt does not reveal account existence differences.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(platform): operator tenant lifecycle, session revocation and audit`

### Task 9: Frontend — auth screens and Super Admin tenant list

**Files:**
- Create: `frontend/src/app/[locale]/register/page.tsx`, `frontend/src/app/[locale]/verify-email/page.tsx`, `frontend/src/app/[locale]/login/page.tsx`, `frontend/src/app/[locale]/platform/tenants/page.tsx`, `frontend/src/lib/api-client.ts`, shared form components under `frontend/src/components/`
- Modify: `frontend/messages/ar/*.json`, `frontend/messages/en/*.json` (feature namespaces `auth`, `platform`), nav links in shell
- Test: `frontend/src/app/__tests__/` (form validation unit, dictionary parity auto-extends)

**Interfaces:**
- Consumes: API routes from Tasks 6–8 via `apiClient(path, { method, body, csrfFromCookie })` — same-origin proxy or absolute API URL from env; cookies forwarded.
- Produces: locale-prefixed pages; forms post real DTO field names matching `contracts/auth.ts`; AR default RTL, EN LTR; loading/error/success/empty states; no success implication before server confirms.

- [ ] **Step 1: Add dictionary keys (ar/en) and extend parity test; write failing form validation unit tests** (slug pattern, email, password length, required reason for suspend action).
- [ ] **Step 2: Run** `npm test` in `frontend/` → FAIL. **Step 3: Implement pages** using locked tokens/IBM Plex fonts, marked placeholders where Sprint 2 continues; tenant list table with status chips (label+tint, not hue-only) and activate/suspend actions with confirm + reason modal; register success shows "pending approval" copy.
- [ ] **Step 4: Run** `npm run lint && npm run typecheck && npm test && npm run build` in `frontend/` → PASS.
- [ ] **Step 5: Manual smoke** (dev servers, `platform.localhost`/`agency-a.localhost` hosts): register→verify (token from outbox/worker log)→login→platform activate. Record screenshots like sprint-00.
- [ ] **Step 6: Commit** `feat(web): registration, login, verification and platform tenant list screens`

### Task 10: E2E proof, docs update, verification report

**Files:**
- Create: `backend/test/e2e/e01-registration.flow.integration.test.ts` (API-level E01 steps 1–4: register→verify→pending→activate→login→me shows ACTIVE)
- Modify: `docs/07_API_CONTRACT.md` (mark Sprint 1 routes implemented; add `/auth/reset-password`), `docs/06_DATA_MODEL.md` (audit_events note), this plan's status sibling `docs/plans/sprint-01-status.md`
- Test: full suites both projects

- [ ] **Step 1: Write failing E01 flow test** → FAIL → implement wiring (should pass with Tasks 6–8; any gap found = fix) → PASS.
- [ ] **Step 2: Run full verification:** backend `npm run lint && npm run typecheck && npm test && npm run build && npm run migrate` (temp DB, drop after) + `prisma validate`; frontend lint/typecheck/test/build. Record exact commands/results in status doc. If Playwright browsers needed (>50MB) → provide owner-run command, rely on API E2E + manual smoke.
- [ ] **Step 3: Update docs + write `sprint-01-status.md`** (implemented/not/risks/next = Sprint 2 catalog & guest intake).
- [ ] **Step 4: Commit** `docs(sprint1): contract updates and verification status`

## Definition of done (Sprint 1 exit)

- I05, I06, I15 + CSRF/cross-host/wrong-tenant matrices green in backend integration tests; E01 (steps 1–4) green at API level; Super Admin tenant list functional in AR/EN.
- All lint/typecheck/test/build/migrate commands pass with recorded evidence; no fabricated results.

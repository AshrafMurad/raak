# Sprint 1 closure slice — working checklist

Owner-approved closure scope (see ADR-0009). One slice: reconcile acceptance
mapping, close I05/I06 gaps, enforce service-boundary authorization, verify
against live dependencies. No Sprint 2 features.

## Affected files

| Area | File | Change |
|---|---|---|
| Backend I06 | `backend/src/modules/staff/staff.service.ts` | `acceptInvitation(input, realm)`: reject unless server-resolved host realm is the invitation's tenant; no token consumption, no account on mismatch |
| Backend I06 | `backend/src/modules/staff/staff.controller.ts` | pass `res.locals.realm` into the service |
| Backend authz | `backend/src/modules/auth/permissions.ts` | `principalFromAuth(auth)` helper (single authorize gate, two enforcement points) |
| Backend authz | `backend/src/modules/auth/guards.ts` | `requirePermission` uses the helper |
| Backend authz | `backend/src/modules/staff/staff.service.ts` | `createInvitation` re-runs central `authorize()` at service boundary |
| Backend authz | `backend/src/modules/platform/platform.service.ts` | all privileged methods take `AuthState` and re-run `authorize()` at service boundary |
| Tests I05 | `backend/test/auth/auth.routes.integration.test.ts` | customer same-email-in-two-tenants suite (independent logins/sessions, server-resolved tenant binding, cross-tenant/platform session denial); staff suite kept |
| Tests I06 | `backend/test/staff/invitations.integration.test.ts` | acceptance moved to invitation tenant host; wrong-tenant/platform-host denial without consumption + retry on correct host; same-token concurrent race |
| Tests authz | `backend/test/staff/invitations.integration.test.ts`, `backend/test/platform/tenants.integration.test.ts` | service-interface denial cases (coordinator/suspended invitation create; staff-principal tenant activate/suspend/list/audit) |
| Docs | `docs/13_IMPLEMENTATION_PLAN.md` | Sprint 1 exit wording: E01 steps 1–4 now / full E01 in Sprint 2; I01 remains open in owning sprints; Sprint 1 = host/session isolation |
| Docs | `docs/12_TEST_PLAN.md` | milestone-mapping note (no weakening of E01/I01/I05/I06 rows) |
| Docs | `docs/07_API_CONTRACT.md`, `docs/05_AUTH_AND_PERMISSIONS.md` | invitation acceptance is tenant-host bound; service-boundary re-authorization note |
| Docs | `docs/adr/ADR-0009-sprint1-acceptance-milestones.md` | record owner approval + reason |
| Docs | `docs/plans/sprint-01-control-plane-auth.md` | scope decision 1 updated with approval reference |
| Docs | `docs/plans/sprint-01-status.md` | fresh verification results, remaining gates, Sprint 2 handoff |

## Invariants

1. Invitation acceptance only on the invitation's tenant host (server-resolved);
   wrong-tenant/platform-host rejection consumes nothing, creates nothing, and
   does not enumerate (generic `UNAUTHENTICATED`).
2. Existing protections preserved: expiry, single-use (atomic claim), suspension
   lock, concurrency conflict mapping, CSRF, rate limit.
3. I05: same email in two tenants = independent accounts/sessions; login binds
   to the host-resolved tenant; no cross-host session reuse; staff coverage kept.
4. Authorization: one central `authorize()` registry; enforced at HTTP gate AND
   re-checked at the service boundary (docs 05 rule 5); no scattered role checks.
5. Frontend invitation links already target `{slug}.<base>/ar/accept-invitation#token=`
   and the form posts same-origin — no frontend change required.
6. Preserve uncommitted owner work (design preview files); no commits/push/deploy.

## Verification commands

- `docker ps` / port 5433 reachability (Docker Desktop up) — precondition
- backend/: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm exec -- prisma validate`, `npm run build`,
  `npm run migrate` + `prisma migrate status` on a temporary database
  (created/dropped via `docker exec`; dev DB untouched)
- frontend/: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

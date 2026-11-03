# Sprint 5 — Care plans and matching status

> Historical Sprint 5 implementation ledger. The current architecture and
> verification supersede the file paths, proposed-ADR status and counts below:
> see `sprint-05-architecture-stabilization-status.md` and
> `../reviews/2026-11-03-sprint-05-architecture-stabilization-review.md`.

Date: 2026-11-02. Status: **Care-plan versioning, recurrence/DST generation,
candidate matching, transactional assignment and impact scanning implemented
and locally demonstrated in Arabic and English.** Private S3 and live email
remain owner-deferred open gates inherited from Sprint 4; nothing in Sprint 5
depends on them. This is not an MVP-complete claim. No commits/pushes were
made.

ADR-0012 interpretations (clinical-approval capability, DST contract,
amendment replacement, pause/cancel dispositions, deterministic ranking,
assignment serialization, version lifecycle) are implemented as proposed and
remain marked for owner review; fail-closed behavior shipped.

## Delivered workflows and key files

- Versioned care plans: draft create/edit with `expectedDraftVersion`,
  exact-version clinical approval (capability gate + service-matching VERIFIED
  qualification on the approver's own caregiver profile), read-only generation
  preview, idempotent activation, revise, pause/resume/complete/cancel with
  explicit future-PLANNED disposition:
  `backend/src/modules/care-plans/{care-plan.service,care-plan.controller}.ts`,
  `backend/src/contracts/careplans.ts`.
- Recurrence engine: inclusive local dates, 60-calendar-day cap, IANA
  local→UTC conversion with DST gap always rejected and fold resolved by the
  stored `dstResolution` (REJECT/EARLIEST/LATEST), stable occurrence keys:
  `backend/src/modules/common/local-time.ts`,
  `backend/src/modules/care-plans/recurrence.ts`. No new timezone dependency
  (`Intl` only).
- Scheduling: advisory ranked candidates (primary → lighter load → same area →
  stable ID) with safe exclusion codes; transactional assign/reassign/bulk
  with exact travel-buffer adjacency math, full commit-time rechecks
  (account, qualification incl. independent verifier+timestamp, service
  authorization, area, availability/leave), optimistic visit versions,
  Idempotency-Key replay and explicit bulk partial outcomes;
  `NEEDS_REASSIGNMENT` impact scans run inside Sprint 4 availability/profile/
  qualification writers: `backend/src/modules/scheduling/{filters,candidate.
  service,assignment.service,impact.service}.ts`.
- Assignment history is append-only; approved/activated versions, completed/
  cancelled visits and snapshots are never rewritten. Confirmed SCHEDULED
  visits are never silently cancelled by activation, amendments or pause.
- New permissions `careplans.read/manage`, `careplans.clinical_approve`,
  `visits.read`, `scheduling.manage` in the single central registry
  (`backend/src/modules/auth/permissions.ts`); every service rechecks live
  session/account/tenant inside the workflow transaction; wrong-tenant IDs
  return 404; platform/customer/caregiver principals denied on agency routes.
- Frontend `frontend/features/scheduling/` + `messages/{ar,en}/scheduling.json`:
  `/[locale]/workspace/care-plans` (list/create/editor/version history/
  approval/preview/activation/lifecycle dialogs with explicit disposition)
  and `/[locale]/workspace/visits` (filters, reassignment queue, detail with
  candidates + per-row exclusion reasons, individual and bulk assignment with
  partial results). Shared UI reused (CatalogFrame, WorkspaceNav, Button,
  Field/Input/Textarea, Select, Feedback, Dialog, StatusBadge); no new shared
  primitive was needed. Idempotency-Key used for activation/assign/bulk.
- Synthetic seed: `backend/prisma/seed-scheduling.ts` — recurring service,
  full-week availability, one activated synthetic plan and three PLANNED
  visits (one intentionally overlapping the seeded synthetic leave date).

## Acceptance evidence

| Requirement | Actual evidence |
| --- | --- |
| U01–U03 recurrence/DST | `recurrence.test.ts` (10 tests) + API draft-time rejection of 61-day span and DST gap/fold with `RECURRENCE_TIME_INVALID` in `careplans.integration.test.ts` |
| U14/I09 idempotent activation | Same-key activation replay returns stored result; parallel activations yield one occurrence set (12-test care-plan suite) |
| I08 assignment races | Two overlapping parallel assignments for one caregiver: one 200/one 409 `SCHEDULE_CONFLICT`, exactly one SCHEDULED row (`assignment.integration.test.ts`, 8 tests) |
| U04/U05 buffers | 09:00–10:00 local existing visit: 10:29 start denied, exact 10:30 boundary accepted |
| U07/U08 ranking/exclusions | Primary first despite heavier load; equal load prefers same area before other area, then stable ID; unqualified caregiver excluded with `QUALIFICATION_INVALID` |
| U09/F10/I20 leave impact | Approved leave excludes candidates and flags existing SCHEDULED visits `NEEDS_REASSIGNMENT` without cancelling; leave/assignment race either rejects or flags; qualification withdrawal flags future appointments |
| I01 plan/visit isolation | Cross-tenant plan/visit IDs 404; caregiver/customer/platform browse denied (care-plan integration suite) |
| E05 bilingual UI | `test:browser:sprint5`: owner plan create → qualified-reviewer exact-version approval → preview → activation → PLANNED visits → candidate-driven assignment → leave → reassignment queue → reassignment to second caregiver → pause KEEP/resume; plus 16 AR/EN × light/dark × 390/1440px route/layout/keyboard checks |
| Prior sprints regression | Sprint 2 E01/E02 + 56 route checks, Sprint 3 E03/I10/I11, Sprint 4 E04/F05/F06 + caregiver/file matrix all re-passed after Sprint 5 changes |

Tests: `backend/test/careplans/{recurrence,careplans.integration}.test.ts`,
`backend/test/scheduling/assignment.integration.test.ts`,
`backend/test/browser/sprint5.e2e.ts`; frontend translation parity
(`test/i18n.test.ts` covers the scheduling namespace).

## Verification ledger

All directories relative to `E:\projects\MERN stack\raak`.

| Directory | Command | Observed result |
| --- | --- | --- |
| `backend/` | `npm run lint` | passed (after removing two unused locals) |
| `backend/` | `npm run typecheck` | passed |
| `backend/` | `npm test` | 29 files / 230 passed |
| `backend/` | `npm run build` | API/worker emitted |
| `backend/` | `npm exec -- prisma validate` | valid schema |
| `backend/` | `npm exec -- prisma migrate status` | 11 migrations, up to date |
| `backend/` | `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | no difference |
| `backend/` | `npm run seed` | passed; idempotent (create-only) |
| `backend/` | `npm run test:browser:sprint5` | E05 AR/EN passed |
| `backend/` | `npm run test:browser:sprint4` | E04/F05/F06 AR/EN + matrix passed |
| `backend/` | `npm run test:browser:sprint3` | E03 AR/EN + eight checks passed |
| `backend/` | `npm run test:browser` | E01/E02 + prior route checks passed |
| `frontend/` | `npm run lint` / `npm run typecheck` | passed |
| `frontend/` | `npm test` | 8 files / 40 passed |
| `frontend/` | `npm run build` | passed (44 routes incl. care-plans/visits) |
| `frontend/` | `npm run build:browser` | passed; same-origin browser configuration |
| Root | `git diff --check` | passed |

Note: `next start` serves whatever `.next` last produced — a plain
`npm run build` after `build:browser` restores the env-configured API base
URL and breaks the same-origin browser harnesses (observed, diagnosed, fixed
by re-running `build:browser`; no production code involved). Browser suites
must always run after `build:browser`.

### Migrations and fixtures

One additive Sprint 5 migration (`20261103090000_sprint5_care_plans_visits`);
eleven total; no applied history edited. Fresh disposable DB
`raak_sprint5_verify_20261103`: `npm run migrate` → `npm run seed` → both
again; migration status current, schema diff empty, seed counts identical on
both runs (2 tenants / 1 operator / 4 staff / 2 customers / 2 invitations /
4 patients / 3 grants / 1 caregiver / 1 plan / 3 visits); row check
1 plan / 1 version / 3 visits all PLANNED+unassigned / 8 availability slots /
2 services. Disposable DB dropped; absence confirmed by count 0. DATABASE_URL
was process-local; the development DB was not reset.

Exact replay commands (working directory `backend/`):

```powershell
docker exec raak-postgres-1 createdb -U raak raak_sprint5_verify_20261103
$env:DATABASE_URL='postgresql://raak:raak-dev-only@localhost:5433/raak_sprint5_verify_20261103'; npm run migrate; if ($?) { npm run seed }; if ($?) { npm run migrate }; if ($?) { npm run seed }; if ($?) { npm exec -- prisma migrate status }; if ($?) { npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code }
docker exec raak-postgres-1 psql -U raak -d raak_sprint5_verify_20261103 -c "SELECT (SELECT count(*) FROM care_plans) AS plans, (SELECT count(*) FROM care_plan_versions) AS versions, (SELECT count(*) FROM visits) AS visits, (SELECT count(*) FROM visits WHERE status='PLANNED' AND assigned_caregiver_id IS NULL) AS planned_unassigned, (SELECT count(*) FROM availability_slots) AS slots, (SELECT count(*) FROM agency_services) AS services;"
docker exec raak-postgres-1 dropdb -U raak raak_sprint5_verify_20261103
docker exec raak-postgres-1 psql -U raak -d postgres -tAc "SELECT count(*) FROM pg_database WHERE datname='raak_sprint5_verify_20261103'"
```

## Shared UI

Reused the approved shared primitives; `StatusBadge` needed no new variant
(existing tones cover plan/visit/health states). `scheduling.css` adds only
layout resilience for the new screens. Locked palette, fonts, treatments and
the design-preview board remain the source of truth; no logo was created.

## Open gates and Sprint 6 handoff

1. **Owner review of ADR-0012** interpretations remains pending; the shipped
   behavior is the fail-closed reading recorded there.
2. Private storage and live email gates remain owner-deferred (Sprint 4
   status); no Sprint 5 workflow depends on them.
3. Sprint 6 owns visit execution (check-in/out, task outcomes, append-only
   notes, review/corrections), customer visit change requests, I12 visit
   change semantics and caregiver-facing `my/visits` projections. Visit rows,
   task snapshots and assignment history are already in place for it.
4. Travel-buffer settings UI (agency settings PATCH) remains with its owning
   sprint; scheduling reads the tenant value transactionally.
5. General notification delivery (worker email for `visit.assigned` /
   `visit.reassignment_flagged`) remains Sprint 7; events are already written
   to the outbox atomically.

No visit execution, change requests, payments, subscriptions, reports or
deployment were added. No commits or pushes were made. No agent-initiated
package/image/browser download was performed.

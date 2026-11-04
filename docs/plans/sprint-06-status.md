# Sprint 6 — Visits and customer changes status

Date: 2026-11-04. **Sprint 6 application scope implemented and locally
demonstrated; required checks passed.** Deferred infrastructure/launch gates below
remain open. This is not an MVP-complete or production-readiness claim.

Baseline: clean `main` at Sprint 4 was inspected first. Sprint 5 scheduling and
its approved stabilization are on `refactor/sprint5-architecture-stabilization`
(baseline `2abfd36`); the clean checkout was switched to that existing branch.
All Sprint 6 changes remain uncommitted. No merge, push or deployment performed.

Plan: `sprint-06-visits-and-changes.md`. Interpretations: ADR-0013. Locked
D01–D23 are preserved.

## Implemented scope

- Assigned-caregiver mobile list/detail, server Start/End, validated task outcomes,
  draft notes, atomic immutable completion snapshots, separate coordinator review
  and append-only corrections.
- Explicit PatientAccess customer visit summaries and single-occurrence cancel/
  reschedule requests; policy cutoffs and server NORMAL/LATE classification;
  coordinator approve/decline/withdrawal, original-booking preservation and
  commit-time state/grant/timezone/eligibility/availability/overlap/buffer checks.
- Scheduling-policy settings, prospective buffer impact scan, transactional safe
  audit/outbox and contract-required idempotency. Arabic/English screens added.

## Earlier verification ledger

| Directory | Exact command | Observed result |
| --- | --- | --- |
| `backend/` | `npm test -- test/visits/visit-execution.integration.test.ts test/scheduling/change-requests.integration.test.ts` | 33 tests passed after hardening, including snapshot UPDATE guards and real concurrent note/completion and start/approval cases |
| `backend/` | `npm run test:browser:sprint6` | E06 and E07 passed in AR/EN using installed Chrome: 390px execution/customer journeys; conflict rollback/retry; separate review/correction; rejected change preservation; 360/390/1440px checks |
| `backend/` | `npm run migrate` | 13 migrations applied; both Sprint 6 migrations deployed locally |
| `backend/` | `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | No difference detected |
| `frontend/` | `npm test` | 17 files / 81 tests passed (before final review changes) |
| `frontend/` | `npm run typecheck` | Passed (before final review changes) |
| `frontend/` | `npm run build:browser` | Passed; 52 pages generated |

Initial browser runs exposed an incorrect expected correction status (test now
uses contractual 201) and a real combined-date-filter overwrite. The latter was
fixed with a shared half-open local-day window; no assertion was weakened. Earlier
backend test-fixture failures (clock/session expiry, absent Berlin reviewer,
incorrect synthetic cutoff/gap calculations) were corrected rather than bypassed.

## Shared UI

Reused Button, Field/Input/Textarea/CheckboxField, Select, Feedback, StatusBadge,
Dialog/its approved header and scrolling body treatments, PortalFrame and the
existing WorkspaceFrame/WorkspaceShell. No competing primitive or theme treatment
was added. Shared visit-flow CSS is layout-only. Palette/fonts, light default and
the design-preview's shared implementations remain authoritative.

## Final acceptance evidence

| Requirement | Demonstrated evidence |
| --- | --- |
| E06 / AC-07 | `test/browser/sprint6.e2e.ts`: AR/EN caregiver login → today's assigned visit → server Start → DONE and NOT_DONE+reason → saved draft → completion → immutable note/task snapshot → separate coordinator review/restricted note → append-only correction preserving original snapshot |
| E07 / AC-08 | Same real Chrome harness: authorized customer reschedule → PENDING preserves original → conflict introduced → approval 409 preserves request/window → retry after conflict removal succeeds → customer and caregiver read updated time; alternate declined cancellation preserves original |
| I12/I13/I14 | `test/scheduling/change-requests.integration.test.ts`: pending/declined/withdrawn preservation, unique pending race, current-grant recheck, different-caregiver patient conflict, availability/policy/timezone denial, cutoff equality/NORMAL vs one minute late, late-review disablement, idempotency and competing decisions |
| I17 | `test/visits/visit-execution.integration.test.ts`: ordinary note/task writes after completion denied, DB UPDATE guards deny original rewrites, separate review/correction leaves original data intact |
| Visit I01 / I07 | Cross-tenant visit detail/notes/correction/start/change IDs denied; both foreign change decisions denied; wrong caregiver/unassigned visit denied and lists restricted; VIEW_VISITS-only cannot change, revoked grants deny reads/actions/approval |
| Completion/change races | Parallel assigned-caregiver start vs cancellation approval has one winner; stale requests cannot change completed visits; concurrent draft-save/completion has no surviving draft or lost committed note; two approvals produce one mutation/audit |
| Time boundaries | Pure tests enumerate all 0–168 cutoff hours, common-clock-shift/monotonic properties; known Berlin 23/25-hour days and final local-day second; proposal DST-gap rejection and approval timezone recheck |
| UI / shared foundations | AR RTL + EN LTR; 390px E06/E07 workflows, 360/390/1440px reflow, 32 new-route light/dark/mobile/desktop checks, keyboard Dialog containment/Escape/focus return; approval consequence confirmation; URL-backed day/selection/queue state and reload retention; preview checked in both locales |

### Final exact checks (separate invocations)

All project directories below are relative to `E:\projects\MERN stack\raak`.

| Directory | Command | Result |
| --- | --- | --- |
| `backend/` | `npm run lint` | Passed |
| `backend/` | `npm run typecheck` | Passed |
| `backend/` | `npm test` | **36 files / 295 passed**, no skipped tests |
| `backend/` | `npm run build` | API and worker built |
| `backend/` | `npm run format:check` | Passed |
| `frontend/` | `npm run lint` | Passed |
| `frontend/` | `npm run typecheck` | Passed |
| `frontend/` | `npm test` | **17 files / 81 passed**, no skipped tests |
| `frontend/` | `npm run build` | Passed; 52 pages generated |
| `frontend/` | `npm run format:check` | Passed |
| `frontend/` | `npm run build:browser` | Passed before browser suites; relative same-origin API fixture |
| `backend/` | `npm run test:browser:sprint6` | E06/E07 AR/EN plus final confirmation, reload, theme/reflow and keyboard checks passed in installed Chrome |
| `backend/` | `npm run test:browser:sprint5` | AR/EN scheduling journeys and stabilization regression matrix passed |
| `backend/` | `npm run test:browser:sprint4` | AR/EN people journeys, 40 route/theme checks, caregiver/file-double workflow and 16 populated checks passed |
| `backend/` | `npm run test:browser:sprint3` | E03/I10/I11 AR/EN and eight commercial layout checks passed |
| `backend/` | `npm run test:browser` | E01/E02 AR/EN and 56 prior UI route/theme/viewport checks passed |
| `backend/` | `npm exec -- prisma validate` | Schema valid |
| `backend/` | `npm exec -- prisma migrate status` | 13 migrations, up to date |
| `backend/` | `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | No difference, development and disposable DBs |
| Root | `git diff --check` | Passed |

The final normal frontend build restores its normal environment configuration.
Before repeating browser commands, run `npm run build:browser` in `frontend/`.
The installed PostgreSQL/Redis conventions were reused; no package, browser binary
or Docker-image install/download was attempted. No owner download commands were
delegated and no verification is blocked on a download.

### Migration/seed replay

The development DB upgraded from the Sprint 5 schema through the two additive
Sprint 6 migrations using deploy; it was not reset. A fresh isolated DB
`raak_sprint6_verify_20261104_agent` applied all 13 migrations and seeded twice.
Counts stayed identical: 2 tenants / 1 operator / 4 staff / 2 customers /
2 invitations / 4 patients / 3 grants / 1 caregiver / 1 plan / 4 visits.
Verified visits: **3 PLANNED unassigned + 1 SCHEDULED**, 2 execution tasks; the
fresh patient-one synthetic grant includes VIEW_VISITS/MANAGE_VISITS. Existing
grants/revocations are never rewritten by seed reruns.

Exact replay commands, working directory `backend/`:

```powershell
docker exec raak-postgres-1 createdb -U raak raak_sprint6_verify_20261104_agent
$env:DATABASE_URL='postgresql://raak:raak-dev-only@localhost:5433/raak_sprint6_verify_20261104_agent'; npm run migrate; if ($?) { npm run seed }; if ($?) { npm run migrate }; if ($?) { npm run seed }; if ($?) { npm exec -- prisma migrate status }; if ($?) { npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code }
docker exec raak-postgres-1 psql -U raak -d raak_sprint6_verify_20261104_agent -c "SELECT status,count(*) FROM visits GROUP BY status ORDER BY status; SELECT count(*) AS execution_tasks FROM visit_tasks; SELECT scopes FROM patient_access WHERE patient_id='44444444-4444-4444-8444-444444444441';"
docker exec raak-postgres-1 dropdb -U raak raak_sprint6_verify_20261104_agent
docker exec raak-postgres-1 psql -U raak -d postgres -tAc "SELECT count(*) FROM pg_database WHERE datname='raak_sprint6_verify_20261104_agent'"
```

The disposable DB was dropped; final absence query returned 0. DATABASE_URL was
process-local. The normal development DB and unrelated Docker services remain intact.

### Failed/intermediate checks retained honestly

- An exploratory `npm exec -- prisma migrate dev --name sprint6_verify --create-only`
  refused the existing development DB's historical Sprint 3 migration checksum and
  requested a reset. No reset or migration-history rewrite was performed. Required
  deploy/status/schema-diff and fresh replay checks all passed. Investigation of
  that old local checksum metadata is separate from Sprint 6 acceptance; use a
  disposable DB for migration-authoring checks until the owner reconciles it.
- One full backend run launched alongside multiple builds/checks hit two unchanged
  5-second timeouts. Running the full unchanged command alone resolved resource
  contention; a subsequent run exposed a new test's random-UUID first-page
  assumption. The test now requests its exact fixture day instead of assuming all
  results fit the first page. The final full command passed all 295 tests without
  increasing timeouts, weakening assertions, changing worker configuration or
  raising pagination limits.
- Sprint 4's helper still expected caregivers to land on agency requests. Its two
  caregiver assertions now require the exact Sprint 6/F08 My Visits destination;
  all other authorization assertions remain. The rerun passed.
- Typecheck caught a misplaced form prop during UI review; it was moved to the
  actual textarea. Final typecheck/build pass. Existing pg concurrent-query
  deprecation warnings remain visible and unsuppressed.

## Key files and review

- Backend: `src/contracts/visits.ts`, `src/modules/visits/`, scheduling
  `change-request*` and `customer-visit.queries.ts`, agency scheduling settings,
  shared `common/visit-date-window.ts`, two Prisma migrations and `seed-visits.ts`.
- Frontend: `features/caregiver-visits/`, `features/customer-visits/`,
  `features/settings/`, existing `features/visits/` review/change extensions and
  the four new localized routes. Feature AR/EN namespaces and shared UI are reused.
- Contracts/data model/policy/events updated in docs 05/06/07/11. ADR-0013 records
  interpretations for owner review; no locked-decision deviation was introduced.
- `sprint-06-review.md` records authorization, concurrency, projection, history,
  responsibility growth, duplication and cross-domain coupling review. Read/query
  and policy responsibilities were extracted; no scheduling engine duplication
  or new feature ownership of shared shells was introduced.

## Remaining external gates / Sprint 7 handoff

Private S3 and live email remain owner-deferred **open** gates with the exact
infrastructure meaning recorded in Sprint 4 status. General event delivery,
notification policy/inbox, reports and launch/production-governance work remain
Sprint 7. Sprint 6 leaves durable events for those consumers and does not claim
delivery or regulatory readiness. No feature acceptance is blocked on those gates.

All changes remain uncommitted on the existing Sprint 5 branch; no merge, push,
deployment, destructive reset or unrelated-user-work overwrite was performed.

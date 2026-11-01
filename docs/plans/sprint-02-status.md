# Sprint 2 — catalog and guest intake status

Date: 2026-11-01
Status: **Implemented and locally demonstrated; final evidence and external gates below.**

Sprint 1 prerequisites were freshly verified before dependent code changes.
ADR-0010 is owner-approved: coordinator queue/detail and only SUBMITTED →
UNDER_REVIEW are included in Sprint 2. Live email-provider/domain verification
remains open; this report does not claim production readiness or MVP completion.

## Work performed

- Inspected Git state before edits and read the authoritative docs in order,
  Sprint 1 closure/checklist, approved-preview contract, preview visual brief,
  ADR-0009 and affected implementation.
- Inventoried the preview and absence of a shared `frontend/components/`
  library; recorded canonical promotion targets and missing reusable
  capabilities in `sprint-02-catalog-guest-intake.md`.
- Recorded and received approval for the E02 review boundary in ADR-0010.
- Created the scoped module/file, authorization, tenant, DTO, state,
  transaction, UI-reuse and verification checklist.
- Implemented tenant catalog/template import/customization, versioned publication,
  permitted public branding including sanitized PNG logos, paginated public
  bilingual service list/detail, the four-step guest wizard, receipt and secure
  request-status access.
- Added initial review queue/detail, coordinator new-request notifications and
  the authorized initial review transition; other commercial/clinical/scheduling
  workflows retain their original sprint ownership.
- Added durable request email delivery, safe localized content, active-tenant /
  current-recipient checks, bounded retries, lease recovery and provider event
  idempotency through a dedicated BullMQ queue.

## Fresh prerequisite verification

All commands below were executed during this preflight on 2026-11-01.

| Directory | Command | Result |
|---|---|---|
| Root | `docker ps` | PostgreSQL 17 and Redis 8 existing containers running/healthy; no image downloads |
| `backend/` | `npm run lint` | exit 0 |
| `backend/` | `npm run typecheck` | exit 0 |
| `backend/` | `npm test` | exit 0; 16 files, 144 passed, 0 skipped |
| `backend/` | `npm run build` | exit 0; API and worker outputs emitted |
| `backend/` | `npm exec -- prisma validate` | exit 0; schema valid |
| `backend/` | `npm exec -- prisma migrate status` | exit 0; existing development DB up to date, 2 migrations |
| `frontend/` | `npm run lint` | exit 0 |
| `frontend/` | `npm run typecheck` | exit 0 |
| `frontend/` | `npm test` | exit 0; 5 files, 32 passed, 0 skipped |
| `frontend/` | `npm run build` | exit 0 |

### Disposable migration/seed replay

Root command:

```powershell
docker exec raak-postgres-1 createdb -U raak raak_sprint2_prerequisite_20261101
```

From `backend/`, with a process-local override to the synthetic disposable DB:

```powershell
$env:DATABASE_URL='postgresql://raak:raak-dev-only@localhost:5433/raak_sprint2_prerequisite_20261101'
npm run migrate
npm run migrate
npm run seed
npm run seed
npm exec -- prisma migrate status
```

Results: all exit 0. Both existing migrations applied on the empty DB; replay
reported no pending migrations. Both seeds reported the same counts: 2 tenants,
1 operator, 3 staff, 1 customer, 2 invitations. Final migration status up to date.

Cleanup from root:

```powershell
docker exec raak-postgres-1 dropdb -U raak raak_sprint2_prerequisite_20261101
docker exec raak-postgres-1 psql -U raak -d raak -c "SELECT datname FROM pg_database WHERE datname = 'raak_sprint2_prerequisite_20261101';"
```

Both exit 0; final query returned 0 rows. Dev DB migrations were not changed.
The existing backend integration suite uses the configured local DB and its
synthetic fixtures; this was not a production-data exercise.

## Implemented workflows and key files

| Workflow | Canonical implementation |
|---|---|
| Strict catalog/branding/intake DTOs | `backend/src/contracts/catalog.ts` |
| Canonical outbox event identifiers | `backend/src/contracts/events.ts` |
| Catalog/import/customization/publication/branding/public projections | `backend/src/modules/catalog/` |
| Public logo decoding/re-encoding | `backend/src/modules/catalog/logo.ts` |
| Transactional intake, idempotency, guest capabilities/sessions, review | `backend/src/modules/requesting/` |
| Email leases/retries, safe content, HTTP provider adapter, queue recovery | `backend/src/modules/notifications/`, `backend/src/worker/` |
| Additive schema/integrity | `backend/prisma/schema.prisma`, migrations `20261101113500_sprint2_catalog_intake`, `20261101150000_sprint2_delivery_integrity` |
| Production portal/wizard/status/settings/review | `frontend/features/catalog/`, matching localized app routes |
| Typed feature copy and validation | `frontend/messages/{ar,en}/catalog.json`, `features/catalog/intake-validation.ts` |
| API client cursor preservation | `frontend/lib/api-client.ts` |
| Full browser harness | `backend/test/browser/sprint2.e2e.ts` |

Authorization remains server-host resolved. Private actions re-evaluate the
central policy and current staff/tenant under the transaction. New requests are
SUBMITTED, with distinct requester/beneficiary identities and immutable
service/pricing/privacy snapshots. Request ownership creates no PatientAccess
or customer-account association. Verified reads omit contact/beneficiary/notes.

## Shared UI promotion and reuse

- `components/ui/button.tsx`: promoted CVA/Slot variants; board and production.
- `components/ui/select.tsx`: promoted Radix Select, with shared theme context,
  themed portals and error-description support; board and production.
- `components/ui/status-badge.tsx`: shared semantic treatment; preview retains
  its visit-to-label mapping and supplies synthetic labels.
- `components/ui/dialog.tsx`: shared centered, bounded, scrollable Radix Dialog;
  preview details, production request detail and publication confirmation.
- `components/ui/field.tsx`: shared visible labels/help/errors, Input/Textarea
  and CheckboxField; board and production form controls.
- `components/ui/feedback.tsx`: shared error/empty/loading/success surfaces;
  preview retry orchestration stays local.
- `components/layout/workspace-shell.tsx`: promoted generic shell slots used by
  the preview without synthetic records or navigation hardcoded into the shell.
- `components/layout/portal-shell.tsx`: new reusable public/customer layout,
  needed because the staff sidebar is not a public portal. Embedded board
  specimen uses the same implementation without nested main landmarks.
- `components/ui/stepper.tsx`: new current-step semantics for the prescribed
  four-step intake, demonstrated on the board.
- CheckboxField adds explicit privacy/price consent semantics, distinct from
  the preview's optional-notification switch.
- `app/tokens.css` owns the shared semantic light/dark theme, radii, shadow and
  motion tokens. `components/ui/styles.css` owns common treatments. Preview
  records, view/filter feedback and demo state remain route-local.

## Acceptance demonstrated / open

| Criterion | Evidence |
|---|---|
| E01 full agency onboarding through visible branded portal | Chrome: register, verify, pending, operator activation, branding/logo, template import/customize/publish, public tenant landing |
| E02 Arabic and English, no account requirement | Chrome: published detail, validated wizard, receipt, captured generic verification email, verified status, actual coordinator login/notification/queue/detail/start-review and refreshed guest status |
| Tenant/permission/unpublished-service denial | Real DB/API integration, including direct service-boundary denial |
| Reference is not authorization; expiry/replay/session scope | API tests; browser fragment clearing and replay denial |
| Submission, publication, verification and review races | API concurrency tests; one idempotent submission and one transition/capability winner |
| Provider failure/duplicate delivery/infra recovery | Injected sender tests plus real Redis/BullMQ retained-failed-job recovery and exhausted-lease tests |
| Board appearance/interactions | Chrome AR/EN × 390/1440 × light/dark; 16 normal/reduced-motion combinations |
| Production responsive/theme/focus matrix | Seven routes across AR/EN × 390/1440 × light/dark, plus queue Dialog dismissal/focus return |
| External provider/domain delivery proof | **Open** — capture adapter proves software behavior; no live email credentials/domain delivery was claimed |

### Final command ledger

Commands were run in the named directory; dependencies are installed local tools.

| Directory | Command | Final observed result |
|---|---|---|
| `backend/` | `npm run lint` | exit 0, no warnings/errors |
| `backend/` | `npm run typecheck` | exit 0 |
| `backend/` | `npm test` | exit 0; **20 files, 163 passed, 0 skipped** after runtime recovery |
| `backend/` | `npm test -- test/catalog/catalog.integration.test.ts` | exit 0; **15 passed**, including final same-email existing-request and wrong-purpose denial assertions |
| `backend/` | `npm run build` | exit 0; API/worker emitted |
| `backend/` | `npm exec -- prisma validate` | exit 0; schema valid |
| `backend/` | `npm exec -- prisma migrate status` | exit 0; 4 migrations, schema up to date |
| `backend/` | `npm run seed` on existing dev DB | exit 0; stable HOME_SUPPORT template installed; reported 3 tenants, 2 operators, 3 staff, 2 customers, 2 invitations; existing records retained |
| `frontend/` | `npm run lint` | exit 0, no warnings/errors |
| `frontend/` | `npm run typecheck` | exit 0 |
| `frontend/` | `npm test` | exit 0; **7 files, 36 passed, 0 skipped** |
| `frontend/` | `npm run build` | exit 0 |
| `frontend/` | `npm run build:browser` | exit 0; same-origin browser build, owner env file untouched |
| `backend/` | `npm run test:browser` | exit 0; E01, E02 AR/EN, fragment replay, **56 production route/theme/viewport checks**, Dialog focus return |
| Root | `node scripts/check-visual-preview.mjs` with artifact override below | exit 0; **8 locale/viewport/theme combinations** |
| Root | `node scripts/check-preview-motion.mjs` | exit 0; **16 normal/reduced-motion combinations** |
| Root | `git diff --check` | exit 0 |

The final board run includes shared Field wrappers, error association, all
promoted controls and the new embedded portal/stepper/consent specimen. Arabic
desktop light and English mobile dark board captures were also visually read.

- Backend: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
  `npm exec -- prisma validate`.
- Frontend: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Frontend browser build: `npm run build:browser` sets the build-time public API
  origin empty without editing the owner's `.env.local`. In PowerShell 5.1,
  assigning an empty environment value removes it; the Node helper preserves
  the intentional empty value and prevents local dotenv fallback.
- Backend browser journeys: `npm run test:browser` uses installed Chrome and
  a real local same-origin ingress, Express, PostgreSQL and captured delivery.
- Root board checks:
  `$env:RAAK_PREVIEW_ARTIFACTS='.impeccable/sprint2-final/'; node scripts/check-visual-preview.mjs`
  and `node scripts/check-preview-motion.mjs`.

### Interrupted checks and recovery

One late full backend test invocation timed out at 120 seconds because Docker
Desktop had stopped providing PostgreSQL and Redis. `docker ps` reported
`Docker Desktop is unable to start`; this was not counted as a pass. Starting
the installed application alone did not restore the engine. `docker desktop
restart`, then `docker start raak-postgres-1 raak-redis-1`, restored the existing
containers; `docker ps` confirmed both healthy. No images were pulled. The full
backend suite then passed 163/163 with no skips.

The extended browser replay check initially reproduced a same-tab fragment
navigation defect. Tracking now listens for hash changes, clears each incoming
capability and guards against stale async responses. The rerun passed both
localized journeys, replay denial and the complete production matrix.

Early development lint/type failures were corrected; their later clean results
are shown above. Prettier could not infer a Prisma parser, so schema formatting
used the installed `prisma format`; validation and schema diff remained green.

### Sprint 2 migration evidence

`npm run generate` and `npm run migrate` applied the two new additive migrations
to the existing Sprint 1 development schema. No applied migration was edited.

Root: `docker exec raak-postgres-1 createdb -U raak raak_sprint2_final_verify`.
In `backend/`, process-local `DATABASE_URL` points to that synthetic disposable
DB at localhost:5433. Commands: `npm run migrate` twice, `npm run seed` twice,
`npm exec -- prisma migrate status`, then
`npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`.

All exit 0: four migrations applied from empty, replay had no pending migration,
seed counts stable (2 tenants, 1 operator, 3 staff, 1 customer, 2 invitations;
stable platform template), schema up to date and **no difference detected**.
Root `docker exec raak-postgres-1 dropdb -U raak raak_sprint2_final_verify`
succeeded; the following `pg_database` query returned 0 matching rows.

### Review fixes

Read-only independent review identified split-port origin/CORS handling,
explicit-origin cursor encoding, failed BullMQ recovery and publication-area
consistency. All were addressed with regression coverage. Author follow-up
also preserved dedicated queue ownership and added public-page skip navigation,
publication consequence confirmation and production Dialog focus return.
See `sprint-02-security-review.md` for coverage and limitations.

## Preserved initial working tree

Pre-existing modified paths: `AGENTS.md`, `frontend/eslint.config.js`,
`frontend/package-lock.json`, `frontend/package.json`,
`frontend/test/i18n.test.ts`.

Pre-existing untracked paths: `.impeccable/`, `DESIGN.md`, `PRODUCT.md`,
`docs/design/`, `frontend/app/[locale]/design-preview/`, `frontend/lib/cn.ts`,
`frontend/lib/design-preview.ts`, both design-preview dictionaries,
`frontend/test/design-preview.test.ts`, `scripts/check-preview-motion.mjs`,
`scripts/check-visual-preview.mjs`.

These source changes were preserved. No commits, pushes or deployments.

## Remaining gates and Sprint 3 handoff

- Configure a verified email sender/domain and API key, then verify actual
  provider delivery and Arabic/English email presentation. Automated runs used
  only synthetic capture delivery. Missing credentials leave durable events
  pending with `EMAIL_NOT_CONFIGURED`.
- In-memory IP limiting remains per-process; DB email/request issuance limits
  are shared. Shared IP enforcement is required before multi-instance rollout.
- Production host preservation, wildcard routing/TLS and secure cookie behavior
  remain deployment validation gates inherited from ADR-0008. No deploy occurred.
- No provider-backed full notification matrix, subscription/payment, clinical /
  patient management, account self-registration/claiming or scheduling added.
  The authoritative F05/E04 account/grant journey retains its owning sprint.
- Sprint 3 starts with tenant-scoped SUBMITTED/UNDER_REVIEW requests and immutable
  fixed-pricing acknowledgment snapshots; add later decisions and versioned
  quote workflows without rewriting these snapshots or broadening guest scope.
- The current catalog uses short tenant-row transaction serialization for
  predictable publication/intake/suspension races. Load budgets are not claimed.
- No package/browser/image/model downloads were required. No owner-run install
  commands or download blockers were introduced.

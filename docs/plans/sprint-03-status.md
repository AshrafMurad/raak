# Sprint 3 — commercial journey status

Date: 2026-11-02
Status: **Implemented and locally demonstrated; external gates and deferred items below.**

Follow-up review (2026-11-02): five additional backend invariant/authorization/
validation gaps were reproduced and corrected, with UI and maintainability
hardening. See `sprint-03-review.md` for current evidence and
`../SPRINT_3_LOCAL_CHECK.md` for interactive browser instructions. Counts and the
five-migration ledger below describe the original implementation run.

Sprint 2 prerequisites were freshly re-verified before dependent changes
(backend lint/typecheck/test 163 passed, frontend 36 passed, on 2026-11-02).
ADR-0010's boundary is preserved: no patient/clinical management, scheduling,
payments or subscription billing was added. The Sprint 2 live
email-provider/domain validation gate remains **open** — nothing in this sprint
claims live delivery; automated runs use synthetic capture only.

## Work performed

- Read the authoritative docs in order, ADR-0010, sprint-02 handoff, and the
  approved-preview shared-UI contract; inspected the clean 75-commit tree.
- Scoped checklist in `sprint-03-commercial.md` before code.
- Additive Prisma migration `20261101190000_sprint3_commercial`:
  `quotes`, `quote_revision_requests`, `idempotency_keys`, request decision
  columns, history `reason`, notification `event_type`, and the BR-QTE partial
  uniques (one effective SENT per group, one open DRAFT per group, one PENDING
  revision per group) plus shape CHECKs (frozen drafts, mutually exclusive
  outcomes, nonnegative totals).
- Contracts (`backend/src/contracts/quotes.ts`): strict DTOs, server-owned
  totals (U10), bounded relative validity windows, explicit-version consent,
  decision schemas. New `QuoteEvents`/request lifecycle outbox identifiers.
- Central policy: new `quotes.manage` action (Owner/Admin/Coordinator).
- Requesting module: `request-info`/`respond`, `approve` with commercial
  prerequisites (FIXED acknowledgment snapshot or ACCEPTED quote +
  feasibility attestation), `reject`, verified `withdraw`; shared locked
  transition core committing history+audit+outbox atomically.
- Commercial module (`backend/src/modules/commercial/`): draft create/edit,
  send (freeze + supersede + revision resolve + outbox in one transaction),
  lazy wall-clock expiry, verified accept with per-principal idempotency keys,
  reject, revision request/decline/resolve-with-replacement.
- Verified-viewer boundary (`request-viewer.ts`): guest session bound to the
  exact request, or the customer account the request row names; staff sessions
  never act as customers; 404 everywhere else.
- Frontend: new `features/commercial/` (request management with draft editor,
  version list, decisions, revision queue; portal quote actions with accept/
  reject/revision, respond and withdraw), `workspace/requests/[id]` route,
  queue dialog management link, track-page quote panel, ar/en
  `commercial.json` namespace, reused shared Field/Button/Dialog/Select/
  StatusBadge/Feedback only.
- Browser harness `backend/test/browser/sprint3.e2e.ts` (installed Chrome,
  real Express/PostgreSQL, injected capture email) — E03 AR+EN, I10/I11 at the
  browser boundary, workspace viewport/theme matrix.

## Fresh verification (all commands run 2026-11-02)

| Directory | Command | Result |
|---|---|---|
| `backend/` | `npm run lint` | exit 0 |
| `backend/` | `npm run typecheck` | exit 0 |
| `backend/` | `npm test` | exit 0; **22 files, 175 passed, 0 skipped** |
| `backend/` | `npm run build` | exit 0; API/worker emitted |
| `backend/` | `npm exec -- prisma validate` | exit 0 |
| `backend/` | `npm exec -- prisma migrate status` | exit 0; 5 migrations, up to date |
| `backend/` | `npm exec -- prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | exit 0; no difference |
| `backend/` | `npm run test:browser:sprint3` | exit 0; E03 AR/EN + I10/I11 + 8 workspace viewport/theme checks |
| `backend/` | `npm run test:browser` (Sprint 2 suite) | exit 0; E01/E02 AR/EN, replay denial, 56 production route checks — no regression |
| `frontend/` | `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `frontend/` | `npm test` | exit 0; **8 files, 39 passed, 0 skipped** |
| `frontend/` | `npm run build` / `npm run build:browser` | exit 0 / exit 0 |
| Root | `git diff --check` | exit 0 (after normalizing one CRLF/EOF artifact) |

### Disposable migration/seed replay (fresh empty DB)

Root: `docker exec raak-postgres-1 createdb -U raak raak_sprint3_verify_20261102`
then from `backend/` with process-local
`DATABASE_URL=postgresql://raak:raak-dev-only@localhost:5433/raak_sprint3_verify_20261102`:
`npm run migrate` ×2, `npm run seed` ×2, `prisma migrate status`,
`prisma migrate diff`. All exit 0: five migrations applied from empty, replay
had no pending migration, seed counts stable (2 tenants, 1 operator, 3 staff,
1 customer, 2 invitations), schema up to date, **no difference detected**.
DB dropped and confirmed gone (0 rows in `pg_database`).

Note on the long-lived dev DB: it had drifted from the committed Sprint 2
migrations (the `request_notifications` unique index declared by the committed
migration was absent). It was reconciled to exactly what the committed
migrations produce before applying Sprint 3; the empty-DB replay above is the
canonical proof and matches. No applied migration file was edited after
application except the Sprint 3 file itself during its initial (dev-only)
application, whose failed first attempt was fully reverted before the corrected
version was applied.

## Acceptance demonstrated / open

| Criterion | Evidence |
|---|---|
| E03 quote revision journey, Arabic and English | Real Chrome run: wizard intake → verified status → coordinator review → draft/send v1 → customer revision request (accept blocked `QUOTE_REVISION_PENDING`) → replacement v2 → v1 accept denied `QUOTE_SUPERSEDED` (I10) → v2 idempotent accept, single outbox event (I11) → coordinator approval with feasibility attestation |
| I10 / I11 at API level | `test/commercial/quotes.integration.test.ts` (superseded denial; same-key replay + different-payload `IDEMPOTENCY_CONFLICT`; concurrent accepts → one audit/outbox) |
| U10 quote math; U11 revision-pending denial | `test/contracts/quotes.dto.test.ts`; integration suite |
| Tenant isolation / denial matrix | Cross-tenant request/quote/revision by ID → 404; caregiver role → 403; unauthenticated → 401; staff cookie on portal action → 401; guest of another request's quote → 404 |
| Expiry / replay / races | Lazy wall-clock expiry (accept, list projection, revision) — `QUOTE_EXPIRED`; concurrent draft creation and send races → exactly one winner; one effective SENT per group |
| State-machine guards | Terminal approvals/rejections/withdrawals refused; drafts refused on terminal requests; wrong-version consent → `VERSION_CONFLICT`; fixed-price approval from immutable snapshot (`commercial: FIXED_ACK` audit) |
| Commercial workspace + portal UI | AR/EN × 390/1440 × light/dark matrix on the management route; Sprint 2 production matrix re-run green |
| Live email-provider/domain delivery of new events | **Open** — external gate inherited from Sprint 2; events are durable and owned by the Sprint 7 matrix |

## Key files

| Area | Files |
|---|---|
| Contracts/events | `backend/src/contracts/quotes.ts`, `events.ts` |
| Permissions | `backend/src/modules/auth/permissions.ts` (`quotes.manage`) |
| Schema/migration | `backend/prisma/schema.prisma`, `prisma/migrations/20261101190000_sprint3_commercial/` |
| Request decisions | `backend/src/modules/requesting/requesting.service.ts`, `requesting.controller.ts`, `request-viewer.ts` |
| Quotes/revisions | `backend/src/modules/commercial/quote.service.ts`, `quote.controller.ts` |
| Shared transport guards | `backend/src/modules/common/http.ts` (origin guard, idempotency key) |
| Tests | `backend/test/commercial/quotes.integration.test.ts`, `test/contracts/quotes.dto.test.ts`, `test/browser/sprint3.e2e.ts`; updated `test/catalog/catalog.integration.test.ts` |
| Frontend | `frontend/features/commercial/*`, `app/[locale]/workspace/requests/[id]/page.tsx`, `features/catalog/{request-queue,tracking}.tsx`, `messages/{ar,en}/commercial.json`, catalog copy additions |
| Frontend tests | `frontend/test/commercial-copy.test.ts`, extended `test/i18n.test.ts` |

## Shared-UI reuse

No new shared primitives were needed: the slice consumes the existing
`components/ui/` Field/Input/Textarea/CheckboxField, Button, Dialog,
StatusBadge, Feedback and the catalog Frame/WorkspaceNav compositions. New
domain screens compose them; the only style-level additions are small
feature-local layout classes. Status/error labels stay in the typed
`commercial.json` namespace with AR/EN parity enforced by tests.

## Deferred / next sprint handoff

- Email rendering and delivery for `quote.*`/`request.*` events (Sprint 7
  matrix); worker still consumes only access-link events. Configure the
  verified provider/domain gate before any live claim.
- No customer self-registration/claiming, PatientAccess grants, patients,
  care plans, scheduling, visits, payments or subscription billing were added;
  Sprint 4 owns people/access, as before.
- `service_requests.customerAccountId` exists and is enforced end-to-end, but
  no flow populates it until the Sprint 4 claim journey.
- In-memory per-process IP limiting and single-instance ingress assumptions
  remain rollout gates inherited from Sprint 2.
- No commits, pushes or deployments were performed. Downloads: none (all
  tooling/images already installed; browser runs used installed Chrome).

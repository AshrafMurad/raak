# Sprint 2 — Catalog and guest intake implementation checklist

Date: 2026-11-01
Status: Implemented and locally demonstrated; live email-provider validation open

**Goal:** a tenant-branded bilingual catalog and guest request journey with
email-verified, request-only status access, built from the approved shared UI.

**Architecture:** extend the existing modular Express API and server-resolved
host realm; additive Prisma schema; transactional audit/history/outbox; separate
email delivery worker. Next.js production and the preview consume the same
shared primitives and semantic tokens. Synthetic preview orchestration remains
route-local.

**Authority:** docs 01, 04, 05, 09, 06, 07, 08, 03, 02, 10–13 in their required
precedence; ADR-0008/0009/0010.

## Preflight

- [x] Inspect Git state before edits; record and preserve pre-existing changes.
- [x] Read docs in required order, Sprint 1 closure/checklist, approved preview
  contract and visual brief.
- [x] Confirm live PostgreSQL/Redis and fresh Sprint 1 lint/typecheck/test/build
  evidence; validate Prisma and replay migrations/seed on a disposable DB.
- [x] Inventory shared code and preview implementation.
- [x] Resolve ADR-0010: owner approved minimal coordinator queue/detail/start-review.

## Existing UI inventory

There is no existing `frontend/components/` shared library. Reuse candidates:

| Existing implementation | Shared target | Responsibility |
|---|---|---|
| `app/[locale]/design-preview/_components/button.tsx` | `components/ui/button.tsx` | CVA variants and Slot composition; preserve existing feedback/busy/disabled states |
| `_components/select.tsx` | `components/ui/select.tsx` | Radix keyboard/typeahead, theme-aware portal, RTL placement; remove preview-copy/type dependency |
| `_components/status.tsx` | `components/ui/status-badge.tsx` | Label/icon plus semantic tone and equal-width variant; keep visit-to-label mapping local to preview |
| Inline Radix Dialog in `_components/design-preview.tsx` | `components/ui/dialog.tsx` | Centered geometry, scrollable body, title/description, focus containment/return and themed portal |
| Inline labels/input/textarea in `_components/component-board.tsx` | `components/ui/field.tsx` | Visible label, required marker, described-by/help/error linkage; input and textarea variants |
| Feedback/empty/loading specimens in board and `state-examples.tsx` | `components/ui/feedback.tsx` | Consistent error, empty, busy and safe-success feedback; preview supplies synthetic retry behavior |
| Preview shell/header/navigation in `_components/design-preview.tsx` | `components/layout/workspace-shell.tsx` | Reusable shell slots and responsive navigation without demo identity/counts or preview navigation |
| Shared colors/radii/motion in `preview.css` | `app/tokens.css` and shared component CSS | Same semantic light/dark token names, generous spacing, approved motion and immediate reduced-motion behavior |

Existing `lib/cn.ts` can be reused. `app/tokens.css`, global Plex imports in
`app/[locale]/layout.tsx`, and typed feature dictionaries remain canonical.
`lib/design-preview.ts`, preview records, example identity, local feedback and
view/filter orchestration remain preview-only. The board currently uses inline
form controls and feedback; a component wrapper alone is not a completed
promotion while common styles still live only in `preview.css`.

### Genuinely missing reusable capabilities

- **Portal layout** (`components/layout/portal-shell.tsx`): public/customer pages
  need a branded header, locale controls, constrained readable main area and
  availability state; the preview's staff sidebar is not the public portal.
- **Stepper** (`components/ui/stepper.tsx`): the prescribed service → identity →
  area/window → review wizard needs an accessible current-step indicator and
  keyboard/focus transition behavior. This is absent from the board.
- **Consent checkbox field** (extend `field.tsx`): the existing specimen is a
  switch for optional reminders; required privacy/price acknowledgment needs an
  explicitly labeled checkbox with error association.

Every promoted/extended/new component must replace its corresponding preview
implementation in the same slice. Add missing states and capabilities to the
board with typed AR/EN copy, not production data or API calls.

## Slice 1 — Shared UI foundation

- [x] Read the installed Next.js guides and applicable React/composition guidance
  before frontend code changes.
- [x] Promote the primitives/layouts above, centralize common styling/tokens and
  switch all affected preview consumers; remove superseded reusable code/styles.
- [x] Keep customer feature compositions separate from shared primitives.
- [x] Add board examples for stepper, consent and portal composition.
- [x] Browser-check board and consumers in AR/EN × light/dark × desktop/mobile;
  keyboard/focus, Select typeahead, centered short-viewport Dialog, loading,
  disabled, validation, empty/error and reduced-motion states.
- [x] Run frontend lint/typecheck/tests/build before proceeding.

## Slice 2 — Catalog and branding

Files/modules:

- `backend/prisma/schema.prisma`, a new additive migration, `prisma/seed.ts`:
  platform templates, tenant agency services and versioned permitted branding.
- `backend/src/contracts/catalog.ts`, `branding.ts`: strict typed DTOs and
  public/staff response projections.
- `backend/src/modules/catalog/{catalog.controller,catalog.service,catalog.repository}.ts`:
  available templates, tenant clone/customize, list/read/edit, publish/unpublish.
- `backend/src/modules/agency/`: branding endpoints and validation.
- `backend/src/modules/auth/permissions.ts`: central catalog/branding actions.
- `backend/src/server.ts`: existing host/session/CSRF guarded route wiring.
- `frontend/app/[locale]/workspace/services/`, `workspace/branding/` and feature
  modules/messages: agency editor, import, publication and branding UI.

Checklist/invariants:

- [x] Templates are platform originals; agency import makes an independent copy;
  agency cannot mutate the original or another agency's offering.
- [x] Owner/Admin publish and branding permissions; Coordinator limited draft
  capability only as documented; no caregiver/customer/platform-catalog bypass.
- [x] Re-run the same `authorize()` at HTTP and service boundaries; all lookups
  and composite FKs bind the server-resolved tenant.
- [x] Validate bilingual names/copy, slug, duration, service areas, qualification
  rules and integer minor-unit pricing/unit before publication.
- [x] Preserve previous request service/pricing snapshots on edits/unpublish.
- [x] Version-check concurrent edits/publication; serialize against tenant
  suspension and intake so a request never commits against an unpublished
  service or inactive tenant.
- [x] Branding stays within approved tokens; no arbitrary CSS/HTML or unvalidated
  logo URL/upload. Define the exact safe logo transport before implementing it;
  a general sensitive-document pipeline is not silently added.
- [x] Transactions include audit/outbox for domain changes; external I/O remains
  outside transactions.

## Slice 3 — Public portal, guest intake and status access

Files/modules:

- `backend/src/contracts/requesting.ts`: strict submission, receipt, access-link
  and limited verified-status DTOs, versioned privacy/acknowledgment data.
- `backend/src/modules/requesting/{requesting.controller,requesting.service,requesting.repository}.ts`:
  public submission, reference issuance, access-link issuance/consumption and
  request-scoped reads.
- Additive schema: service requests, immutable status history and submission
  snapshots, hashed guest capabilities, request-only guest sessions and
  idempotency records, with tenant-consistent relations.
- `frontend/app/[locale]/services/`, `request/`, `track/` and corresponding feature
  modules/messages; tenant landing page consumes the public projection.

Checklist/invariants:

- [x] Public portal lists/returns only enabled published offerings of the ACTIVE
  resolved tenant; draft IDs/slugs and other tenants' IDs never disclose data.
- [x] Intake collects only F02 minimal requester/beneficiary/area/window/notes and
  privacy acceptance; customer identity remains distinct from patient identity.
- [x] Required privacy notice version/time and published service snapshot are
  stored server-side; FIXED acknowledgment required by BR-PRC is preserved even
  though quote workflows belong to Sprint 3.
- [x] New requests are SUBMITTED only; no patient, grant, appointment or schedule
  is created. Preferred time is explicitly unconfirmed.
- [x] Locale-aware form errors, server DTO validation, body/field bounds,
  rate-limit/spam controls and safe idempotency conflict responses.
- [x] Same idempotency key/payload returns one receipt; differing payload is 409;
  parallel submissions produce one request/history/outbox set.
- [x] Tracking reference alone never authorizes reads; access-link request gives
  the same safe acknowledgment for matching/nonmatching requests.
- [x] Opaque email capabilities are hashed, purpose/request/tenant-bound,
  short-lived and claimed atomically once; wrong host consumes nothing.
- [x] Verified browser session is host-only, secure, short-lived and restricted
  to that one request; no PatientAccess and no automatic email-based claiming.
- [x] Consume token fragment and clear it; no capability in logs, query strings,
  referrers or analytics. Recheck tenant and authorization on every private read.
- [x] Response projects only permitted request status/timeline and safe service
  snapshot; no beneficiary notes/addresses or unrelated request list.

## Slice 4 — Required email/outbox and coordinator delivery

Files/modules:

- `backend/src/modules/notifications/`: safe localized templates, current
  recipient/tenant checks, dedupe/delivery records, in-app REQUEST_NEW.
- `backend/src/worker/`: real outbox dispatcher and email processing, replacing
  the current no-consumer stub for the events implemented in this sprint.
- Worker/config/env examples: validated email adapter configuration; synthetic
  capture adapter for deterministic tests and browser verification.

- [x] Request, consent/snapshots/history and outbox commit in one transaction.
- [x] Send generic localized receipt/verification with tenant-bound authenticated
  CTA, not beneficiary/service-specific/medical content.
- [x] Resolve recipient from current server-side association at dispatch/send;
  pause operational delivery for suspended tenants; essential verification and
  receipt policy enforced independently of optional email preferences.
- [x] Dedupe repeated event processing; bounded retries, safe failure status and
  observable permanent failures. No provider calls inside domain transactions.
- [x] Coordinator receives a tenant/principal-scoped in-app new-request record.
- [x] Implement queue/detail/start-review under owner-approved ADR-0010.

## Review focus and meaningful coverage

- [x] Tenant suspension vs submission/publication/verification races fail closed.
- [x] Unpublish vs submission race has a valid serialization order; zero request
  commits from a service already unpublished at its authoritative check.
- [x] Concurrent publication/edit checks reject stale versions without lost data.
- [x] Atomic verification claim permits exactly one winner; expiry at commit,
  replay, wrong purpose/request/tenant/host and reference-only bypass denied.
- [x] Request-only session cannot access a different request, even with matching
  email; no PatientAccess/automatic account link is created.
- [x] Outbox replay/provider failures and retry preserve one logical delivery and
  disclose no notes, addresses, tokens or requester email in logs/errors.
- [x] Shared UI honors keyboard/focus/reflow/RTL, short viewport and reduced motion
  in board and production, including actual loaded Plex fonts.
- [x] E01 browser journey completes registration/verification/activation through
  branding/template customization/publication and visible portal.
- [x] E02 browser journey runs Arabic and English with real API/database/outbox
  capture, including its owner-approved review boundary and denied paths.

## Verification and documentation

- [x] Backend: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
  `npm exec -- prisma validate`; apply migrations on empty and upgrade DB,
  replay deploy/seed, inspect constraints and final migration status.
- [x] Frontend: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`;
  installed Playwright with Chrome/Edge for the new E2E suite and UI checks.
- [x] Do not install/download until incremental transfer is bounded below ~50 MB;
  otherwise delegate exact commands to owner and wait for confirmation.
- [x] Update `07_API_CONTRACT.md` with actual endpoints, DTOs, public/private
  projections, verification/session TTLs, idempotency/version errors and security.
- [x] Update data model, business rules/notifications only where implementation
  concretizes their contract; accepted decisions and acceptance matrix in sync.
- [x] Update `sprint-02-status.md` with commands, counts, shared-UI paths, acceptance
  evidence, open gates and Sprint 3 handoff. No success claim from compilation.

## Execution constraints

### Execution rulings / open external gate

- Requesting queries remain next to their transaction orchestration in the
  focused service, matching existing domain style; shared scoped authorization
  and tenant serialization live in `catalog.repository.ts`. A pass-through
  repository file adds no independent behavior here.
- The logo transport is a restricted public branding PNG with bounded pixel
  decoding/re-encoding, not a general document workflow.
- Email authorization uses hashes; durable delivery alone has an encrypted,
  short-lived secret scrubbed after send/use. Live provider/domain proof is
  still open; local tests use synthetic capture delivery and real Redis.
- The original checkbox criteria are locally demonstrated with the evidence in
  `sprint-02-status.md`; they do not close production rollout/release gates.
- [ ] Configure a verified provider sender/domain and demonstrate real AR/EN
  email delivery before treating the external delivery gate as closed.

Preserve owner changes; no commit, push or deploy. Do not edit historical
migrations. All tests, seeds and demonstrations synthetic. Request review scope
must be decided without weakening the original E02 or MVP acceptance criteria.

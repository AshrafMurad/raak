# Sprint 3 — service organization follow-up

Scope: behavior-preserving organization of commercial and requesting services.
Public factories, DTOs, response projections, errors and database schema stay stable.

## Checklist and commit boundaries

1. Commercial: compose draft/publication, response, revision and query modules
   through `createQuoteService`; extract shared projections and notification helper.
2. Requesting: compose submission, access, query and lifecycle modules through
   `createRequestingService`; keep token issuance inside the submission transaction
   and preserve the shared guarded transition implementation.
3. Verify each slice with backend lint/typecheck and the existing API integration
   tests; before push run the full backend suite/build, migration status/validation,
   and Sprint 2/3 browser journeys using installed Chrome.

Invariants: server-resolved tenant/principal and resource ownership; existing lock
order and transaction scopes; atomic history/audit/outbox; frozen quote history;
principal-scoped acceptance idempotency; guest single-use tokens and expiry;
separate agency/customer projections. Internal helpers borrow transactions.

Existing HTTP/API integration seams are the regression surface. No new behavior
or private-helper tests are needed for this extraction. No dependency downloads.
Baseline: commercial + catalog integration suites, 30 passed, none skipped.

Maintainability: keep the smaller existing services; shared catalog authorization
helper relocation is deferred to a separate cross-domain cleanup.

## Commercial slice evidence

- Public factory composes focused drafts, queries, responses and revisions;
  projection and coordinator-notification helpers are shared internally.
- Transaction bodies retain their original checks, lock order, writes and returns.
- `npm --prefix backend run lint`, `run typecheck`, `run test`, `run build`:
  exit 0; full suite 22 files / 181 tests passed, none skipped.
- Targeted commercial/catalog integration run: 30 passed, none skipped.

## Requesting slice and final verification

- `createRequestingService` composes submission, access, queries and lifecycle;
  existing TTL exports are re-exported. Encryption configuration remains lazy.
- The shared token issuer receives the original transaction; verification, token
  consumption and lifecycle transition bodies retain their original ordering.
- Backend commands after both splits (2026-11-02):
  - `npm --prefix backend run lint`: exit 0.
  - `npm --prefix backend run typecheck`: exit 0.
  - `npm --prefix backend run test`: exit 0; 22 files, 181 passed, none skipped.
  - `npm --prefix backend run build`: exit 0; API and worker emitted.
  - From `backend/`, `npm exec --no -- prisma validate` and
    `npm exec --no -- prisma migrate status`: exit 0; schema valid, six migrations
    up to date. No schema or migration edits were needed.
- `npm --prefix frontend run build:browser`: exit 0.
- `npm --prefix backend run test:browser:sprint3`: exit 0; E03 AR/EN,
  superseded denial, idempotent acceptance, eight viewport/theme checks.
- `npm --prefix backend run test:browser`: exit 0; E01, E02 AR/EN and
  56 production-route viewport/theme checks. Browser runs use installed Chrome,
  real local PostgreSQL, synthetic fixtures and captured email.

## Differential and maintainability review

Independent static review against `56c8b03` found no actionable extraction
regressions. All 11 commercial and 13 requesting methods retain their signatures,
returns and guards, with no composed property collisions or new import cycles.
Each factory has one direct production caller (its controller); those controllers
contain 11 and 13 workflow call sites. Public factories are now 17 and 28 lines;
largest extracted modules are quote revisions (254) and request lifecycle (245).

Review traced moved protections through `git blame` (guest tokens `edb4a53f`,
request ownership/transitions `fa9b074e`, quote acceptance `27265151`) and confirmed
tenant/principal/resource checks, lock order, transaction scopes, idempotency,
expiry, projections, immutable history and atomic audit/outbox remain present.
This is scoped regression evidence, not a comprehensive security audit.

Existing coverage opportunities, deferred because no behavior changed:
- Explicit successful replacement using an existing draft and generic send
  resolving a pending revision (their expiry-denial paths are covered).
- Direct service-level authorization-denial tests supplementing HTTP denial
  tests, so middleware cannot mask future removal of a service guard.

No API contract changes, dependency downloads or additional sprint features.

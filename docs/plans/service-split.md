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

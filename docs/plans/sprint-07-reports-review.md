# Sprint 7 Session 4 — Scoped implementation review

Date: 2026-11-04. Base `9c6858c` (Session 3 merged PR #11). Reviewed inline;
this is a self-review, not an independent external security assessment.

## Scope and risk

High: central authorization additions, agency reports/audit entrypoints and
tenant predicates. Medium: aggregate math, date windows, pagination, capped
lookups, platform tenant-detail aggregates. Lower: bilingual rendering, adapter
decoders, shell navigation and layout-only CSS. Reviewed new reporting module,
contracts, permissions/server/platform edits and frontend reporting feature,
routes/navigation/messages/tests. Docs 05/06/07 and ADR-0017 describe the interface.

History context: inspected permission history/blame (existing ACTIVE tenant,
Owner/Admin versus Coordinator split), shared agencyAction and platform routes.
No pre-existing authorization check is removed. The central authorize registry
has 15 executable production call sites across HTTP/shared gates, platform/staff
and notification modules (18 text matches including definition/two comments).
Only two new action names are added. Three report methods and one audit method
each have one production caller in reporting.controller; existing getTenant has
one controller caller. Existing actions are covered by the full regression suite.

## Findings addressed

1. **Tenant isolation (high, pre-delivery test failure).** Initial new Prisma
   request/visit aggregates omitted tenantId and counted other synthetic tenants.
   Reconciliation/I02 tests failed; explicit where predicates now scope requests,
   visits and all derived count queries. Raw timeliness/load predicates, service
   and caregiver lookups, audit pages and platform aggregates were checked for
   the same variant. Nine integration scenarios and the final full suite pass.
2. **Audit ordering (medium).** Descending random UUID was deterministic but not
   chronological. A timestamp-tie regression failed before the fix. New pages use
   at DESC/id DESC and strict timestamp/UUID cursors, retaining tenant predicates
   on both branches of the keyset condition.
3. **Failed-filter stale display (medium).** A browser assertion reproduced prior
   totals remaining after a reversed-window 422. Loading now clears prior report
   data, errors derive from current state, successful reset removes the error.
4. **Mobile overflow (medium).** E08 reproduced 685px document width at a 360px
   viewport. Shared table-scroll wrappers contain wide tables; all report flows
   and owner audit checks now pass mobile viewport assertions in both locales.
5. **Query/option bounds (low).** Request service breakdown uses SQL groupBy
   ordering/take=101 (100 visible plus truncation sentinel). Caregiver raw query
   uses LIMIT 201. Lookups are one same-tenant batched query each with Maps, not
   per-row fetches. Service filter options support explicit next-page loading
   and visible retry feedback instead of silently hiding options after page one.

## Adversarial checks and projections

- Tenant A submits `tenantId=B`: strict DTO rejects 422; valid foreign serviceId:
  generic 404. Matching names/slugs in B do not merge into A counts or load.
- Caregiver/customer/guest/operator cannot read agency reports; Coordinator can
  read reports but cannot read agency audit; suspended sessions fail at resolver.
  New methods also recheck live session/account/tenant and central policy via
  agencyAction in the read transaction.
- Cursor is only a query boundary, never a row capability; malformed values
  rejected, other-tenant rows excluded on every page. No audit mutation routes.
- Audit projection selects no metadata JSON and no patient/note relations;
  actor/entity opaque IDs, UTC time and agency-restricted reason are explicit.
  Reasons remain authored justification, not a claim of automatic PHI redaction.
- Raw SQL uses bound values; the only Prisma.raw fragment is a column alias
  derived from the closed, server-owned visit-status constant array.
- Platform counts are tenant-specific all-time status totals. They add no
  patient identity, note, service/caregiver row or agency-host authority.

## Maintainability and verification limits

Reports module is 329 lines, cohesive query/projection ownership; audit reader
is separate. Controller only validates/transports. Frontend transport/decoding,
URL/fetch orchestration and screen rendering are separated; shared UI/shells,
tokens and table-scroll patterns reused. No cross-domain writer orchestration
or generic CRUD framework introduced. No new shared visual primitive or theme.

Confirmed by final backend 43 files/329 tests, frontend 19 files/87 tests, E08
AR/EN plus all existing browser suites, lint/typecheck/build and Prisma checks.
See sprint-07-status.md Session 4 for commands, initial failures and exact results.
No open finding identified in this slice's reviewed paths. This does not assert
full product security, measured performance budgets, live provider/storage
verification, migration-history repair or release readiness. Larger-scale query
plans/latency, wider accessibility sweep and deployment/restore remain Sessions 5/6.

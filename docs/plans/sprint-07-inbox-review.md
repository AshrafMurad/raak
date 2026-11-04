# Sprint 7 Session 2 — scoped review

Date: 2026-11-04. Base: `ede1628` (merged PR #9). Review is an inline
author self-review, not an independent audit or production-readiness claim.

## Scope and history

Reviewed changed production modules, request/preference DTOs, route wiring,
frontend adapters/screens, shared-shell consumers, translations and tests.
High-risk surface is the new self inbox/target/preference HTTP interface.
No changes to session/CSRF primitives, worker delivery, grants, domain history,
schema, provider or storage adapters.

`git blame -L 219,227 ede1628 -- backend/src/modules/requesting/requesting.controller.ts`
identified the legacy route as Sprint 2 transport (`edb4a53f`), not a removed
security fix. Its staff-review guards are replaced with session/CSRF plus central
notifications.receive and transactional self scoping. Legacy persistence/writers
remain; no records or migration history were deleted.

Call-site inventory via dedicated content search: createInboxService has one
production caller (notification controller); notificationTarget has one caller
(inbox service); NotificationBadge has two shared-shell consumers (workspace,
portal). The shells broaden regression coverage to existing Sprints 2–6 browser
journeys, all run successfully. `rg` was unavailable; no tool was installed.

## Concrete adversarial checks

| Attempt | Protection/evidence |
| --- | --- |
| A session on B host; B notification ID through A read/target | Host/session binding and tenant+type+recipient where clauses; API tests return 401/404 |
| Same-tenant other recipient reads/targets an ID | Current principal scoping; API 404, including valid-CSRF read |
| Same UUID with customer vs staff principal type | Type is part of every scope; count excludes the other type |
| Customer retains notification after grant expires/revokes | Generic code-only history remains; target becomes null; API expiry/revocation and browser revocation tests |
| Caregiver opens notice after reassignment/unassignment | Current active profile and exact assignment/status; API null path |
| Revoked session or suspended tenant calls private inbox | HTTP and service live-principal checks; API denial tests |
| Cross-site read or preference write | CSRF guard; missing-token API denials |
| Disable essential channel, mass-assign tenant or duplicate cells | Strict canonical preference schema; 422 tests; dispatcher continues to enforce protected cells |
| Personal opt-in overrides agency opt-out | Preference projection exposes tenantEnabled=false; policy remains delivery authority; existing delivery-policy tests pass |
| Duplicate/concurrent read | Conditional update plus tenant transaction lock; both calls preserve the first server timestamp |
| Arbitrary URL returned as notification target | Server builds only relative allowlisted routes; frontend decoder rejects external/unknown paths (unit test) |
| Async filter response races or save fails | Abort cleanup and filter-keyed inbox data; no success until write resolves; error Feedback uses existing alert/status semantics |

No unresolved high/important finding was identified within this scoped review.
The timezone-display defect found during review was fixed with failing-first
backend/frontend assertions and the full suites rerun.

## Maintainability and UI

- Inbox operations own persistence/self scoping; target policy owns the narrow
  read-authority/route projection seam; controller is transport-only. New
  production files stay well below the 400–500-line review trigger. No new generic
  CRUD abstraction or transaction orchestration in HTTP was introduced.
- Frontend HTTP/payload/DTO decoding stays in `features/notifications/api.ts`;
  screens compose shared Button, CheckboxField, Feedback, StatusBadge and existing
  cards/WorkspaceFrame/PortalFrame. NotificationBadge is a shared layout
  composition, with no competing visual primitive, CSS or theme tokens. No
  preview-only component is imported and no board primitive was changed.
- AR/EN dictionary parity passes. Browser tests cover inbox/settings desktop
  light and 360px dark, portal at 360px, generic unavailable feedback, persisted
  settings and essential locks. Keyboard Enter marks read and restores focus to
  the unread filter when its row disappears. Existing light/dark/RTL/LTR shell
  regressions pass across Sprints 2–6. No accessibility certification is claimed.
- Current Web Interface Guidelines were fetched via authenticated gh and applied
  proportionately: labelled native controls, accessible bell name, decorative
  icon hidden, logical shared layouts, URL filters, Intl agency-zone dates,
  no new motion and no success before server confirmation.

## Remaining boundaries

Existing request-queue count now means unread Notification rows; the worker must
run to populate new notices. No union/backfill of legacy RequestNotification.
Business templates/reminders remain Session 3. Live email/private S3 and
jurisdictional readiness stay externally open. The previously recorded local
historical migration-checksum caveat is not reconciled by status/drift checks.
Future performance measurement belongs to Session 5; this review verifies capped
queries/no per-row target lookups during inbox listing, not production p95.

# Sprint 7 Session 1 — focused review

Date: 2026-11-04. Baseline `364cbfd`; scope is notification policy, dispatch,
delivery infrastructure and additive persistence. No frontend changes.

## Risk and coverage

High-risk paths: central permission extension; server-resolved tenant/resource
recipient resolution; current PatientAccess/account/assignment checks; delivery
claim and external-provider handoff. Baseline request-email code is unchanged;
its worker entry retains its three original event kinds and poller. No existing
security check was removed. New dispatcher and delivery each have one production
caller in `worker/notifications.ts`; the router has one server registration.
Permission changes affect the shared registry but add only four explicit actions.

The review covered all new production files, schema/migration and modified
composition/authorization code. New production modules are below the 400–500
line review trigger: policy, audience, dispatcher, transport, settings workflow,
queue adapter and delivery lifecycle have separate responsibilities. There is no
new reverse dependency from another business domain to notifications.

## Findings and disposition

An independent static reviewer identified four important findings:

1. Duplicate NotificationChannel barrel export: reused canonical enums type.
   Typecheck reproduced TS2308 and passed after correction.
2. Missing-renderer rows could starve later due work: added future retryAt and
   rotating UUID delivery/event scans. The retry-deferral regression failed first
   and passed after correction; mixed-batch fairness was inspected statically.
3. Obsolete assignments/needs-review: current status/reviewStatus now suppress
   cancelled/non-SCHEDULED assignments and reviewed notices. Regression failed
   first and passed after correction.
4. Essential event without verified/authorized customer could be silently
   acknowledged: leaves event unprocessed, exposes safe pending-resolution IDs,
   and retries automatically. Regression failed first, then passed, including
   legitimate re-grant recovery.

Additional real PostgreSQL/Redis tests cover dispatch/send races, stable provider
dedupe, five failures/backoff, abandoned lease exhaustion and fencing, revoked
grants, suspended accounts/tenant, wrong-tenant aggregate IDs, protected policies,
CSRF, coordinator management denial and retained failed queue jobs.

## Limits and remaining work

- No live provider/S3 evidence. Capture senders/renderers are synthetic test
  adapters only. No production business renderer is enabled before Session 3.
- Full business event/template matrix is not claimed: the explicit dispatcher
  registry is documented in docs 11; unowned events stay durable.
- Essential no-customer events can remain pending indefinitely when no legitimate
  customer authority exists. Admins see IDs/codes, never inferred patient access.
- Send-time authorization is immediately before external I/O; already delivered
  generic bytes cannot be recalled. Exactly-once external delivery is not claimed.
- Existing local Sprint 3 migration checksum mismatch blocks migrate dev, despite
  successful additive deploy, migration status and zero schema drift. No reset or
  historical migration edits were performed.
- No independent second review after fixes; fixes were verified by regression
  tests and the complete backend suite. No deferred structural refactor identified.

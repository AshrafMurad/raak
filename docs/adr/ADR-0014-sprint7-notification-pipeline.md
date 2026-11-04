# ADR-0014 — Sprint 7 Session 1 notification delivery infrastructure

Status: implementation interpretations for owner review; no locked decision changes.
Date: 2026-11-04.

- Matrix codes in docs 11 are distinct from domain outbox kinds. Only explicitly
  mapped domain events are dispatched; unknown kinds and legacy identity emails
  retain their existing ownership and remain durable. Legacy payloads containing
  email addresses/capabilities are not generalized or copied into new records.
- Fixed `yes`/`when account` in-app cells and required email cells cannot be
  disabled. Only cells labelled configurable accept tenant overrides/personal
  opt-outs. Configurable cells default enabled; optional email still awaits the
  Session 3 renderer and the live-provider gate. Reminders are not scheduled here.
- New records store codes and resource IDs, not localized previews. Session 2
  renders localized inbox text from codes and rechecks resource links. Existing
  RequestNotification projections remain intact until Session 2 adopts the new
  inbox; they are not unioned, preventing duplicate UI results.
- Email delivery rows are durable even without a renderer. They remain PENDING
  with `TEMPLATE_NOT_CONFIGURED`, zero attempts, and are visible to admins.
  Missing provider similarly leaves work pending. Session 3 supplies production
  business renderers; capture adapters test the delivery lifecycle only.
- Customer visit notifications require current VIEW_VISITS (the existing read
  scope); MANAGE_VISITS alone does not grant a read projection. No request
  ownership shortcut. Caregiver recipients require the current exact assignment.
- Policy PATCH uses its own tenant version, strict cell batches and optimistic
  concurrency. Delivery failures expose codes/counts/IDs only to Owner/Admin.
- Dispatch holds the tenant lock before the event lock. Delivery claims have
  random execution tokens; completion/retry writes are conditional on that token.
  Provider idempotency uses the stable delivery ID, not the execution token.
  External delivery cannot promise exactly-once; retries use provider dedupe.
- Reviewed/cancelled obsolete operational events are suppressed. Essential
  change events without a currently readable customer recipient remain
  unprocessed and observable as RECIPIENT_RESOLUTION_PENDING; the dispatcher
  retries automatically without inventing authority. Both event and delivery
  polls rotate UUID cursors, and dependency-blocked deliveries defer retry by
  one minute so unavailable renderers cannot permanently starve later work.

Schema/API changes are additive. No change to historical visits, notes, grants,
quote agreements, session/CSRF rules or existing request-email delivery.

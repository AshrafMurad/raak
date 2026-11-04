# ADR-0016 — Session 3 safe templates and reminder generations

Date: 2026-11-04. Status: implementation interpretations for owner review;
no changes to D01–D23 or existing ADRs.

- Render all docs 11 codes from backend feature-local AR/EN dictionaries. Plain
  text only, generic subjects, direction-isolated authenticated tenant links;
  no visit times, patient/service identity, notes or commercial free text.
- Account notification locale defaults to Arabic; self preference transport may
  explicitly set ar/en. Request-only guests use the request locale and require a
  consumed email proof matching the request's current address. They receive email
  only, never inbox or patient access. Links to /track?request=<id> require verification again
  when no valid session exists; a URL is not an authorization capability.
- Reminder generations are separate from optimistic visit versions: task/review
  or health changes must not silently lose reminders. Assignment/reassignment and
  approved reschedule/cancel replace the generation transactionally. Defaults are
  1440 and 120 minutes for each enabled channel; a non-null existing channel offset
  replaces that channel's two defaults. Only deadlines strictly after booking time
  are scheduled, including after rescheduling. Existing policy changes affect new
  generations; current disable/opt-out still suppresses queued delivery.
- Each reminder has its own outbox ID and stable event/recipient/channel dedupe.
  Future events are not dispatched early; generation/status/window and current
  recipient authority are checked again immediately before external send. Superseded
  pending deliveries become SKIPPED; already delivered generic history is retained.
- Identity/security templates are provided without consuming legacy outbox payload
  capabilities or changing their existing delivery ownership/suspension policy.
  Missing live provider/domain remains fail-closed and is not a simulated success.

Additive schema and API locale field; no clinical, historical note, quote, CSRF,
idempotency or scheduling authorization changes. All external calls remain outside
transactions. Capture evidence does not establish live email or launch readiness.

# ADR-0015 — Sprint 7 Session 2 inbox and preference transport

Date: 2026-11-04. Status: implementation interpretations for owner review;
no locked decisions or existing ADRs changed.

- `/notifications` adopts the new Notification table only. Legacy
  RequestNotification persistence remains intact; no union or synthetic backfill.
- Inbox items expose id, eventType, readAt and createdAt, omitting entity IDs,
  payload and localized free text. Generic AR/EN previews derive from codes.
  Old notifications remain self-visible after resource authorization changes;
  target resolution returns `{path:null}` when the target is unavailable.
- Target lookup uses current resource read authority (not current event
  relevance), allowing historical read access without reusing worker recipient
  resolution as an authorization shortcut. Destinations recheck independently.
- Read is an idempotent self-only CSRF-protected command, first server readAt
  wins under concurrency. It does not mutate domain records or emit business mail.
- Inbox pages order by createdAt then id descending with a timestamp/UUID
  cursor; count is an independent current-principal unread count. Neither scans
  resource content. Page size defaults 20, maximum 100. The list also returns
  the agency timezone for localized timestamp display rather than device defaults.
- Preferences PATCH is a strict batch of configurable cells with optedOut;
  writes serialize on the tenant lock, last committed explicit cell value wins.
  No whole-document replacement or implicit change to other cells. Audit/outbox
  records use IDs only. Essential cells reject even an opt-in write. Tenant
  policy remains independently versioned and authoritative over personal opt-in.

No schema migration, template registration, reminder scheduling, report or
deployment work is needed. Live provider/storage gates remain open.

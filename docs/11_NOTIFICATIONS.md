# 11 — In-App and Email Notification Contract

## Channel scope
V1: `IN_APP`, `EMAIL`. No SMS, WhatsApp, mobile push or voice. Guest users without accounts receive email verification and essential messages; an in-app inbox appears only after a tenant-scoped account session exists. Agency settings configure **optional** events; essential service notifications remain enabled as defined by safe-delivery policy.

## Event catalog
| Code | Audience | In-App | Email | Class |
|---|---|---|---|---|
| `REQUEST_RECEIVED` | Requester | when account | required | essential |
| `REQUEST_NEW` | Coordinators | yes | configurable | optional email |
| `REQUEST_NEEDS_INFO` | Requester | when account | required | essential |
| `QUOTE_SENT` | Verified requester | when account | required | essential |
| `QUOTE_RESPONSE` | Coordinators | yes | configurable | optional email |
| `QUOTE_REVISION_REQUESTED` | Coordinators | yes | configurable | optional email |
| `QUOTE_REVISION_SENT` | Verified requester | when account | required | essential |
| `VISIT_CONFIRMED` | Requester/authorized patient manager + caregiver | yes (accounts) | required to verified external recipient | essential |
| `VISIT_CHANGED` | Same affected people | yes | required | essential |
| `VISIT_CANCELLED` | Same affected people | yes | required | essential |
| `VISIT_ASSIGNED` | Caregiver | yes | configurable | operational |
| `VISIT_REMINDER` | Customer/caregiver | configurable | configurable | optional |
| `VISIT_LATE_FLAGGED` | Coordinator | yes | configurable | optional email |
| `VISIT_NEEDS_REVIEW` | Coordinator | yes | configurable | optional email |
| `CAREGIVER_EXCEPTION` | Coordinator | yes | configurable | operational |
| `STAFF_INVITATION` | Invited staff | N/A | required | identity |
| `SECURITY_VERIFICATION` | Customer or staff | N/A | required | security |

**Note:** If a verified email recipient is unavailable, do not fabricate deliverability; show internal alert and a safe retry path. Never send recipient-sensitive data to unverified addresses.

## Example notification payload
```json
{
  "eventId":"<uuid>",
  "tenantId":"<uuid>",
  "type":"VISIT_CHANGED",
  "entityType":"VISIT",
  "entityId":"<uuid>",
  "recipientPrincipalId":"<uuid>",
  "channels":["IN_APP","EMAIL"],
  "templateKey":"visit.changed.v1",
  "occurredAt":"2026-11-02T09:15:00Z"
}
```
No full patient name/address, free-text notes, diagnosis, clinical instructions or signed file URLs in outbox payload.

## Template requirements
- Localize Arabic/English, agency display name, generic purpose and authenticated CTA.
- Subject e.g. Arabic: `تحديث بخصوص موعدك لدى عافية` or English: `Your appointment has been updated` (without patient identity or medical service specifics).
- Email should not include medical details, precise home address, sensitive care task, or arbitrary quote negotiation text.
- Link lands on tenant portal, verifies identity as necessary, checks current permissions and state; don't expose full quote in query params.
- From-address controlled by platform verified domain/provider; Reply-To may reference verified agency support only; do not spoof unverified agency custom domains.

## Agency configuration schema
`NotificationPolicy(tenantId,eventType,channel,enabled,reminderOffsetMin?,updatedBy,updatedAt)`.
- Essential events enforced server-side and immutable in configuration UI; don't assume all channels always possible for a guest.
- Default reminders suggested at 24h and 2h prior, both **optional**. If visit booked inside reminder offset, schedule only future relevant reminders.
- Tenant setting changes affect new notifications; cancel/recompute stale reminder jobs when dates move, with event version checks at delivery time.
- User opt-outs override optional tenant defaults; always honor operational/security essential contact subject to required legal preferences and applicable law.

## Delivery pipeline
1. Domain transaction writes minimal outbox event and business change atomically.
2. Dispatcher resolves audience, access, current tenant status, tenant policy and personal preferences.
3. Create in-app record and queue email with stable dedupe key.
4. Worker verifies event still relevant (e.g. appointment not rescheduled again), sends using email provider, stores safe provider ID/status.
5. Transient failures -> bounded exponential backoff; permanent -> mark failed and escalate; admin can view safe failure information.
6. On success, in-app unread state persists until user reads; email delivery does not mark notification read.

## Sprint 7 Session 1 infrastructure

Canonical channel policy lives in `contracts/notifications.ts`. Configurable
cells default enabled; fixed in-app and required email cells ignore tenant/personal
disable attempts. Personal opt-outs are persisted and enforced for configurable
cells only; their transport/UI is Session 2.

The general dispatcher currently maps `request.new`, `quote.responded`,
`quote.revision_requested`, `visit.needs_review`, `caregiver.exception_changed`,
`visit.assigned` and `visit.change_approved` to code/ID-only in-app records and
per-recipient email rows. Approved changes map to VISIT_CHANGED/VISIT_CANCELLED
by change type. It resolves current accounts/roles, assignment and VIEW_VISITS
grants; tenant suspension leaves operational events pending. Unsupported events,
including requester quote/request template events and legacy identity mail, remain
durable and unprocessed. They are not blanket-acknowledged. Existing dedicated
request verification/claim-email handling remains unchanged.

`raak-notification-email` supports durable per-recipient delivery, two-minute
execution-token leases, five attempts, bounded exponential retry, terminal failures
and stable delivery-ID provider dedupe. Email send rechecks current recipients,
grants, tenant and policy. External calls occur outside transactions. No production
business renderer is registered until Session 3: queued work remains PENDING with
TEMPLATE_NOT_CONFIGURED and zero attempts, never SENT. Capture senders/renderers
test this infrastructure; they do not establish live email evidence. Admins inspect
safe failure metadata through `/agency/notification-deliveries`.

Obsolete needs-review/assignment notices are suppressed against current visit
state. Essential changes lacking an eligible customer remain unprocessed and
appear in the admin endpoint's `blockedEvents` with RECIPIENT_RESOLUTION_PENDING;
automatic re-resolution recovers after legitimate account/grant restoration.

Legacy identity/security policy is preserved, not newly generalized: owner,
password-reset, invitation and activation event kinds remain pending for their
own safe-delivery integration; existing customer verification/claim emails still
use their dedicated ACTIVE-tenant path. No production identity-mail claim is made.

`RequestNotification` is retained for existing clients; Session 2 adopts the new
inbox rather than unioning both projections. Full matrix templates and reminder
generation/invalidation remain Session 3. See ADR-0014 and sprint-07-status.md.

## In-app behavior (UI requirements)
- Header badge count uses current principal and tenant; pages support unread-only and mark-as-read; link to corresponding tenant-authorized resource.
- If resource later becomes unauthorized, clicking shows generic unavailable state, no leak via preview.
- Optional future realtime transport may use SSE or WebSocket, with audience checks; polling is acceptable for MVP if responsive and server efficient.

### Implemented Session 2

`/notifications` now reads the new Notification table exclusively (no legacy
union/backfill), with capped pages/unread-only filtering. Count and monotonic
mark-read are current-principal/type/tenant only. Preview text derives from codes
in `messages/{ar,en}/notifications.json`. Resource links resolve on demand under
fresh authorization and show generic unavailable feedback after grant/assignment
changes; destination APIs still deny independently.

Workspace and portal headers poll unread count every 60 seconds and refresh on
focus and confirmed read; failures hide the count rather than inventing zero.
Both surfaces provide AR/EN inbox/preferences; agency settings link to protected
matrix policy configuration. Optional personal choices expose tenant-disabled
state; essential agency cells are visibly disabled and server-protected.
No email renderer or reminder generation is registered by this session.

## Tests

### Implemented Session 3

`modules/notifications/messages/{ar,en}.json` supplies every matrix code's safe
plain-text subject/copy. Production business rendering is registered through the
existing worker/provider gate. Links use validated configured tenant origins,
locale-prefixed allowlisted paths, and Unicode isolation for mixed RTL/LTR text.
Public agency labels are stripped of control/bidi overrides; no business free
text, patient identity, appointment time or service detail is interpolated.
Account notification locale defaults ar and is self-configurable via preference
transport; new customers inherit their registration language. Request-only guests
retain their request language, with current verified-email proof required.

Requester information/offer mappings and confirmed/reassigned visit events now
join existing coordinator/change events. Guests receive only generic email and
must verify on /track; no inbox or patient access is inferred. Initial receipt /
request-access verification retains the dedicated pipeline, avoiding a duplicate
receipt. Legacy identity/security outbox capabilities retain their existing
ownership and remain unprocessed by the general dispatcher; the catalog alone
does not claim invitation/owner/reset delivery integration. No late-visit
detector is introduced; its matrix template is available without inventing events.

Assignment/reassignment and approved changes atomically replace reminder
generations. Default optional 24h/2h offsets apply independently to IN_APP/EMAIL;
a non-null policy offset replaces that channel's defaults. Only deadlines strictly
after booking are created. Cancellation invalidates pending work; reschedule
recomputes it. Revision, current scheduled window/status, future start, current
assignment, verified accounts, VIEW_VISITS grants, tenant state and optional
policy/preferences are checked again at dispatch/send. Existing delivered generic
history remains; pending obsolete emails are SKIPPED. Provider dedupe/retry/lease
and safe admin attempts remain unchanged. Live email evidence remains an owner gate.

### Implemented Sprint 6 durable events

`VisitEvents` records started, task_updated, draft_saved, completed, needs_review,
reviewed, corrected, change_requested/approved/rejected/withdrawn and scheduling
settings updates. Each commits with its business mutation; note bodies, task
exception text and restricted review notes are excluded from event payloads.
Events identify their visit or change-request aggregate; delivery resolves tenant,
current authorization and recipients afresh. A NEEDS_REVIEW completion is visible
in the agency visit list/detail. General visit notification delivery and live email
verification remain Sprint 7/open gates, not acceptance claims for this sprint.

### Implemented Sprint 5 assignment-health events

`visit.reassignment_flagged` and `visit.reassignment_resolved` are durable
operational events. Both commit with the health/version change and append-only
audit inside the configuration writer's transaction. The event aggregate is the
visit ID and payload contains the caregiver ID only. Qualification, profile,
availability and service-authorization changes use the same hard filters; no
visit is silently reassigned or cancelled. General notification delivery remains
owned by Sprint 7; writing these events is not a claim of email delivery.

### Implemented Sprint 4 security verification

`email.customer_verification` and `email.customer_claim` join the existing durable
request-email queue/lease/retry pipeline. Events carry the capability-record ID
as aggregate and empty payload; recipient, locale, current account/request state
and tenant are resolved again at delivery. Delivery-only encrypted secrets are
scrubbed on send/consumption. New links target the tenant `/account` route with
fragment-only proof; claim links additionally identify the request in the cleared
fragment and remain bound to the issuing customer. Email contains generic security
copy, not patient/relationship/license details. The existing provider/domain gate
remains open; capture adapters in tests are not live email delivery.

People/caregiver/document mutations also append canonical durable events from
`contracts/people.ts`, `caregivers.ts`, `documents.ts` atomically with audit and
business data. Their payloads contain no patient free text or file capabilities.
Sprint 7 retains general inbox/policy/business-notification delivery ownership.

### Implemented Sprint 3 durable events

`QuoteEvents` in `backend/src/contracts/events.ts` adds `quote.sent`,
`quote.responded`, `quote.revision_requested` and `quote.revision_sent`;
request decisions add `request.info_needed`, `request.responded`,
`request.approved`, `request.rejected` and `request.withdrawn`. Payloads carry
`{requestId, quoteId?}` only. All are committed atomically with their state
transition. Coordinator in-app `RequestNotification` rows are extended with an
`eventType` column (`REQUEST_NEW`, `QUOTE_RESPONSE`,
`QUOTE_REVISION_REQUESTED`) with a per-(request,staff,event) unique. The
dedicated request-email worker still consumes only access-link delivery; email
rendering for quote/request events stays with the Sprint 7 notification matrix
(events remain durable and unacknowledged, never discarded).

### Implemented Sprint 2 delivery slice

`RequestEvents` in `backend/src/contracts/events.ts` maps the generic receipt /
SECURITY_VERIFICATION delivery to `email.request_access`; it carries only a
token-record aggregate ID and request ID. `request.new` records new intake and
`request.review_started` records the approved initial review transition.
Coordinator `RequestNotification` rows are created in the intake transaction,
without beneficiary details in notification projections.

The worker polls eligible active-tenant email events into the dedicated
`raak-request-email` BullMQ queue. It rechecks current tenant, requester email,
token purpose/expiry/consumption before sending localized plain-text content.
Each delivery uses a stable event/provider idempotency key, a two-minute lease,
up to five business delivery attempts and exponential retry. Retained failed
queue jobs are retried after infrastructure recovery; abandoned exhausted
leases become FAILED, not SENT. Failure codes are safe and persisted.

The installed Resend HTTP adapter requires `EMAIL_API_KEY`, verified
`EMAIL_FROM`, `BASE_DOMAIN` and the same `SESSION_SECRET` in API and worker.
`PORTAL_PORT` supports development ingress (default dev 3000); omit it for
standard production HTTPS. When credentials are absent, events stay pending
and the worker reports `EMAIL_NOT_CONFIGURED`; no fake send occurs.

Automated tests use an injected synthetic capture sender, real PostgreSQL and
Redis/BullMQ. Live provider/domain delivery proof is still an external gate.
Full notification preferences, inbox/read management, other business templates
and the remaining event matrix retain Sprint 7 ownership. Other event kinds
are not acknowledged or discarded by the dedicated request-email consumer.

- Essential event cannot be disabled by tenant admin.
- Optional events honor tenant and personal settings.
- No duplicate in-app/email event for retried same eventId.
- Suspended tenant receives no unintended operational mail; security/owner account notifications follow separate policy.
- Recipient revoked from patient access before send -> no sensitive content; link cannot access resource.
- Rescheduling invalidates outdated reminders.
- Arabic/English templates and RTL email rendering verified.

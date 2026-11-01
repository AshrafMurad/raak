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

## In-app behavior
- Header badge count uses current principal and tenant; pages support unread-only and mark-as-read; link to corresponding tenant-authorized resource.
- If resource later becomes unauthorized, clicking shows generic unavailable state, no leak via preview.
- Optional future realtime transport may use SSE or WebSocket, with audience checks; polling is acceptable for MVP if responsive and server efficient.

## Tests

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

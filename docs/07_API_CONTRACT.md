# 07 — REST API Contract (v1)

## Baseline contract
- Base URI: `/v1`. JSON UTF-8; camelCase DTO fields, UTC ISO 8601 timestamps, UUID internal IDs, localized labels only in UI.
- Tenant context resolved on server from trusted host + authenticated workspace audience; opaque `X-Request-ID` for correlation. Never authorize solely from route `tenantSlug` or client `tenantId`.
- Authentication: secure session cookie + CSRF token for mutating calls. Guest action endpoints use one-time scoped capability verified by email, plus anti-CSRF as required by the selected transport.
- `Idempotency-Key` required on high-impact POST endpoints: request create, quote accept, plan activate, visit assign, visit complete, change request decision; same key + different payload -> 409.
- Pagination: `?limit=20&cursor=<opaque>` default 20, max 100; sorting allowlisted; filtering allowed by role; no unrestricted free-text search across patient notes.
- Error shape, always stable `code`:
```json
{"error":{"code":"SCHEDULE_CONFLICT","message":"Selected caregiver is not available for the requested time.","details":{"visitId":"...","conflictType":"BUFFER"},"requestId":"..."}}
```
- HTTP codes: 400 validation syntax, 401 unauthenticated, 403 wrong action (can return 404 for object privacy), 404 nonexistent/inaccessible object, 409 state/version/conflict, 422 semantic invalid, 429 rate limit, 500 generic server error. Never leak SQL/provider token data.
- Use `If-Match` version or explicit `expectedVersion` for high-contention mutable entities.

## Platform control plane (PlatformOperator only)
<!-- Sprint 1 implements all control-plane routes in this table. -->
| Method | Path | Purpose |
|---|---|---|
| GET | `/platform/tenants` | Scoped tenant list and aggregate counts only |
| GET | `/platform/tenants/:tenantId` | Metadata, owner, status, usage summary |
| POST | `/platform/tenants/:tenantId/activate` | Approve/activate; reason audit |
| POST | `/platform/tenants/:tenantId/suspend` | Suspend with reason, invalidate sessions |
| GET | `/platform/audit` | Operator actions; minimal metadata |

## Identity / tenant
| Method | Path | Purpose |
|---|---|---|
| POST | `/agencies/register` | Creates pending tenant + owner; check slug |
| POST | `/auth/login` | Tenant-scoped login |
| POST | `/auth/logout` | Revoke current session |
| GET | `/auth/me` | Audience, role, tenant, safe permissions |
| POST | `/auth/verify-email` | Consume verification token |
| POST | `/auth/forgot-password` | Generic acknowledgement, email-based recovery |
| POST | `/auth/reset-password` | Consume one-time reset token, rotate credential and revoke sessions |
| POST | `/staff/invitations` | Agency Owner/Admin creates invite and optional caregiver profile |
| POST | `/staff/invitations/accept` | Token consumption + account setup |
| GET/PATCH | `/agency/settings` | Agency identity, timezone, travel buffer, policy; versioned |
| GET/PATCH | `/agency/branding` | Brand assets and public portal copy |
| GET/PATCH | `/agency/notification-policies` | Optional event preferences only |

Sprint 1 implements registration; login/logout/me; owner email verification;
forgot/reset password; staff invitation issue/accept; and all `/platform/*`
control-plane routes. Agency settings, branding and notification policies remain
owned by later sprints. Cookie-authenticated mutations require `X-CSRF-Token`;
public one-time-token consumption routes are rate limited and do not require an
existing session. `TOKEN_EXPIRED` returns 401, `TOKEN_ALREADY_USED` returns 409,
and unknown capability tokens return generic `UNAUTHENTICATED` without account
enumeration.

Staff invitation acceptance (`POST /staff/invitations/accept`) must be sent on
the invitation's own server-resolved tenant host (the generated link already
targets `{slug}.<RAAK_BASE_DOMAIN>/…#token=…`). Acceptance attempted on another
tenant host or the platform host is rejected with generic `UNAUTHENTICATED`
without consuming the token or creating an account; a subsequent acceptance on
the correct host still succeeds. Privileged control-plane and staff operations
re-run the central `authorize()` policy at the service boundary in addition to
the HTTP permission gate.

## Agency service catalog and portal
| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog/platform-templates` | Auth agency can import available templates |
| GET/POST | `/agency/services` | Tenant service list / create |
| GET/PATCH | `/agency/services/:id` | Service edit/read; versioned |
| POST | `/agency/services/:id/publish` | Validate mandatory service fields, qualification rules |
| POST | `/agency/services/:id/unpublish` | Stop new public requests, preserve existing |
| GET | `/portal/services` | Public published services for resolved tenant |
| GET | `/portal/services/:slug` | Public service view and price display |

## Requests and guest access

### Sprint 2 implementation — catalog, branding and initial intake

Implemented routes: catalog template/list/create/read/edit/publish/unpublish;
agency branding GET/PATCH; public service list/detail; guest submission and
access-link issue/consume; request-only guest list/detail; coordinator request
queue/detail/start-review; and the minimal coordinator new-request notification
projection. ADR-0010 assigns only SUBMITTED → UNDER_REVIEW to this sprint.
Sprint 3 implements the remaining request decisions and commercial workflows
below; both slices now share the same tenant/verification/CSRF boundary.

Canonical input schemas: `backend/src/contracts/catalog.ts`. Unknown body fields
are rejected. Protected agency operations use session + CSRF + central policy,
rechecked against the current staff/tenant at the transactional service boundary.

#### Catalog and branding DTOs

- `POST /agency/services`: `{slug, templateId?, config?}`. Template import copies
  an active platform original into an independent tenant draft; custom offerings
  provide `config`. An inactive/missing template is inaccessible. Agencies have
  no endpoint that writes a platform original. The synthetic seed supplies a
  stable `HOME_SUPPORT` template.
- `config`: bilingual `nameAr/nameEn` (1–120), `summaryAr/summaryEn` (1–300),
  `descriptionAr/descriptionEn` (1–3000), `durationMin` (15–720),
  `clinicalClass=NON_CLINICAL|CLINICAL`, `requiredQualificationCodes[]`,
  `serviceAreaIds[]` (1–50), `allowStandalone`, `allowRecurring`, `pricingType`,
  `priceMinor`, `pricingUnit`. Clinical offerings require qualification codes;
  at least one delivery mode is required. FIXED/STARTING_FROM require a
  nonnegative integer amount (<=100000000 minor units) and VISIT/HOUR/SESSION
  unit; CUSTOM_QUOTE has null amount/unit. Currency is server-owned tenant data.
- `PATCH /agency/services/:id`: `{expectedVersion, slug, config, isEnabled}`.
  Published edits require publication authority. Disabling also unpublishes.
- Publish/unpublish: `{expectedVersion}`; increments version, audits and writes
  an outbox event. Stale versions/duplicate slugs return `409 VERSION_CONFLICT`.
  Publication requires enabled, valid configuration and permitted agency areas.
  Edits and branding changes may not invalidate published service areas.
- Owner/Admin: publication and branding; Owner/Admin/Coordinator: catalog reads
  and draft creation/editing. Caregiver/customer/platform principals are denied.
- Branding GET: `{branding, version}`. PATCH: `{expectedVersion, branding}`;
  initial version is 0. Branding contains bilingual names/descriptions,
  `primaryColor=MIDNIGHT|LAVENDER`, `areas:[{id,nameAr,nameEn}]` and optional
  `logoPng` (base64 or null). Color treatments use semantic locked-palette tokens.
- Logo is explicitly public brand data, not a patient attachment. Only <=128 KiB
  PNG input, <=512×512, non-interlaced 8-bit RGB/RGBA is accepted. The server
  validates signature, chunks/CRCs and bounded decompression, decodes pixels and
  re-encodes without metadata/extra payload. No original upload, SVG, arbitrary
  URL, CSS or HTML is served. Other encodings return 422.
- Template and private service lists return `{items,nextCursor}`. Public list
  returns `{agency:{displayName,brandJson,currency,timezone},services,nextCursor}`;
  detail returns `{id,slug,config,version}` only. Lists support UUID opaque
  `cursor`, `limit=20` default, maximum 100. Public reads are `no-store` and
  require ACTIVE tenant + enabled/published service, otherwise 404 or a generic
  tenant-unavailable response. IDs/references never grant authority.

#### Guest submission and verification DTOs

`POST /portal/requests` requires a 16–128 character opaque `Idempotency-Key` and:

```json
{
  "serviceId":"<uuid>", "serviceVersion":2, "locale":"ar",
  "requesterName":"<synthetic requester>", "requesterEmail":"synthetic@example.invalid",
  "requesterPhone":"", "beneficiaryName":"<distinct synthetic beneficiary>",
  "relationship":"SELF", "areaId":"central", "preferredDate":"2026-12-01",
  "preferredPeriod":"FLEXIBLE", "notes":"", "privacyAccepted":true,
  "privacyVersion":"2026-11-01", "priceAcknowledged":true, "website":""
}
```

- Names <=120 characters; normalized email <=254; optional phone <=30 with
  telephone characters only; relationship SELF/FAMILY/OTHER; period
  MORNING/AFTERNOON/EVENING/FLEXIBLE; optional operational notes <=500. No medical
  history, diagnosis, full address, tenant, patient, role or status input.
- Date is valid ISO local date, not before the current date in the tenant zone.
  Area must belong to both the published offering and configured agency areas.
- Privacy acknowledgment/version is mandatory; submission time is server-owned.
  FIXED pricing requires explicit price acknowledgment. The immutable service
  snapshot includes published version, names/scope, pricing/unit and currency.
- `website` is an empty honeypot. Per-host/IP limiting is 30 guest POSTs/15 min
  per API process; DB enforcement caps new requests per tenant/email at 5/hour
  and access-link issuance at 4/request/hour. Unknown email/reference requests
  do not send mail. Shared multi-instance IP enforcement remains a rollout gate.
- Success `201 {data:{id,reference}}` means SUBMITTED, not a confirmed visit.
  Same key + same normalized payload returns the same safe receipt; different
  payload returns `409 IDEMPOTENCY_CONFLICT`. There is no automatic patient,
  customer-account claim, PatientAccess, quote, plan or visit creation.
- Intake/publication/verification/review writes serialize on the resolved tenant
  row with lifecycle changes; business data/history/audit/outbox commit together.
  Providers are never called within a DB transaction.
- Access-link issue: `{reference,email,locale}` → `202 {acknowledged:true}` for
  both matches and nonmatches. Initial receipt delivery also supplies a secure
  link, with no account requirement.
- Consume: `{token}` → `{requestId}` plus host-only `HttpOnly`, `SameSite=Strict`
  guest cookie (`Secure` in production), 30-minute expiry. The 15-minute random
  capability is hash-authorized, single-use and bound to tenant/request/purpose/
  current requester email. A delivery-only AES-GCM encrypted copy is scrubbed
  after send or consumption; events contain only resource IDs. Wrong host does
  not consume it. Expiry is 401; replay is 409. Links use fragments, cleared by
  the client before consumption, with `no-referrer` and `no-store` responses.
- Verified guest reads return only the one request's ID/reference/status,
  submitted time, service snapshot, version and status timeline. List contains
  that one request. Beneficiary/contact/notes are absent. Reference-only access
  returns 401; another request ID returns 404. Existing customer login does not
  infer ownership from email or grant patient access.
- Cookie-authenticated agency mutations require CSRF. Public guest JSON
  mutations check same-origin, or an explicitly allowlisted frontend origin on
  the **same tenant hostname** for split-port development. CORS permits
  `Idempotency-Key`; a different tenant origin is never a guest authority.

#### Initial review and notification projection

- Queue GET: `{items,nextCursor}`, 20 per page, optional status filter (any
  documented request status) and UUID cursor. Owner/Admin/Coordinator only.
  List omits contact, beneficiary and notes; authorized detail includes the
  minimal intake data.
- Start-review POST: `{expectedVersion}` → `{id,status:"UNDER_REVIEW",version}`.
  Only SUBMITTED can transition; concurrent losers receive 409; one history,
   audit and outbox write commits. Sprint 3 implements the decision endpoints below.
- `/notifications` currently returns up to 100 safe notification references for
  the current authorized coordinator/staff principal only, tagged with
  `eventType` (`REQUEST_NEW`, `QUOTE_RESPONSE`, `QUOTE_REVISION_REQUESTED`).
  Full notification inbox/read-policy management remains Sprint 7.
- `VERSION_CONFLICT` is added to the error registry for catalog/branding/request
  optimistic concurrency; other status meanings remain unchanged.

| Method | Path | Purpose |
|---|---|---|
| POST | `/portal/requests` | Guest or logged-in submit; idempotent, anti-abuse |
| POST | `/portal/requests/access-link` | Non-enumerating email verification request |
| POST | `/portal/requests/access-link/consume` | Consume one-time scoped token (safe session) |
| GET | `/portal/my/requests` | Current verified guest's scoped request or customer's own requests |
| GET | `/portal/my/requests/:id` | Limited request detail/status |
| GET | `/agency/requests` | Coordinator list with filters |
| GET | `/agency/requests/:id` | Restricted detail |
| POST | `/agency/requests/:id/start-review` | SUBMITTED -> UNDER_REVIEW |
| POST | `/agency/requests/:id/request-info` | UNDER_REVIEW -> AWAITING_CUSTOMER |
| POST | `/portal/my/requests/:id/respond` | Customer info response -> UNDER_REVIEW |
| POST | `/agency/requests/:id/approve` | Validate commercial/operational prerequisites |
| POST | `/agency/requests/:id/reject` | Reason required |
| POST | `/portal/my/requests/:id/withdraw` | Allowed prior to approval |

### Sprint 3 implementation — request decisions and commercial acceptance

All Sprint 3 routes below are implemented and covered by integration and
browser tests. Unknown body fields are rejected; monetary values are integer
minor units in the tenant currency and totals are always computed server-side.
Protected agency operations use session + CSRF + the central policy
(`quotes.manage` = Owner/Admin/Coordinator; request decisions use
`requests.review`) rechecked at the transactional service boundary. Portal
actions authorize only through a fresh guest session bound to that exact
request, or a customer account the request row itself names; everything else is
404 (no enumeration). Guest-cookie portal mutations share the same same-origin
guard as Sprint 2 intake.

Linked customer accounts are resolved from the agency session cookie inside the
workflow transaction (including current account/session state and verified email),
with `X-CSRF-Token` required for mutations. Request list/detail uses the same
ownership check and safe projection as quotes; the customer list is bounded to
the 100 most recent linked requests. Self-registration/claiming remains Sprint 4.

Request decisions:

- `POST /agency/requests/:id/request-info` `{expectedVersion, note(5..500)}`:
  only UNDER_REVIEW → AWAITING_CUSTOMER; the note is stored on the status
  history row shown to the verified requester (no email body content).
- `POST /portal/my/requests/:id/respond` `{note(1..500)}`: only
  AWAITING_CUSTOMER → UNDER_REVIEW for the verified requester.
- `POST /agency/requests/:id/approve` `{expectedVersion, feasibilityConfirmed:true}`:
  only UNDER_REVIEW → APPROVED. Prerequisites enforced in-transaction: for
   FIXED pricing with no issued formal quote, the immutable submission-time
   acknowledgment snapshot (`priceAcknowledged` + snapshot price/unit/currency).
   Once any formal quote has been issued, the latest non-DRAFT offer must be
   ACCEPTED, including for originally FIXED pricing; expired/rejected terms never
   silently restore the original acknowledgment. STARTING_FROM and CUSTOM_QUOTE
   likewise require an ACCEPTED quote version. Approval creates no patient, plan or
  visit. Missing prerequisites return `409 STATE_TRANSITION_INVALID`.
- `POST /agency/requests/:id/reject` `{expectedVersion, reason(5..500)}`:
  terminal from any open status; reason recorded on history/audit.
- `POST /portal/my/requests/:id/withdraw` `{reason?(<=500)}`: terminal from any
  open status for the verified requester.
- All transitions lock the tenant row then the request row, validate
  `expectedVersion` (`409 VERSION_CONFLICT` on stale), and commit status
  history + audit + outbox event atomically. Verified request reads now include
  each history entry's stored `reason`.

Quotes (single `quoteGroupId` per request; versions strictly increase):

All line amounts and the computed aggregate total are capped at **2147483647
minor units**, matching PostgreSQL INTEGER persistence. Larger payloads return
422 before database writes. After acceptance, new drafts, edits, sends and
replacement publication are refused (409); post-acceptance amendments remain
outside V1. A partial unique index also guarantees one ACCEPTED quote per request.

- `POST /agency/requests/:id/quotes` `{lineItems:[{description(1..300),
  quantity(1..10000), unitPriceMinor(0..100000000)}](1..20), terms(1..3000)}`
  → 201 DRAFT of version max+1. One open DRAFT per group
  (`409 STATE_TRANSITION_INVALID` otherwise); terminal requests refuse drafts.
- `PATCH /agency/quotes/:id/draft` `{expectedVersion(rowVersion), lineItems?,
  terms?}` — DRAFT only; content is fully replaceable until send.
- `POST /agency/quotes/:id/send` `{expectedVersion, validForHours(1..2160),
  lineItems?, terms?}` — freezes the snapshot (`validUntil`/`sentAt`
  server-owned; an absolute client timestamp is never accepted), supersedes the
  current effective SENT version, resolves any PENDING revision, writes
  `quote.sent`/`quote.revision_sent` outbox + audit. One effective SENT per
  group is guaranteed by a partial unique index.
- `GET /agency/requests/:id/quotes` — full agency history including drafts
  (`rawStatus`, `rowVersion` for optimistic edits).
- `GET /portal/my/requests/:id/quotes` — verified requester history; drafts are
   never serialized to customers; effective status reflects wall-clock expiry.
   Each quote includes `revisionPending:boolean`, enabling disabled accept/reject/
   revision controls across page reloads while the server retains final authority.
- `POST /portal/my/quotes/:id/accept` `{quoteVersion}` + required
  `Idempotency-Key` (16–128 `[A-Za-z0-9_-]`): only the newest effective SENT,
  unexpired, with no PENDING revision and an open request; explicit version
  consent (`409 VERSION_CONFLICT` on mismatch). Same key replays the stored
  safe summary; different payload for a used key is `409 IDEMPOTENCY_CONFLICT`.
  Repeated acceptance returns the stable already-accepted result; exactly one
  audit row and one `quote.responded` outbox event are emitted (I11).
- `POST /portal/my/quotes/:id/reject` `{quoteVersion}` — same guards minus the
  key; repeated rejection is stable.
- `POST /portal/my/quotes/:id/revision-requests` `{quoteVersion,
  message(10..1000)}` — one PENDING per group; acceptance is blocked with
  `409 QUOTE_REVISION_PENDING` while pending (U11).
- `GET /agency/quotes/:id/revision-requests` — group history.
- `POST /agency/quote-revisions/:id/decline` `{reason(5..500)}` — PENDING →
  DECLINED; the effective offer becomes actionable again only if still valid.
- `POST /agency/quote-revisions/:id/resolve-with-replacement`
  `{validForHours, lineItems, terms}` — one transaction: revision RESOLVED,
  prior SENT SUPERSEDED, replacement version SENT (an open draft is converted,
   otherwise version max+1 is created), `quote.revision_sent` outbox + audit.
   Both this route and generic draft send refuse replacement of a pending
   revision's expired offer, including the exact `validUntil` boundary.

Error codes produced: `QUOTE_EXPIRED`, `QUOTE_SUPERSEDED`,
`QUOTE_REVISION_PENDING`, `STATE_TRANSITION_INVALID`, `VERSION_CONFLICT`,
`IDEMPOTENCY_CONFLICT`, `RESOURCE_NOT_FOUND` (wrong tenant/request/quote),
`UNAUTHENTICATED`, `TENANT_INACTIVE`. Expiry is enforced by wall-clock check on
every read/action path and lazily persisted — it never depends on a queued job
(docs 04 BR-QTE). Quote projections contain only id/version/status/currency/
total/line items/terms/validity/timestamps — no contact, beneficiary or notes.
## Quotes and commercial acceptance

| Method | Path | Purpose |
|---|---|---|
| POST | `/agency/requests/:id/quotes` | Create first draft/version |
| PATCH | `/agency/quotes/:id/draft` | Modify DRAFT only |
| POST | `/agency/quotes/:id/send` | Freeze snapshot, publish version, create outbox |
| GET | `/agency/requests/:id/quotes` | Agency version history incl. drafts (Sprint 3) |
| GET | `/portal/my/requests/:id/quotes` | Verified requester history, no other requests |
| POST | `/portal/my/quotes/:id/accept` | Latest SENT, unexpired, not revision-pending |
| POST | `/portal/my/quotes/:id/reject` | Latest SENT, unexpired |
| POST | `/portal/my/quotes/:id/revision-requests` | Message, one pending per group |
| GET | `/agency/quotes/:id/revision-requests` | Review list |
| POST | `/agency/quote-revisions/:id/decline` | Reason and re-enable previous if valid |
| POST | `/agency/quote-revisions/:id/resolve-with-replacement` | New version sent atomically, old superseded |

Sprint 3 implements every route above; exact DTO shapes, validation bounds,
idempotency and error semantics are documented in the Sprint 3 section of
"Requests and guest access".

### Quote send DTO (illustrative)
```json
{"expectedVersion":1,"validForHours":72,"lineItems":[{"description":"12 home visits","quantity":12,"unitPriceMinor":15000}],"terms":"Scope, exclusions, and confirmation terms"}
```
Total is **calculated server-side** from trusted validated line items; no client-controlled `totalMinor` is accepted, and validity is requested as a bounded relative window so the stored `validUntil` is always a server-owned UTC instant. Quote read returns currency, total, version, effectiveStatus, price terms, expiry; does not contain care notes.

## Patients and customer grants
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/agency/patients` | List/create tenant patients |
| GET/PATCH | `/agency/patients/:id` | View/minimal edit with version |
| POST | `/agency/patients/duplicates/check` | Scoped fuzzy candidates for staff |
| POST | `/agency/requests/:id/link-patient` | Attach approved request to existing verified patient |
| POST | `/agency/requests/:id/create-patient` | Create after duplicate review |
| POST | `/agency/patients/:id/access-grants` | Verified representative grant + scope |
| POST | `/agency/patient-access/:id/revoke` | Revoke grant immediately |
| GET | `/portal/my/patients` | Only granted patients and allowed projected fields |
| POST | `/portal/my/requests/:id/claim` | Link prior request with fresh ownership proof |

## Caregivers, plans and visits
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/agency/caregivers` | Create/list, include invite eligibility |
| GET/PATCH | `/agency/caregivers/:id` | Operational status, profile |
| PUT | `/agency/caregivers/:id/availability` | Weekly slots (revision-controlled) |
| POST | `/agency/caregivers/:id/exceptions` | Leave/hours adjustment -> impact scan |
| POST | `/agency/caregivers/:id/qualifications` | Document + verification workflow |
| GET/POST | `/agency/patients/:patientId/care-plans` | List/create draft |
| POST | `/agency/care-plans/:id/submit-for-clinical-review` | Optional based on service class |
| POST | `/agency/care-plans/:id/approve-clinical` | Qualified scoped capability only |
| POST | `/agency/care-plans/:id/activate` | Generate occurrences idempotently, cap 60 days |
| POST | `/agency/care-plans/:id/revise` | New version, preview affected future visits |
| POST | `/agency/care-plans/:id/pause` | Requires future visit disposition flow |
| GET | `/agency/visits` | Calendar/table with filters |
| GET | `/agency/visits/:id` | Detail with role projection |
| POST | `/agency/visits/:id/candidates` | Qualified, eligible ranked candidates; explain filters safely |
| POST | `/agency/visits/:id/assign` | Lock, recheck, commit -> SCHEDULED |
| POST | `/agency/visits/bulk-assign` | Per-visit results with explicit partial success semantics |
| POST | `/agency/visits/:id/reassign` | Lock, reason, history, notify |
| GET | `/caregiver/my/visits` | Assigned visits only |
| POST | `/caregiver/my/visits/:id/start` | SCHEDULED -> IN_PROGRESS; server now |
| PUT | `/caregiver/my/visits/:id/tasks/:taskId` | DONE or NOT_DONE with reason |
| POST | `/caregiver/my/visits/:id/complete` | Validate tasks, finalize notes, record server end |
| POST | `/agency/visits/:id/review` | Separate completed-visit review |
| POST | `/agency/visits/:id/corrections` | Append-only correction with reason |

## Visit change requests
| Method | Path | Purpose |
|---|---|---|
| POST | `/portal/my/visits/:id/change-requests` | Submit CANCEL/RESCHEDULE; normal/late calculated server-side |
| GET | `/agency/visit-change-requests` | Queue with urgency filters |
| POST | `/agency/visit-change-requests/:id/approve` | Atomic policy/state/conflict validation + mutation |
| POST | `/agency/visit-change-requests/:id/reject` | Reason required; original retained |
| POST | `/portal/my/visit-change-requests/:id/withdraw` | Pending only |

## Notifications, documents, reports
| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications` | Self only, paginated |
| POST | `/notifications/:id/read` | Self only |
| POST | `/documents/upload-intent` | Scoped upload permission, allowed type/size, short TTL |
| POST | `/documents/:id/finalize` | Verify scanned object and metadata; ownership |
| GET | `/documents/:id/download` | Scoped authorization then short TTL signed URL |
| GET | `/agency/reports/visits` | Tenant-scoped counts and timeliness |
| GET | `/agency/reports/requests` | Tenant-scoped request funnel |
| GET | `/agency/reports/caregivers` | Tenant-scoped loads (operational, not clinical judgment) |

## Transaction example — assign
**Request:** `POST /v1/agency/visits/:id/assign`
```json
{"caregiverId":"<uuid>","expectedVisitVersion":4,"reason":"Primary unavailable"}
```
**Success 200:**
```json
{"data":{"visitId":"<uuid>","status":"SCHEDULED","assignedCaregiverId":"<uuid>","version":5,"assignmentHealth":"OK"}}
```
**Conflict 409:** `VISIT_VERSION_CONFLICT`, `SCHEDULE_CONFLICT`, `QUALIFICATION_INVALID`, `CAREGIVER_UNAVAILABLE` or `TENANT_INACTIVE`. Backend never accepts `status` or `tenantId` override.

## Idempotency / delivery
- `POST /portal/requests`, `quote accept`, `activate`, `assign`, `complete`, `approve change` must be replay-safe. Completed repeated `start`/`end` must return a stable already-performed result or 409 per documented action, not duplicate audit/notifications.
- Changes and outbox event inserted in same DB transaction. Worker delivery can retry independently; dedupe by `(eventId,recipient,template)`.

## Error code registry (minimum)
`UNAUTHENTICATED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `VALIDATION_FAILED`, `TENANT_INACTIVE`, `TENANT_SLUG_TAKEN`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_USED`, `RATE_LIMITED`, `STATE_TRANSITION_INVALID`, `QUOTE_EXPIRED`, `QUOTE_SUPERSEDED`, `QUOTE_REVISION_PENDING`, `VISIT_VERSION_CONFLICT`, `SCHEDULE_CONFLICT`, `CAREGIVER_UNAVAILABLE`, `QUALIFICATION_INVALID`, `PATIENT_GRANT_REQUIRED`, `PLAN_DURATION_EXCEEDED`, `RECURRENCE_TIME_INVALID`, `IDEMPOTENCY_CONFLICT`.

## Contract change discipline
Use shared Zod schemas and generated TypeScript types consumed by UI/API/worker. Changes to enums, status meaning or domain DTOs require changes in schema, API tests, UI labels and documentation together. Maintain OpenAPI spec in code after initial implementation.

## Implemented infrastructure endpoints

These endpoints contain no tenant or patient data and perform no domain actions.
Domain endpoints not explicitly marked implemented above remain future-sprint
specifications.

| Process | Method / path | Dependency | HTTP status |
|---|---|---|---|
| Express API | `GET /v1/health/live` | none | 200 |
| Express API | `GET /v1/health/ready` | PostgreSQL query | 200 when up, 503 when down |
| Worker HTTP listener | `GET /health/live` | none | 200 |
| Worker HTTP listener | `GET /health/ready` | Redis PING | 200 when up, 503 when down |
| Next.js web | `GET /health/live` | none | 200 |
| Next.js web | `GET /health/ready` | configured API readiness, 3-second timeout | 200 when ready, otherwise 503 |

Liveness payload: `{"data":{"status":"ok","service":"api|web|worker","time":"<UTC ISO>"}}`.
Readiness payload uses `status="ready"|"not_ready"` and
`components={"db"|"redis"|"api":"UP"|"DOWN"}` for the applicable process.
The API echoes a validated/generated `X-Request-ID`, including on malformed JSON
and 404 responses. Infrastructure readiness failures use the health payload;
domain/API errors retain the standard error envelope.

The owner-approved single-repository structure (ADR-0007) keeps canonical
schemas in `backend/src/contracts`; frontend has no source-code dependency on
the backend.

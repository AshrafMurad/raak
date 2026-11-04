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
- Sprint 7 Session 2 replaces the legacy `/notifications` array with the
  current-principal paginated inbox documented below. Legacy RequestNotification
  rows remain persisted; the inbox reads Notification only.
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

### Implemented Sprint 4 — People and private files

Canonical strict input schemas: `contracts/people.ts`, `caregivers.ts`,
`documents.ts`. Unknown fields, including client tenant/verification/status
overrides, are rejected. Host resolution, live session/CSRF and central policy
precede resource checks; services recheck authority within transactions. Private
responses are no-store. Inaccessible object IDs return 404.

#### Customer onboarding and claims

| Method | Path | Input / result |
|---|---|---|
| POST | `/portal/accounts/register` | `{email,password(10..128),locale?:ar|en}` → generic 202 `{acknowledged:true}`; pending tenant-specific customer + security email capability |
| POST | `/portal/accounts/login` | `{email,password}` → customer-only AuthMe + host-only session/CSRF cookies, even if a staff identity shares the address |
| POST | `/portal/accounts/resend-verification` | `{email,locale?}` → same generic 202; at most four verification issues/account/hour |
| POST | `/portal/accounts/verify-email` | `{token}` → `{ok:true}`; no existing session required |
| POST | `/portal/accounts/claim-link` | Verified customer session + CSRF; `{reference,locale?}` → generic 202; at most four claim issues/customer/hour |
| POST | `/portal/my/requests/:id/claim` | Verified customer + CSRF; `{token}` → `{id}`; fresh customer/request/tenant/email-bound capability required |

Registration/verification/claim-link transport is same-origin guarded and limited
to 20 onboarding POSTs/host/IP/hour/process. Independent same-email accounts
across tenants remain supported. Existing customer addresses receive the same
registration acknowledgment without replacement. Explicit customer sign-in never
selects a staff identity; the existing `/auth/login` staff-first behavior remains
unchanged. Staff invitations/session infrastructure are reused; no public staff
signup. Customer sign-in has its own 10/email/host/IP/15-minute limiter.

Verification capabilities are opaque, hashed, single-use and 15 minutes long.
Wrong host never consumes a capability; expiry is 401 TOKEN_EXPIRED and replay
409 TOKEN_ALREADY_USED. Verification activates only its pending customer and
invalidates outstanding verification proofs for that customer. Claim issuance
requires matching current request email and an unowned request, but matching
email never associates it. Consumption additionally requires the issuing customer
and exact request; a competing owner is never overwritten. Ownership/version,
consumption and audit/outbox commit together under the tenant writer lock.
Previously accepted quotes, guest acceptance actors and agreement snapshots are
unchanged. A claim grants request status/commercial access only; no PatientAccess.

#### Patients, duplicate review and grants

- GET `/agency/patients` and `/portal/my/patients`: `{items,nextCursor}`,
  UUID cursor, 20 per page. Agency lists include id/name/area/status/version;
  customer list/detail contain **id,displayName,status only** and require active
  non-revoked, non-expired VIEW_BASIC. GET `/portal/my/patients/:id` implements
  the same grant-scoped summary. Caregivers cannot use agency patient search.
- Operational profile: `{displayName(2..120),dateOfBirth?:valid YYYY-MM-DD|null,
  contact?:<=254,areaId(1..64),addressRestricted?:<=500,notesRestricted?:<=500}`.
  Future birth dates and unconfigured agency areas are refused. GET
  `/agency/patients/:id` returns this projection plus id/status/version.
- POST `/agency/patients/duplicates/check`: profile body → `{items}` with bounded
  id/name/birth-date/area/version suggestions, never addresses/notes/contact.
  Cues are normalized name/word matches, exact optional date-of-birth or contact;
  advisory and same-tenant only. Over 100 candidates requires narrowing/review.
- POST `/agency/patients`: `{profile,duplicateReviews:[{candidateId,reason(5..300)}]}`.
  Suggestions are recomputed inside the creation transaction. Every current
  candidate must have an explicit ignored-candidate reason; stale/missing/extra
  candidates return 409 STATE_TRANSITION_INVALID. No automatic merge or name
  uniqueness constraint exists. PATCH `/agency/patients/:id` takes
  `{profile,expectedVersion}` and preserves identity/history.
- POST `/agency/requests/:id/create-patient`: same create body plus
  `expectedVersion`; APPROVED only. POST `.../link-patient` takes
  `{patientId,expectedVersion,reason(5..300)}`. Linking requires an ACTIVE
  same-tenant patient and reviewed identity. One immutable request association;
  replay returns the existing result, conflicting target returns 409. Creating
  twice from one approved request returns the first patient without duplicates.
  Neither action issues a grant or creates a visit.
- Owner/Admin only: POST `/agency/customers/lookup` `{email}` → `{id}` for an
  active verified same-tenant customer; this is not a public discovery endpoint.
- POST `/agency/patients/:id/access-grants`: `{customerAccountId,scopes[],
  authorizationType,evidenceDocumentId?,expiresAt?:UTC ISO}`. Scopes are the six
  documented PatientAccess scopes, nonempty/unique. Methods are PATIENT_CONSENT,
  LEGAL_REPRESENTATIVE, AGENCY_VERIFIED_AUTHORITY. Reviewer/time are server-owned.
  Evidence must be CLEAN, unarchived AUTHORIZATION_EVIDENCE on that exact patient.
  Expiry must be future; an existing unrevoked association must be revoked before
  reissue, including when expired. GET the same path lists up to 100 reviewed
  grants with `effectiveStatus` reflecting expiry; no implicit coordinator
  delegation is configured.
- POST `/agency/patient-access/:id/revoke` `{reason(5..300)}` is immediately
  effective, audited and stable on replay. Existing document links are rechecked
  at use time. Grant presence alone is insufficient: the exact scope is checked
  for every implemented operation. No scope enables an unimplemented workflow.

#### Caregiver setup and eligibility foundation

Owner/Admin/Coordinator read/manage operational profiles. Owner/Admin alone
verify qualifications and authorize services; no self-verification is permitted.
Existing staff invitation acceptance continues creating linked caregiver accounts.

| Method | Path | Input / purpose |
|---|---|---|
| GET/POST | `/agency/caregivers` | Paginated list / unlinked operational profile `{name,professionalCategory,operationalStatus:ACTIVE|INACTIVE,serviceAreas[]}` |
| GET/PATCH | `/agency/caregivers/:id` | Profile; PATCH same fields + `expectedVersion` |
| GET | `/caregiver/my/profile` | Current linked caregiver only; no patient content, license numbers or leave reasons |
| POST | `/agency/caregivers/:id/qualifications` | `{code,licenseIssuer,licenseNumberRestricted,validThrough:localDate|null,documentId?}` → PENDING; CLEAN same-parent QUALIFICATION evidence only |
| POST | `/agency/qualifications/:id/verify` | `{expectedVersion,decision:VERIFIED|REJECTED,reason?}`; rejection/withdrawal requires reason; VERIFIED can be withdrawn to REJECTED; no reopening rejected records |
| PUT | `/agency/caregivers/:id/service-authorizations` | `{expectedVersion,serviceIds[]}` replaces explicit same-tenant authorizations and increments profile version |
| PUT | `/agency/caregivers/:id/availability` | `{expectedRevision,slots[]}` replaces weekly intervals and increments separate availability revision |
| POST | `/agency/caregivers/:id/exceptions` | `{expectedRevision,localDate,type:UNAVAILABLE|OVERRIDE_HOURS,startLocal?,endLocal?,reason}` replaces one date's exception, increments revision |
| POST | `/agency/caregivers/:id/eligibility` | `{serviceId,localDate,startLocal,endLocal}` → foundation result only |

Weekly slot: `{weekday:0..6,localStartTime:HH:mm,localEndTime:HH:mm,
effectiveFrom?:localDate|null,effectiveTo?:localDate|null}`. Multiple disjoint
intervals are retained by the model; overlaps across intersecting effective dates
are rejected. Overnight/invalid clock intervals are refused. UNAVAILABLE is
full-day with null start/end; OVERRIDE_HOURS replaces that local date's weekly
coverage with one valid interval. All clock/calendar values use tenant timezone;
templates do not yet convert local times to visit instants (Sprint 5 owns DST
disambiguation). All availability/exception writers lock tenant then caregiver;
stale updates return 409 VERSION_CONFLICT.

Eligibility checks active/verified linked caregiver account, operational state,
explicit service authorization, required independently verified qualifications
valid **through the inclusive requested local date**, shared service-area coverage
and interval coverage after leave/overrides. Response:
`{caregiverId,foundationEligible,reasons[],bookingAvailabilityChecked:false,
appointmentConfirmed:false}`. Reasons: ACCOUNT_INACTIVE, SERVICE_NOT_AUTHORIZED,
QUALIFICATION_INVALID, AREA_NOT_COVERED, OUTSIDE_AVAILABILITY. It is not a ranked
candidate search and does not check visit conflicts, travel buffer, visit-specific
area or booking commitment. Exception/qualification events remain durable for
Sprint 5's impact scanner; no future assignment is silently changed here.

#### Private files

Agency operational managers upload ordinary patient attachments and qualification
documents. Authorization evidence requires Owner/Admin grant authority. Customers
may read only PATIENT_ATTACHMENT under current VIEW_DOCUMENTS; no attachment-write
scope is inferred. Supporting evidence must be attached to the same parent and
have the required classification and CLEAN scan status.

- POST `/documents/upload-intent`: `{parentType:PATIENT|CAREGIVER,parentId,
  classification:PATIENT_ATTACHMENT|AUTHORIZATION_EVIDENCE|QUALIFICATION,
  originalName,mime,sizeBytes}` → 201 metadata plus relative API `uploadUrl`,
  `uploadMethod:PUT`, `expiresInSeconds:300`. Valid filename/extension, PDF/JPEG/PNG
  MIME allowlist, 1..5242880 bytes. Missing private storage returns 503.
- PUT `/documents/:id/upload`: same session/creator + CSRF, exact allowed MIME,
  raw bounded bytes. Metadata size and content signatures/trailers must agree;
  spoofing commits REJECTED and returns 422. Random keys are immutable/create-only.
  Successful staging returns PROCESSING; it is not a successful malware scan.
- POST `/documents/:id/finalize` `{}`: uploader authority rechecked; one scanner
  reservation, external storage read/ClamAV call, reauthorization and atomic scan
  result/audit/outbox. Concurrent scan returns 409; a 120-second abandoned
  reservation quarantines. Missing/error scanner gives QUARANTINED, never CLEAN.
  Terminal state replay returns the current state.
- POST `/documents/list`: `{parentType,parentId,classification}` → up to 100 safe
  metadata rows for an authorized parent. GET `/documents/:id` returns the same
  safe metadata (not filename/key/checksum/creator or content).
- GET `/documents/:id/download`: CLEAN + current resource authority only →
  `{url,expiresInSeconds:60}`. The URL is an opaque, hash-backed API content
  capability bound to the current session (ADR-0011), not a public S3 URL.
- GET `/documents/:id/content?ticket=…`: same live session, exact tenant/document/
  parent/classification/grant and unexpired capability, checked again after private
  storage read. Returns attachment bytes with no-store/no-referrer/no-sniff and
  checksum verification. Revoked or expired grants deny even an earlier-issued
  URL. Already delivered bytes cannot be recalled. Unscanned/rejected/quarantined
  content is never served.

S3/ClamAV adapters are configured in `backend/.env.example`. Before enabling a
configured production adapter, startup writes a non-sensitive probe, requires
anonymous GET to return 403 and deletes only that unique probe. Failure disables
storage; upload intent returns 503. The cached local emulator failed this gate
(anonymous GET 200) and is not accepted as private storage.
Local adapter protocol tests and synthetic doubles are not live infrastructure evidence. All existing
email-provider/domain and production privacy/governance gates remain open.

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

### Implemented Sprint 5 — care plans, recurrence and scheduling

Canonical schemas: `backend/src/contracts/careplans.ts`. Unknown body fields are
rejected. All routes are session + CSRF protected, `no-store`, tenant-resolved
from the trusted host and rechecked at the service boundary.

Care plans (`careplans.read` to read; `careplans.manage` Owner/Admin/Coordinator
to change; `careplans.clinical_approve` additionally requires an agency-verified,
unexpired qualification linked to the approver's caregiver profile for the exact
service — titles never confer clinical authority, ADR-0012):

- `GET /agency/care-plans?status=&patientId=&cursor=` → `{items,nextCursor}`
  with patient/service summaries and planned/scheduled visit counts.
- `GET /agency/patients` / `GET /agency/caregivers` / `GET /agency/services`
  feed the picker selects (existing Sprint 2/4 list routes).
- `POST /agency/patients/:patientId/care-plans` `{agencyServiceId,
  serviceRequestId?, primaryCaregiverId?, validFrom, validUntil, weekdays[],
  localStartTime, durationMin, goalText?, taskTemplates[], dstResolution,
  clinicalInstructionsRestricted?}` → version 1 DRAFT. Recurring services only;
  inclusive local dates; 1–30 task templates. When `serviceRequestId` is
  supplied, the APPROVED request must match the exact tenant, patient and agency
  service before any write. Inaccessible references return 404; same-tenant
  semantic mismatch returns 409 `STATE_TRANSITION_INVALID`.
- `GET /agency/care-plans/:id` → plan detail with full version history.
- `PATCH /agency/care-plans/:id/draft` `{expectedDraftVersion,…content}` —
  only the open current DRAFT version is mutable.
- `POST /agency/care-plans/:id/approve-clinical` `{version}` — exact-version
  approval; stale `version` → 409. Non-clinical services → 409.
- `GET /agency/care-plans/:id/generation-preview?version=` — read-only
  occurrence expansion (local dates + UTC windows), span, occurrence count and
  amendment impact (`wouldCancel` lists only future PLANNED visits).
- `POST /agency/care-plans/:id/activate` `{version}` — requires
  `Idempotency-Key` (16–128 chars); transactionally upserts occurrences by
  `occurrenceKey`, cancels only future unassigned PLANNED visits superseded by
  an amendment, and never touches SCHEDULED+ visits. Span > 60 calendar days,
  DST gap/fold with REJECT, or invalid local times → `PLAN_DURATION_EXCEEDED` /
  `RECURRENCE_TIME_INVALID` (422). Generated visits are PLANNED and unassigned.
- `POST /agency/care-plans/:id/revise` `{…content}` → new DRAFT version.
- `POST /agency/care-plans/:id/pause` `{plannedVisitsAction:KEEP|CANCEL,
  reason?}` (reason required when CANCEL), `/resume`, `/complete` `{reason?}`
  (refuses while future PLANNED/SCHEDULED visits remain), `/cancel`
  `{plannedVisitsAction,reason}`. Confirmed SCHEDULED visits are never silently
  cancelled; a documented disposition is always explicit.

Visits (`visits.read` Owner/Admin/Coordinator; `scheduling.manage` for all
mutations):

- `GET /agency/visits?from=&to=&status=&assignmentHealth=&carePlanId=&patientId=
  caregiverId=&cursor=` → `{items,nextCursor,timezone,bufferMinutes}`. Dates are
  inclusive agency-local calendar dates.
- `GET /agency/visits/:id` → detail with task snapshots, assignment history and
  service-name snapshot; no license numbers or clinical instructions beyond the
  authorized plan projection.
- `POST /agency/visits/:id/candidates` → advisory ranking only:
  `{items:[{caregiverId,name,isPrimary,load,sameArea,serviceAreas}],excluded:[
  {caregiverId,name,reasons[]}],advisory:true,bufferMinutes,…}`. Ranking:
  primary caregiver, then lighter active SCHEDULED load, then same-area, then
  stable ID. Exclusion reasons are the safe codes registered in
  `CANDIDATE_EXCLUSION_REASONS` (no PHI).
- Candidate lookup and new assignment require an ACTIVE parent care plan when
  `carePlanId` is present. DRAFT/PAUSED/COMPLETED/CANCELLED parents return 409
  `STATE_TRANSITION_INVALID` without parent content. Standalone PLANNED visits
  remain assignable.
- `POST /agency/visits/:id/assign` `{caregiverId,expectedVisitVersion,reason?}`
  — requires `Idempotency-Key`. Plan-backed assignment serializes tenant → care
  plan → visit → caregiver; standalone assignment serializes tenant → visit →
  caregiver. It rechecks account/qualification (VERIFIED with independent
  verifier+time, valid at the visit-local date)/authorization/area/availability/
  leave, and rejects any overlap including the tenant travel buffer against the
  caregiver's other SCHEDULED/IN_PROGRESS visits. Commits PLANNED → SCHEDULED,
  appends assignment history and returns `{visitId,status,assignedCaregiverId,version,
  assignmentHealth}`. Conflicts: 409 `SCHEDULE_CONFLICT` /
  `CAREGIVER_UNAVAILABLE` / `VISIT_VERSION_CONFLICT`; replay with the same key
  returns the stored result.
- `POST /agency/visits/bulk-assign` `{assignments[],reason?}` — requires
  `Idempotency-Key`; per-visit explicit outcomes
  `{results:[{visitId,ok,status?,code?,…}],summary:{succeeded,failed}}`; a
  failing row never rolls back committed rows and never reports false success.
  Input order is semantic and duplicate visit IDs are rejected with 422
  `VALIDATION_FAILED` before any reservation or execution. The request hash
  preserves assignment order and includes every visit/caregiver/version tuple
  plus `reason`. Execution is reserved before the first visit; each completed
  successful per-visit outcome is checkpointed in the same transaction as its
  assignment/history/audit/outbox commit, so matching replays
  resume unfinished rows without rerunning completed work and return the
  stable ordered result. An in-progress reservation holds a short execution
  lease refreshed on every checkpoint: a concurrent matching request receives
  409 `IDEMPOTENCY_IN_PROGRESS`, a changed payload returns 409
  `IDEMPOTENCY_CONFLICT`, and a matching request arriving after the lease
  lapses takes over the checkpoint of the interrupted run and resumes it.
  Each reservation/takeover has a fresh execution token; each per-item commit
  and final write locks the reservation and checks that token. A stale live
  runner cannot commit or overwrite newer progress after takeover.
  Checkpoints and stored summaries contain only resource IDs and stable
  operation codes and numeric visit state, never caregiver names, patient or
  clinical content, arbitrary error messages or unfiltered error details.
  Failed outcomes are exactly `{visitId,ok:false,code}`.
- `POST /agency/visits/:id/reassign` `{caregiverId,expectedVisitVersion,reason}`
  — reason mandatory; same transactional eligibility/conflict rechecks,
  append-only history. Existing confirmed visits retained by KEEP may be
  maintained; this is not a new PLANNED-to-SCHEDULED transition. Plan-backed
  reassignment still locks the parent plan before the visit and affected
  caregivers in UUID order.
- Availability/exception, caregiver profile, service-authorization and qualification verification
  writes (Sprint 4 routes) now also run a prospective impact scan and flag
  affected future SCHEDULED visits `NEEDS_REASSIGNMENT` without cancelling
  them; `GET /agency/visits?assignmentHealth=NEEDS_REASSIGNMENT` is the
  reassignment queue. Health flag/heal transitions increment the visit version
  and append audit/outbox events (`visit.reassignment_flagged` /
  `visit.reassignment_resolved`) atomically with the configuration change.

Sprint 6 implements the caregiver, review and customer change routes below.

## Visit change requests
| Method | Path | Purpose |
|---|---|---|
| POST | `/portal/my/visits/:id/change-requests` | Submit CANCEL/RESCHEDULE; normal/late calculated server-side |
| GET | `/agency/visit-change-requests` | Queue with urgency filters |
| POST | `/agency/visit-change-requests/:id/approve` | Atomic policy/state/conflict validation + mutation |
| POST | `/agency/visit-change-requests/:id/reject` | Reason required; original retained |
| POST | `/portal/my/visit-change-requests/:id/withdraw` | Pending only |

### Implemented Sprint 6 — execution, documentation and approved changes

Canonical strict request DTOs: `backend/src/contracts/visits.ts`. Every private
route requires the host-resolved tenant, live session, central policy and current
resource relationship; mutations require CSRF. Responses are `no-store`.
Unknown fields (including tenant, actor, timestamps, urgency and statuses) reject
with 422. Inaccessible objects are 404; role/action denials are 403.

Caregiver (`visits.self_execute`, CAREGIVER audience plus the exact linked active,
verified account/profile and current assignment):

- `GET /caregiver/my/visits?from=&to=&status=&cursor=`: 20-row pages of assigned
  SCHEDULED/IN_PROGRESS/COMPLETED summaries, `timezone,nextCursor`. Inclusive local
  date bounds are converted to a half-open UTC window including the final minute.
  `GET /caregiver/my/visits/:id`: minimum patient name, service/window/timezone,
  status/version, actual server times, task snapshots/outcomes/reasons and the
  caregiver's own note. No patient file, account data or agency-wide notes.
- `POST .../:id/start {}`: SCHEDULED → IN_PROGRESS, assignment health must be OK,
  `actualStartAt` server-owned. Repeating an already-started visit is stable.
- `PUT .../:id/tasks/:taskId`: `{outcome:"DONE"}` or
  `{outcome:"NOT_DONE",reason(3..500)}`; IN_PROGRESS only, exact visit/task linkage.
  `NOT_DONE` with a reason is the canonical NOT_DONE_WITH_REASON representation.
- `PUT .../:id/note {body(1..5000)}`: the author's one editable IN_PROGRESS draft.
- `POST .../:id/complete {}` + required Idempotency-Key: every required task must
  be DONE or NOT_DONE with a reason; optional tasks can remain PENDING. Records
  server `actualEndAt`, COMPLETED, finalized notes and immutable completion JSON
  in one transaction. A required NOT_DONE task flags NEEDS_REVIEW. Repeated
  completion is stable; different payload reuse of an action key is 409.

Agency (`visits.read` for documentation; `visits.review` for Owner/Admin/Coordinator
review/correction):

- `GET /agency/visits/:id/notes`: explicit restricted note projection, review
  status and separate review records (reviewer, restricted note, time). Agency visit
  summaries expose reviewStatus; detail also includes actual
  timestamps and task exceptions. These projections never go to customers.
- `POST /agency/visits/:id/review {expectedVersion,note?(1..1000)}`: COMPLETED
  only; marks separate REVIEWED status and records reviewer/time/restricted review
  note. Original completion and finalized notes remain unchanged.
- `POST /agency/visits/:id/corrections
  {expectedVersion,parentNoteId?:uuid|null,body(1..5000),reason(5..500)}` → 201.
  Appends a finalized addendum; optional parent must be a finalized note of this
  exact visit. Author and reason are audited, content is not dumped into audit.
  Database UPDATE guards also protect original notes, tasks and completion data.

Customer (`visits.customer_change` is an audience gate, never patient authority):

- `GET /portal/my/visits?from=&to=&cursor=` and `GET .../:id` require current
  VIEW_VISITS grants and return patient/service/window/status summaries and only
  this customer's change-request history/pending state. CANCELLED summaries remain
  visible. No caregiver notes, task exceptions, address or completion snapshot.
- `POST /portal/my/visits/:id/change-requests`: `{type:"CANCEL",reason(10..1000)}`
  or `{type:"RESCHEDULE",proposedDate:YYYY-MM-DD,proposedTime:HH:mm,reason}`.
  Requires an explicit active MANAGE_VISITS grant, future SCHEDULED visit and no
  existing PENDING request. Proposed date/time uses the agency IANA timezone;
  DST gaps/folds are rejected (422 RECURRENCE_TIME_INVALID). Server classifies
  NORMAL at/before the cutoff instant and LATE afterwards. Late review disabled
  returns 409 CHANGE_CUTOFF_EXCEEDED; another pending request returns
  409 CHANGE_REQUEST_PENDING. The original appointment is never changed here.
- `POST /portal/my/visit-change-requests/:id/withdraw {}`: own PENDING request
  and current MANAGE_VISITS grant; changes the request only.

Coordinator (`scheduling.manage`):

- Queue GET supports `status,urgency,cursor`, 20 rows per page; the LATE filter is
  the priority-review view. Object/resource projections are tenant-scoped.
- Approve `{}` and reject `{reason(5..500)}` both require Idempotency-Key.
  Replays return a safe stored summary; changed target/action/reason is
  409 IDEMPOTENCY_CONFLICT. Reject/withdraw leave the booking untouched.
- Approval rechecks current verified requester/grant, future SCHEDULED state,
  original window and policy/timezone. Cancellation records CANCELLED and reason;
  rescheduling preserves duration/current caregiver and locks tenant → parent plan
  → visit → caregiver, using existing scheduling hard filters for qualification,
  service/area, availability/leave and exact travel buffer, plus patient overlap.
  Conflicts roll back and keep PENDING plus the original window/caregiver/version.
  Recurrence, occurrence keys and historical care-plan versions are unchanged.

Scheduling policy (`agency.settings.read` Owner/Admin/Coordinator;
`agency.settings.manage` Owner/Admin): GET `/agency/settings` returns
`timezone,travelBufferMin,changeCancelCutoffHours,changeRescheduleCutoffHours,
allowLateReview,settingsVersion`. PATCH takes those policy fields except timezone
plus `expectedVersion` (initially 0). Buffer integer 0–120; cutoffs integer 0–168
hours (recommended 6–48, default 24); late review defaults true. A buffer change
transactionally flags/heals prospective conflicts, never cancels assignments.
Identity, timezone and currency edits are outside this settings slice.

All writes append safe audit/outbox events atomically; review note/body content is
stored in restricted documentation, never outbox payloads. Visit event delivery
remains Sprint 7. See ADR-0013 and `plans/sprint-06-status.md` for evidence/gates.

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

### Sprint 7 Session 4 — operational reports and agency audit views

All paths below are under `/v1`; GET responses are `Cache-Control: no-store`.
Agency reads require an ACTIVE host-resolved tenant, current staff session and
central policy at HTTP and transactional live-principal boundaries. No tenant
input is accepted. Strict DTOs live in `contracts/reports.ts`; unknown parameters,
invalid dates/statuses/cursors or reversed date windows return 422
`VALIDATION_FAILED`. A valid UUID `serviceId` must resolve inside the tenant;
foreign/missing service filters return generic 404 `RESOURCE_NOT_FOUND` (I02).

Reports require `reports.read` (Owner/Admin/Coordinator). Filters: optional
`from,to` inclusive ISO local dates, optional `serviceId`, optional `status`
(RequestStatus for requests; VisitStatus for visits/caregivers). Omitted date
bounds are open. Dates use the current agency timezone: requests are selected
by `submittedAt`; visits/load by `scheduledStartUtc` in a half-open UTC window
from local start-of-from-day through start-of-day-after-to. Every aggregate is
computed over the filtered set, including a selected status. These are current
status distributions, not cumulative historical funnel transitions.

Each report echoes `{timezone,from,to,status,serviceId}` (absent filters null):

- GET `/agency/reports/requests`: `{total,byStatus,byService,byServiceTruncated}`.
  `byStatus` has all six request status codes with integer counts including zeros;
  its sum equals total. `byService` projects `{serviceId,slug,nameAr,nameEn,count}`
  with nullable names, ordered count descending/id ascending, max 100 plus explicit
  truncation flag. Total/status counts always cover the full filtered set even if
  the service breakdown is truncated. Labels use current service config, without
  rewriting request snapshots.
- GET `/agency/reports/visits`: `{total,byStatus,unassigned,timeliness}`.
  `byStatus` has all six visit statuses; sum equals total. `unassigned` counts
  every filtered row with null assignedCaregiverId (not only PLANNED).
  `timeliness:{started,onTime,late,notStarted}`: started has non-null
  actualStartAt; onTime means actualStartAt <= scheduledStartUtc; late means >;
  notStarted = total - started. No grace period or physical-presence inference.
  Optional on-time percentage can be derived as onTime/started only when started
  > 0; no percentage is returned for an empty denominator. Cancelled/missed rows
  with no actual start contribute only to notStarted and their status counts.
- GET `/agency/reports/caregivers`: `{items,truncated}`. Rows only for currently
  assigned caregivers with visits in the filtered set, projected as
  `{caregiverId,name,operationalStatus,scheduledMinutes,byStatus}`. Minutes sum
  scheduledEndUtc - scheduledStartUtc for all filtered assigned visits except
  CANCELLED, rounded to whole minutes once per caregiver; this is planned workload,
  not actual work duration or clinical performance. All six visit status counts
  are retained, including CANCELLED. Rows sort minutes descending/id ascending,
  max 200 plus truncation flag. Current assignment is used, not assignment history.

GET `/agency/audit?limit=20&cursor=` requires `agency.audit.read` (Owner/Admin).
Limit 1–100; opaque cursor is an ISO UTC timestamp plus `~` plus UUID, sorted
`at DESC,id DESC`, with strict timestamp/UUID validation. Result:
`{timezone,items:[{id,at,actorType,actorId,action,subjectType,subjectId,reason}],nextCursor}`.
Actor fields, subjectId and reason may be null; `at` is UTC ISO. The view includes
only this tenant's append-only rows and excludes metadataJson entirely. Reasons
are agency-restricted justification fields, never copies of visit note bodies.
There are no audit update/delete endpoints. A cursor is a page boundary, never an
authorization capability; queries retain the tenant predicate on every page.

Platform GET `/platform/tenants/:tenantId` adds
`reportTotals:{requests:{[status]:count},visits:{[status]:count}}`, all-time counts
for present status groups only (absent status means zero). It adds no row,
patient, service or caregiver projection and grants no agency report access.
Existing `/platform/audit` retains its operator-action projection.

Workspace routes: `/{locale}/workspace/reports` (URL-backed date/service/request
status/visit status filters; visit status also filters caregiver load) and
`/{locale}/workspace/audit` (URL-backed cursor). Both locales use shared UI.
See ADR-0017 and `plans/sprint-07-reports-audit.md`.

### Sprint 7 Session 1 — notification policy and delivery observability

All routes below require the host-resolved ACTIVE tenant, current staff session,
central authorize gate and transactional live-principal checks. Mutations require
CSRF; responses are no-store. Strict DTOs: `contracts/notifications.ts`.

- `GET /agency/notification-policies`: Owner/Admin/Coordinator →
  `{version,policies:[{eventType,channel,enabled,configurable,reminderOffsetMin}]}`.
  Includes every docs 11 matrix cell. Required/fixed cells cannot be changed.
- `PATCH /agency/notification-policies`: Owner/Admin only;
  `{expectedVersion,policies:[{eventType,channel,enabled,reminderOffsetMin?}]}`
  (1–34 unique cells). Only configurable cells accepted; immutable, duplicate,
  unknown fields/codes/channels return 422 VALIDATION_FAILED. Stale version is
  409 VERSION_CONFLICT. Offset is null or integer 1–10080, only on VISIT_REMINDER;
  Session 3 applies this to new reminder generations (see below). Returns `{version}`; writes policy,
  independent version, audit and IDs-only `notifications.policy_updated` event together.
- `GET /agency/notification-deliveries?status=&cursor=&limit=`: Owner/Admin only;
  status PENDING/SENDING/SENT/FAILED/SKIPPED, UUID cursor, limit 1–100 (default 20).
  Returns `{items,nextCursor,blockedEvents,blockedNextCursor}` ordered by descending UUID with only
  `id,eventType,channel,status,attempts,retryAt,lastErrorCode,createdAt`.
  No recipient email, arbitrary provider message, body, secret or event payload.
  `blockedEvents` pages unresolved essential change events as
  `{id,eventType,createdAt,code:"RECIPIENT_RESOLUTION_PENDING"}`. The dispatcher
  retries recipient resolution automatically; restoring verified accounts/grants
  is an existing separately authorized operation, never a delivery bypass.

Session 1 added no inbox or personal-preference transport. Business email rows may be PENDING with
TEMPLATE_NOT_CONFIGURED/EMAIL_NOT_CONFIGURED and zero attempts. These codes are
delivery status metadata, not HTTP error registry additions. See docs 11 and ADR-0014.

### Sprint 7 Session 2 — self inbox and personal preferences

All routes require ACTIVE host-resolved tenant and live staff/customer account
session; `notifications.receive` central audience gate at HTTP and transaction
boundaries. Platform operators/guests denied. Every query includes tenant,
principal type and principal ID; no recipient or tenant inputs. Mutations require
CSRF. Responses are no-store. Strict schemas: `contracts/notifications.ts`.

| Method/path | DTO/result |
| --- | --- |
| GET `/notifications?unreadOnly=true&limit=20&cursor=` | `{items:[{id,eventType,readAt,createdAt}],nextCursor,timezone}`; unreadOnly true/false (default false); limit 1–100; descending createdAt/id; opaque timestamp/UUID cursor; timestamps displayed in the returned agency timezone |
| GET `/notifications/unread-count` | `{count}` for this account's unread Notification rows |
| POST `/notifications/:id/read` | strict `{}` → `{id,readAt}`; first server timestamp persists across concurrent/repeated reads; other recipient/tenant/type returns 404 |
| GET `/notifications/:id/target` | `{path:string|null}`; allowlisted relative locale-free frontend path after current tenant/object read checks, null for stale/unauthorized/missing targets; other recipient's notification is 404 |
| GET `/notifications/preferences` | `{preferences:[{eventType,channel,optedOut,tenantEnabled}]}`; configurable cells only, opt-out defaults false |
| PATCH `/notifications/preferences` | `{preferences:[{eventType,channel,optedOut}]}` (1–34 unique configurable cells) → `{ok:true}`; explicit-cell upserts, audit + IDs-only `notifications.preferences_updated` outbox in same transaction |

Previews are localized client-side from matrix codes; no entity content, payload,
patient identity or free text is returned. Self-owned generic history stays visible
after resource access is revoked; navigation does not. Customer visit target
requires current VIEW_VISITS grant (not request ownership); caregiver target
requires current active profile/assignment and readable visit status. Agency
targets re-evaluate live central read authority. Destination APIs independently
reauthorize. See ADR-0015. Protected/duplicate/unknown preference cells or input
fields return 422; personal opt-in cannot override a disabled tenant channel.
Read commands do not emit business notifications or change domain history.

### Sprint 7 Session 3 — templates and durable reminders

- Self `GET /notifications/preferences` additionally returns `locale:ar|en`.
  PATCH accepts optional `locale:ar|en` alongside the existing required preference
  batch, scoped to the current verified account, with existing CSRF/live-session
  and central authorization checks. Omission preserves language. New customers
  inherit their registration locale; existing accounts/staff default Arabic.
  This additive transport does not add a language-selection screen.
- Existing policy `VISIT_REMINDER.reminderOffsetMin=null` means two defaults:
  1440 and 120 minutes, independently per channel. A non-null offset replaces
  those defaults for that channel. Disabled cells generate no new reminders.
  Assignment/reassignment and approved reschedule/cancel replace pending reminder
  generations atomically. Only strictly future deadlines are created; no catch-up
  reminder for an offset already reached when booked. Policy timing changes affect
  new generations; current disable/personal opt-out is rechecked before delivery.
- New `visit.confirmed`, `visit.notification_changed` and `visit.reminder` outbox
  kinds contain IDs only. Reminder aggregate IDs identify immutable generation
  snapshots. Their outbox `createdAt` is the not-before deadline; worker and direct
  dispatcher both enforce it. Visit reminder revision, scheduled window, SCHEDULED
  state and future start must still match at dispatch and send. No PLANNED visit
  is confirmed or reminded by generation alone.
- Explicit requester mappings now include `request.info_needed`, `quote.sent` and
  `quote.revision_sent`. Superseded/expired offers and resolved information requests
  suppress obsolete delivery. Linked verified active customers receive account
  notices. Unclaimed request-only guests need a consumed email proof whose hash
  matches the current requester address; they get EMAIL only, never PatientAccess
  or an inbox. Guest CTA `/track?request=<id>` requires request-specific current
  verification on entry; an existing guest session for another request cannot
  silently select that other request.
- Renderer uses safe code-only localized copy, public agency branding and an
  allowlisted tenant-origin authenticated destination. No patient identity,
  service/clinical detail, address, appointment timestamp or negotiation text is
  interpolated. Provider retries retain the stable delivery-ID dedupe key.
- Admin `blockedEvents` also includes unresolved requester/confirmation/reassignment
  kinds above. Existing safe delivery status/attempt/error projections are unchanged.
  Missing provider leaves work pending; identity/security capability-mail ownership
  is unchanged, even though the template catalog covers all docs 11 codes.

See ADR-0016. No new public scheduling or patient-authority endpoint is introduced.

## Transaction example — assign (request/response)
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
`UNAUTHENTICATED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `VALIDATION_FAILED`, `TENANT_INACTIVE`, `TENANT_SLUG_TAKEN`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_USED`, `RATE_LIMITED`, `STATE_TRANSITION_INVALID`, `QUOTE_EXPIRED`, `QUOTE_SUPERSEDED`, `QUOTE_REVISION_PENDING`, `VISIT_VERSION_CONFLICT`, `SCHEDULE_CONFLICT`, `CAREGIVER_UNAVAILABLE`, `QUALIFICATION_INVALID`, `PATIENT_GRANT_REQUIRED`, `PLAN_DURATION_EXCEEDED`, `RECURRENCE_TIME_INVALID`, `IDEMPOTENCY_CONFLICT`, `IDEMPOTENCY_IN_PROGRESS`.

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

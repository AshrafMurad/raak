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

## Quotes and commercial acceptance
| Method | Path | Purpose |
|---|---|---|
| POST | `/agency/requests/:id/quotes` | Create first draft/version |
| PATCH | `/agency/quotes/:id/draft` | Modify DRAFT only |
| POST | `/agency/quotes/:id/send` | Freeze snapshot, publish version, create outbox |
| GET | `/portal/my/requests/:id/quotes` | Verified requester history, no other requests |
| POST | `/portal/my/quotes/:id/accept` | Latest SENT, unexpired, not revision-pending |
| POST | `/portal/my/quotes/:id/reject` | Latest SENT, unexpired |
| POST | `/portal/my/quotes/:id/revision-requests` | Message, one pending per group |
| GET | `/agency/quotes/:id/revision-requests` | Review list |
| POST | `/agency/quote-revisions/:id/decline` | Reason and re-enable previous if valid |
| POST | `/agency/quote-revisions/:id/resolve-with-replacement` | New version sent atomically, old superseded |

### Quote send DTO (illustrative)
```json
{"expectedVersion":1,"validUntil":"2026-11-30T20:59:59Z","lineItems":[{"serviceId":"<uuid>","description":"12 home visits","quantity":12,"unitPriceMinor":15000}],"terms":"Scope, exclusions, and confirmation terms"}
```
Total is **calculated server-side** from trusted validated line items; no client-controlled `totalMinor` accepted. Quote read returns currency, total, version, effectiveStatus, price terms, expiry; does not contain care notes.

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

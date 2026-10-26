# 04 — Business Rules and Domain State Machines

## Global invariants
- Every agency-owned record carries `tenantId`; its foreign keys must resolve to the SAME tenant. `tenantId` from client JSON never determines authority.
- Tenant state ACTIVE required for normal operations; suspension denies workspace/portal private actions while preserving audit and data.
- Only qualified agency personnel determine clinical care instructions; app coordinates, never diagnoses or recommends treatment.
- All domain transitions happen server-side after **authorization + validation + transactional invariants + audit/outbox write**.
- Key business changes are idempotent by actor/action key and audit timestamp. No destructive changes to published quotes, completed visit documentation, or approved historic care-plan versions.
- Monetary values integer minor units (e.g. halalas/cents) + ISO 4217 tenant currency; never floating point for money.
- UTC instants persist; user's relevant IANA timezone used to build local calendar recurrences and display dates.

## BR-REQ: ServiceRequest
States: `SUBMITTED -> UNDER_REVIEW -> AWAITING_CUSTOMER -> UNDER_REVIEW -> APPROVED`; also terminal `REJECTED`, `WITHDRAWN`.
- `SUBMITTED` only from an active tenant's published service, with contact email and visitor consent text/version.
- Tenant staff may move SUBMITTED to UNDER_REVIEW; AWAITING_CUSTOMER includes minimum information request, not sensitive details in email.
- APPROVED requires operational feasibility assessment, accepted final quote when applicable or recorded acceptance snapshot for fixed pricing, and an authorized coordinator decision. It does not auto-create a visit or patient.
- REJECTED/withdrawn are terminal in MVP; start a fresh request if needed. No silent resurrection.

## BR-PRC: ServicePricing
`FIXED`, `STARTING_FROM`, `CUSTOM_QUOTE` per agency service. One currency per agency in MVP. `FIXED` amount per `VISIT`, `HOUR`, or `SESSION`; price unit must be explicit and shown before acknowledgment. Starting price is not a final quote.
- FIXED: customer acknowledgment snapshot at request submission; agency's final commitment must match acknowledged scope/price or issue formal revised quote.
- STARTING_FROM/CUSTOM_QUOTE: an accepted quote is required for commercial agreement before APPROVED request.
- Published price change creates new effective config; never rewrite accepted commercial records.
- Tax/payment/refund not computed in MVP. UI must not imply an electronic charge occurred.

## BR-QTE: Quote and revisions
Quote states: `DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED, SUPERSEDED`.
- All quote versions for a request share `quoteGroupId`, have strictly increasing integer `version`, and immutable frozen price, terms, validity on SENT.
- At most one effective SENT offer per quoteGroup. Only the newest effective SENT version may be accepted/rejected/revision requested.
- Sent quote can EXPIRE by time check regardless of queued expiry job running; cannot be accepted after expiry.
- Revision request has states `PENDING, RESOLVED, DECLINED, WITHDRAWN`; at most one PENDING per quoteGroup. While PENDING, acceptance of current quote is disabled.
- On replacement SENT transaction: ensure current SENT still valid, supersede old, issue v+1, resolve revision, emit notifications and audit.
- Customer acceptance requires fresh verified and authorized session or single-use verified quote action, explicit consent to this exact version, one effective accepted quote. Agency review/plan scheduling still required.
- Once ACCEPTED, no further revision through quote revision flow; change service scope with a new commercial process (post-accept amendment deferred in V1; coordinator can cancel/restart request with audit before visits begin).

## BR-PAT: Patient and delegation
- Patient belongs to one tenant. Patient can have many requests, care plans, visits.
- Owner of customer account is NOT automatically patient or legal representative.
- `PatientAccess` permission assignment requires a recorded authorization method, reviewer, date, scopes, and revocation mechanism.
- Customers see patient records only through ACTIVE grants and minimum read scopes. Request ownership permits status/quote access only; does not grant entire patient file.
- Duplicate check within tenant only; similarity is advisory, manual merge outside MVP; no cross-tenant search.

## BR-PLAN: CarePlan
States: `DRAFT, ACTIVE, PAUSED, COMPLETED, CANCELLED`.
- Draft can be edited; clinical content must be approved by qualified reviewer for exact immutable version before activation.
- Versioned plan: fields affecting recurring schedule/tasks are snapshotted at activation; amendments create new version and impact preview.
- ACTIVE generates all occurrences up front, date range inclusive, **maximum 60 consecutive calendar days** (not 60 visits), with stable `occurrenceKey` and uniqueness.
- Generated visits state PLANNED; zero or more may be assigned in manual/bulk flows. Never auto-confirm based solely on generation.
- PAUSE: prevent generation/assignment, preview and resolve future visits; do not silently cancel confirmed visits.
- COMPLETED when plan ended/closed and no unaddressed future occurrences by agency policy; CANCELLED with reason and explicit treatment of future visits. Past executed visits retained.
- Single standalone visits may be created without a care plan if authorized and service permits it.
- Primary caregiver is a **preference**, not permission to bypass qualifications/availability.

## BR-SCH: Schedule and caregiver recommendation
Hard filters for caregiver matching:
1. `tenantId` same as visit and `operationalStatus=ACTIVE`, account active/verified for assignment execution; verified applicable qualifications/licensure not expired at visit date.
2. Caregiver authorized for agency service, and covers area (coverage determined by agency configuration).
3. Visit time wholly inside one or more valid weekly availability periods after applying dated exceptions/leave.
4. No overlap with confirmed assigned visits, including fixed buffer (tenant `travelBufferMinutes` default 30, configurable proposed 0..120).
5. Appointment time and service duration valid; no existing conflicting assignment or leave event.

Soft ranking of eligible candidates: primary caregiver priority; then lighter visit load; then same area; stable tie-break by caregiver ID. Explicit numeric weights must be documented/tested before release; never call it AI prediction.

**Conflict math:** For candidate `[start,end)` and existing occupied `[otherStart,otherEnd)`, incompatible if `start < otherEnd + buffer` AND `end + buffer > otherStart`. Adjacent visits at exactly buffer distance are allowed. Buffer applies before and after candidate; do not add phantom buffer to day boundaries. The buffer is conservative estimate, not guaranteed transit time.

**Concurrency:** All assignment/reschedule/leave writers must use same caregiver-scoped transaction serialization (e.g. row lock plus overlap query and retry/error) or serializable transactions with retry. A read-only UI check is advisory; decision revalidated at commit. See `08_ARCHITECTURE.md`.

Travel buffer config updates audit setting and scan upcoming assignments; flag conflicts, do not rewrite or cancel existing appointments silently.

## BR-VST: Visit and assignment
Visit states: `PLANNED` (unassigned), `SCHEDULED` (assigned and confirmed), `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `MISSED`.
- `PLANNED -> SCHEDULED` only after successful qualified caregiver assignment.
- `SCHEDULED -> IN_PROGRESS` by assigned caregiver via explicit Start action; actualStartAt server-generated. A coordinator override is a separate audited correction pathway (not ordinary action).
- `IN_PROGRESS -> COMPLETED` by assigned caregiver via explicit End action, `actualEndAt` from server, all required tasks classified DONE or NOT_DONE_WITH_REASON. Notes may be draft until completion; commit final notes snapshot.
- `SCHEDULED -> CANCELLED` via authorized cancellation, with reason; `SCHEDULED -> MISSED` via coordinator reviewed outcome when visit did not take place. Automatic threshold may flag an alert but does not silently mark MISSED.
- No ordinary transition out of COMPLETED. Correction = appendendum with original content preserved, author and reason audited.
- Separate `reviewStatus = NOT_REQUIRED | NEEDS_REVIEW | REVIEWED`; COMPLETED may be NEEDS_REVIEW.
- Separate `assignmentHealth = OK | NEEDS_REASSIGNMENT`. If leave or settings invalidate assignment, flag but do not automatically change caregiver without coordinator confirmation.
- `actualDuration` derived as `end-start`, never manually authoritative; it represents button times, **not GPS-verified physical presence**.

## BR-CHG: VisitChangeRequest
`type=CANCEL|RESCHEDULE`; states `PENDING, APPROVED, REJECTED, WITHDRAWN` and `urgency=NORMAL|LATE`.
- Customer must have `MANAGE_VISITS` grant for patient/visit, or verified ownership explicitly authorized for that visit; patient privacy unchanged.
- One PENDING request per visit. SCHEDULED and future only; started/completed visits use exception process.
- Tenant may set separate cancel/reschedule cutoffs (recommended 6–48 hours), `allowLateReview=true` by default. LATE requests enter priority review; all requests require coordinator approval.
- The original scheduled time/caregiver remains unchanged while PENDING.
- On APPROVED cancellation, mark CANCELLED with reason; on reschedule acquire locks, verify qualifications, availability, buffer and patient conflicts. If fails, keep PENDING and return actionable conflict error.
- For recurring care plan, customer change applies to one visit occurrence only, not RRULE or all later visits.
- Notify customer and caregiver after successful transaction via outbox.

## BR-NOT: Notifications
- In-app and email channels in V1; protected essential transactional notifications (quote delivery, confirmed/cancelled/changed appointment) are not disabled by tenant policy.
- Optional events and reminder timing tenant-configurable. Personal opt-outs govern optional notices only.
- No clinical details in external email subject/body; use authenticated links with short lifespan; store minimal content/metadata.

## BR-AUD: Auditing
Audit tenant creation/state, invites, role/grant modifications, quotes and versions, patient links, plans approval/revisions, schedule/assign/reassign, check-in/out, corrections, changes, documents, and notification config changes. Preserve actorType/id, tenantId, entity type/id, old/new non-sensitive fields or secure reference, UTC time, reason, correlationId. **Do not** indiscriminately dump notes or patient details into audit JSON.

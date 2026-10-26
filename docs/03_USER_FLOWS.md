# 03 — User Flows and Page-to-Action Journeys

## Surface and route map (logical, illustrative)
- Public SaaS: `www.<RAAK_BASE_DOMAIN>/` and `/register-agency`.
- Platform admin: `admin.<RAAK_BASE_DOMAIN>/tenants` (separate staff auth audience).
- Agency website/customer portal: `<tenantSlug>.<RAAK_BASE_DOMAIN>/` and `/services/:slug`, `/request`, `/track`, `/account/*`.
- Agency admin/caregiver workspace: `app.<RAAK_BASE_DOMAIN>/w/:tenantSlug/*` — route tenant slug must match authorized tenant identity. Can consolidate to subdomain later; API tenancy rules remain unchanged.
- API: `api.<RAAK_BASE_DOMAIN>/v1/*`; browser sends origin and server resolves tenant via trusted host / verified workspace route. Do not trust user-supplied `tenantId`.

## F01 — New agency onboarding
1. Owner fills agency name, owner email, intended slug, agency timezone, currency; verifies email.
2. API checks normalized slug collision/reserved words; creates tenant PENDING_APPROVAL and agency owner account, no patient records.
3. Platform operator reviews agency metadata (no clinical data), activates tenant.
4. Owner sets logo/brand metadata, service areas, publishes catalog templates, configures cutoff/travel buffer, invites staff.
5. Only ACTIVE tenant can accept customer service requests. Reject submission when pending/suspended with generic availability notice.
**Failures:** Duplicate slug -> `TENANT_SLUG_TAKEN`; expired verification -> reissue; suspended -> private sessions rejected and customer request unavailable.

## F02 — Guest sends service request
1. Visitor lands on published agency portal, picks published available service.
2. Form asks requester's name, email, phone optional, relationship to beneficiary, patient name or minimal distinguishing details, city/area, preferred appointment window, minimal notes and required privacy notice acceptance.
3. Anti-abuse rate limit, bot defense, strict request validation and spam check.
4. Guest receives generic confirmation and short opaque tracking code (NOT authorization); verification email with single-use time-limited action link.
5. On verified email link guest sees only request status and documents they are entitled to; no exposed sensitive patient details until separately authorized.
6. Coordinator receives in-app notification for new request.
**Edge cases:** email wrong -> verified edit flow via coordinator; duplicate submissions -> idempotency window/dedupe hint; unpublished service -> no submission; anonymous access cannot enumerate codes.

## F03 — Request review and quote
1. Coordinator filters queue NEW/UNDER_REVIEW; opens scoped request.
2. Requests missing nonclinical info -> `AWAITING_CUSTOMER`; customer submits secure reply -> `UNDER_REVIEW`.
3. Pricing is FIXED: snapshot visible price and explicit requester acknowledgment on form; if service scope differs, coordinator issues formal quote; absent price agreement no final approval.
4. Pricing is STARTING_FROM/CUSTOM_QUOTE: coordinator creates quote with immutable line items, quantity, currency, terms and expiry -> sends.
5. Verified customer opens quote, accepts/rejects/requests revision; versioned response audited.
6. Coordinator only approves service request after commercial acceptance (or approved zero-charge service) and operational assessment. Approval **does not auto-generate a patient** or confirm a preferred appointment.
7. Coordinator links to existing patient or creates new after review, then creates care plan or standalone visit.
**Edge cases:** accept after expiration/superseded -> 409; duplicate acceptance -> same result; tenant suspended -> no action; price updates do not alter past acceptances.

## F04 — Quote revision
1. Customer with verified access requests revision while sent/valid and not already accepted/rejected.
2. Quote accept is temporarily unavailable while revision request PENDING; existing version remains readable.
3. Coordinator approves request by preparing replacement quote vN+1; original becomes SUPERSEDED *atomically on send*, pending revision becomes RESOLVED.
4. Coordinator can decline revision, recording reason; original offer can be made accept-able again only if valid, and customer informed. No silent term changes.
5. Customer sees version history and acts only on currently effective offer.

## F05 — Customer creates account and manages family
1. Customer registers in agency portal, verifies email and signs in under that tenant only.
2. Customer requests association of previously submitted guest requests through fresh ownership verification; API shows only eligible matching requests, no automatic linking by email alone.
3. Coordinator or controlled delegation flow validates family relationship/authorization before issuing `PatientAccess` for each patient and scope.
4. Customer can view/request scheduling on granted patients within scope and never accesses unrelated patients.
5. Revocation instantly takes effect for subsequent requests; event recorded. Shared email/phone does not imply a grant.

## F06 — Patient from request or manually
1. Coordinator chooses `Create patient` from approved request, or `Add patient` manually.
2. Checks tenant-local probable duplicates using normalized name, date of birth, optional contact cues; suggestions visible only to appropriately authorized staff.
3. Coordinator selects existing patient or confirms new patient, records reason if potential duplicate ignored.
4. Links patient to request; attaches authorized customer access as separate grant; records audit.
5. Minimal attachments uploaded through private storage flow and scanned before available.

## F07 — Care plan and generation
1. Coordinator creates DRAFT care plan for patient, service, start/end inclusive, selected weekdays, start local clock, duration, tasks and clinical instruction fields.
2. For clinical instructions, authorized qualified reviewer approves the exact plan version (not simply manager role).
3. On ACTIVATE server validates period <= 60 days, compatible active service, nonoverlapping recurrence semantics, and plan approval; increments generation version.
4. System computes each local calendar date, creates one PLANNED visit per occurrence with snapshot of effective plan tasks/instructions.
5. Shows all generated visits in review table; suggestions prefer primary caregiver, then qualified substitutes. No automatic assignment/confirmation.
6. Coordinator assigns individual or bulk; backend performs fresh checks for every assignment. Bulk operation returns per-visit outcome (or atomic mode if explicitly requested).
**Edge cases:** double activation idempotent; DST nonexistent time rejected with message; change to an activated plan creates new version, previews differences, and alters only future unstarted visits after approval.

## F08 — Daily caregiver execution
1. Caregiver signs in via agency invitation/account, lands on **My Visits** with minimal authorized details.
2. Opens assigned SCHEDULED visit; if appointment not eligible/tenant inactive, Start disabled.
3. Starts visit; server records `actualStartAt` and `IN_PROGRESS`, audit and optional notifications.
4. Checks tasks as DONE/NOT_DONE with required reason for NOT_DONE; saves notes as draft.
5. Completes; server validates all required task outcomes and recorded notes policy, saves server `actualEndAt`, marks COMPLETED immediately. `reviewStatus` may be NEEDS_REVIEW.
6. Coordinator can add separate review/correction with audit, but not silently overwrite original completion.
**Exception:** unexpected inability to finish goes to operational exception report; if visit interrupted, admin correction route must audit justification.

## F09 — Reschedule/cancel request
1. Verified customer with `MANAGE_VISITS` grant requests change for SCHEDULED future visit, optional new date/time and reason.
2. Policy engine evaluates tenant-specific cutoff: NORMAL vs LATE; if too late, special-review pathway allowed according to agency policy; never auto-changes original visit.
3. Coordinator may decline or approve. Approval locks appointment resources, rechecks availability and current visit state; if conflicts, return actionable error without mutation.
4. On approval, update visit (reschedule) or CANCELLED; preserve old/new timestamps and records; notify customer and caregiver.
5. Only single-occurrence change through customer portal; plan-wide recurrence changes are an authorized agency operation.

## F10 — Leave and reassignment
1. Admin schedules caregiver absence/adjusted hours; backend detects future SCHEDULED visits overlapping exception.
2. Mark `assignmentHealth=NEEDS_REASSIGNMENT` and enqueue coordinator notification; retain original assignment/history until reassigned, never claim assignment is feasible.
3. Coordinator evaluates substitutes with matching engine, commits reassignment under lock, notifies affected people.
4. Already COMPLETED visits unaffected.

## F11 — Platform operator
1. Operator signs in to separate control plane.
2. Sees tenant metadata: name, status, slug, created date, owner contact, numeric counts, recent operational health metrics.
3. Activates/suspends tenant with reason; suspended sessions and job handling follow policy; full action audit.
4. No browsing of individual patient content, attachments, visit notes or family data through default super-admin UI.

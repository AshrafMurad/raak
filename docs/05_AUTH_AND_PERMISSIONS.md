# 05 — Accounts, RBAC and Resource-Scoped Authorization

## Identity boundaries
- Three principal audiences: PLATFORM_OPERATOR, AGENCY_STAFF, AGENCY_CUSTOMER. Patients do **not** need an account.
- Platform operator credentials live in platform identity realm; no tenant customer sign-in from that realm.
- Staff account and customer account each belong to exactly one `tenantId`. Duplicate email across tenants is allowed but never a shared sign-in; tenant is resolved before authentication.
- Caregiver membership is single-tenant in V1; the same human independently employed elsewhere does not create linked permissions or globally coordinated scheduling.
- Each session stores immutable principal id, principal type, tenantId, issuedAt, expiry, sessionVersion. Authenticated API still checks active tenant/account and database authorization at request time.

## Roles
- **PlatformOperator**: agency metadata, status, aggregate counts, operator audit. No default patient PHI access.
- **AgencyOwner**: tenant settings, users/invites, services and reporting; does not automatically receive licensed-clinical approval capability.
- **AgencyAdmin**: staff invites, operational settings, service publication, patient/caregiver management subject to policy.
- **CareCoordinator**: requests, quotes, patient operational records, care plans admin drafting, scheduling/reassignment, flags and reports.
- **Caregiver**: assigned visits only; own profile/availability view; start/end and documentation; no all-patient search.
- **Customer**: own request/quote actions, authorized patient-related actions via grants. No agency admin data.
- **ClinicalApprovalCapability**: additional scoped permission attached to verified and approved qualified staff, not granted by title/role alone.

## Permission matrix (✓=allowed within scope; * = only with extra qualification/delegation)
| Action | Platform | Owner | Admin | Coordinator | Caregiver | Customer |
|---|---|---|---|---|---|---|
| Activate/suspend agencies | ✓ | — | — | — | — | — |
| Agency settings | — | ✓ | ✓ | limited | — | — |
| Staff invites/roles | — | ✓ | ✓ | — | — | — |
| Service catalog publish | — | ✓ | ✓ | limited draft | — | — |
| View agency patients | — | ✓ | ✓ | ✓ | assigned minimum only | granted minimum only |
| Create/link patient | — | ✓ | ✓ | ✓ | — | — |
| Manage patient grants | — | ✓ | ✓ | controlled | — | request only |
| Submit service requests | — | as customer | as customer | as customer | as customer | ✓ / guest |
| Review requests/quotes | — | ✓ | ✓ | ✓ | — | own only |
| Quote customer acceptance | — | — | — | — | — | verified own |
| Draft care plan | — | ✓ | ✓ | ✓ | — | — |
| Approve clinical instructions | — | * | * | * | * | — |
| Schedule/assign/reassign visits | — | ✓ | ✓ | ✓ | — | request change only |
| Start/end assigned visit | — | — | — | — | own assigned | — |
| Review completed visit | — | ✓ | ✓ | ✓ | self read only | permitted summary |
| Read tenant operational analytics | totals only | ✓ | ✓ | ✓ | own limited | — |
| Upload sensitive attachment | — | approved access | approved access | approved access | task-limited | authorized patient/request only |

## Enforcement rules
1. `authorize(principal, action, resource)` denies by default. Never use role alone; verify matching tenant and object relationship.
2. Resolve tenant from trusted host/workspace binding on server; validate slug -> tenant id; no arbitrary `X-Tenant-ID` client trust.
3. Where route includes id, DB lookup must include scoped tenant constraint; `404` for nonexistent OR inaccessible resource to prevent enumeration.
4. Prevent mass assignment: customer cannot set `tenantId`, `role`, `verified`, `clinicalApproved`, prices, assignment or request status from request body.
5. Only backend workflow methods perform state transitions. API middleware guards authenticate and authorizes; domain service performs resource-level grant checks again.
6. Caregiver visit read permits only assigned visit current/history and minimum beneficiary details necessary to perform task; may not list all patients or view agency attachments indiscriminately.
7. File download authorizes resource AND parent patient/request AND grant scope; short-lived signed link only.
8. Frontend hide/show controls are advisory, not security boundaries.

## Customer to patient access grants
`PatientAccess` fields: `tenantId`, `customerAccountId`, `patientId`, `scope[]`, `authorizationType`, `evidenceDocumentId?`, `verifiedByStaffId?`, `verifiedAt`, `expiresAt?`, `revokedAt?`, `status`.
Available scopes: `VIEW_BASIC`, `SUBMIT_REQUEST`, `VIEW_VISITS`, `MANAGE_VISITS`, `VIEW_CARE_PLAN_SUMMARY`, `VIEW_DOCUMENTS` (higher sensitivity separately granted).
- A verified guest request grants *request status and commercial offer access for that request*, not general patient rights.
- Agency-authorized representative can control visits only under a positive active `MANAGE_VISITS` grant.
- If patient can consent, capture proper authorization via agency procedure; for minors/incapacity, agency policy and applicable rules decide valid guardian. App does not infer rights from surname, matching address, phone or claimed relationship.
- Revoke grant -> immediate authorization denial, invalidate sensitive download links as feasible, audit and notify as appropriate.

## Registration and invitation
- Agency owner signup verifies email; platform activates tenant manually.
- Agency staff cannot public-register; admin creates caregiver/staff operational profile, `Invitation` with hash(token), expiry (suggest 48h), max usage 1, recipient email, tenant and intended role. Recipient sets credentials/accepts invite; do not give care assignments before account and qualification checks pass.
- Customer registration verifies email, optional linkage to guest requests via separate re-authenticated claim flow.
- Guest tracker: rate-limited email OTP/magic link (short TTL e.g. 15 min), opaque random token stored only hashed, one-use, scope limited to one request/quote; no bare tracking code as access token.
- Session: opaque secure `HttpOnly`, `Secure`, `SameSite=Lax` or stricter cookies; CSRF protection for state-changing cookie-authenticated endpoints, rotation on login/role changes, logout/all sessions revoke. Prevent tenant cookie leakage across subdomains (host-only cookies per auth app; if centralized, enforce tenant audience on session).
- MFA desirable for staff/platform operator before production with live data; make it a production-readiness gate, not a falsely claimed MVP feature.

## Example policy pseudocode
```ts
async function canViewVisit(ctx: AuthContext, visitId: string) {
  const visit = await db.visit.findFirst({
    where: { id: visitId, tenantId: ctx.tenantId },
    select: { id: true, patientId: true, assignedCaregiverId: true }
  });
  if (!visit) return false;
  if (ctx.kind === 'staff' && ctx.role === 'CAREGIVER')
    return visit.assignedCaregiverId === ctx.caregiverId;
  if (ctx.kind === 'staff' && has(ctx, 'visits.read_all')) return true;
  if (ctx.kind === 'customer')
    return await hasPatientGrant(ctx, visit.patientId, 'VIEW_VISITS');
  return false;
}
```
Implement `hasPatientGrant` with tenant-scoped, non-revoked, non-expired grants and data minimization. Deny if no explicit rule matches.

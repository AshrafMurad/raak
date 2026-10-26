# 02 — MVP Scope and Acceptance Contract

## MVP must include
| Epic | MVP capabilities | Acceptance criteria (high-level) |
|---|---|---|
| Tenant onboarding | Agency registration, pending approval, activation/suspension, basic identity and settings | Suspended tenant cannot use private APIs; public portal displays non-sensitive availability message; operator sees status |
| Branding and service catalog | Logo, main color option constrained by design, description, service areas, template import, custom service, publish/unpublish | Agencies cannot modify template originals or other tenant's catalog; hiding a service does not erase historical requests |
| Authentication | Scoped staff/customer accounts; verified email; invitations; guest request verification and opt-in account linking | Every private action authorizes tenant + actor + resource; invite token expires and is single-use |
| Customers and patients | Customer profile, multiple authorized patients, patient create/manual or from approved request, duplicate suggestions, limited files | No cross-tenant lookup; duplicate matching never auto-merges; ungranted patient remains invisible to customer |
| Service requests | Guest request creation, review/need-info/approval/rejection, status timeline | Request can exist without an account; no automatic patient record creation; preferred time not confirmed |
| Pricing and quotes | Fixed/starting/custom, one currency/tenant; versioned quote, accept/reject, revision requests; agreement snapshot | Cannot accept expired/superseded/suspended offers; fixed price acceptance snapshot retained; no payment UI |
| Care plans | Draft, clinical approval when required, activate, pause, complete/cancel, version and task templates | Activation generates scheduled *proposals* for bounded recurrence once; immutable historical snapshots |
| Scheduling and assignment | Weekly hours, exceptions, agency travel buffer, suggestions, primary preference, manual assignment, bulk assignment validation, conflict handling | Two concurrent attempts cannot assign overlap; only verified/eligible caregivers; unassigned != confirmed |
| Visit execution | Scheduled/in-progress/completed, check-in/out server times, checklist outcomes, notes, review flag | Completion allowed for assigned authenticated caregiver; no silent post-completion overwrite |
| Customer change requests | Cancellation/reschedule require agency approval; configurable cutoffs and late case workflow | Original time stays confirmed until authorized approval; approver rechecks conflicts |
| Notifications | In-app/email, protected essential events, agency choices for optional events; job retry | No PHI in email text; guest has verified channel; delivery failures are observable |
| Reporting | Requests, visit statuses, timeliness, caregiver load; time/status/service filters | Always tenant-scoped; counts match source records and explicitly defined filters |
| Platform operations | Basic tenant list/status/admins/usage counts | Platform operator does not receive raw patient records in standard workflows |
| Accessibility/l10n | Arabic RTL default, English LTR, keyboard-accessible controls, responsive caregiver portal | Correct calendar date/time in tenant zone and mobile layout usable |

## Explicitly not in V1
- Native iOS/Android; live location tracking; routing maps; AI clinical or scheduling recommendations; marketplace/provider discovery.
- Electronic medical records, prescriptions, diagnostic suggestions, lab integration, insurance claims, clinical decision support.
- In-app voice/video, SMS/WhatsApp notifications, customizable domain registration, page builder.
- Platform subscription charge, payment gateway, patient billing, invoices, tax engines, refunds.
- Geolocation-based arrival verification, biometrics, complex payroll, shift bidding, multi-agency caregiver account switching.
- Advanced analytics, forecasting, PDF report export, integrations to external EMR, automatic duplicate merge.

## Release slices: deliver usable vertical increments
- **Slice 1 — Foundation:** tenant-safe auth, agency onboarding, staff roles, service templates, branding and API shell.
- **Slice 2 — Acquisition:** guest portal -> request -> coordinator review -> basic/final pricing confirmation -> quote & revision -> verified customer response.
- **Slice 3 — Care operations:** patient linkage -> caregiver availability -> care plan -> recurrence generation -> assignment / conflicts -> visit execution.
- **Slice 4 — Reliability:** change requests, notifications, reports, audit, documents, accessibility, test hardening, deployment.

## Core acceptance journeys
**AC-01 Guest**: Anonymous visitor to agency A sees only A's published services; submits request with verified email; can later access status via one-time verification; cannot see patient details without explicit grant.

**AC-02 Quote**: Coordinator creates quote v1; customer requests revision; v1 accept is suspended; coordinator issues v2 and supersedes v1; v1 accept attempt fails; v2 acceptance is idempotent and audited.

**AC-03 Patient**: Coordinator converts accepted request after duplicate suggestions; if potential patient exists they choose link or create after review; other tenant's patients never appear.

**AC-04 Care plan**: Approved finite plan generates the exact matching dates once (max 60d), with service/tasks snapshots and PLANNED, unassigned visits; no duplicate regeneration.

**AC-05 Assign**: Caregiver has qualifying verified requirements, regular working interval, no exception or conflicting visit +/- travel buffer; coordinator confirms; UI changes to SCHEDULED.

**AC-06 Concurrency**: Two coordinators try to assign overlapping visits to same caregiver; exactly one assignment commits and the other receives `SCHEDULE_CONFLICT`.

**AC-07 Visit**: Assigned caregiver starts and completes, server timestamps persist; unperformed required tasks need explicit reason; coordinator may review without changing completed status.

**AC-08 Change**: Customer proposes date change; original appointment unchanged until approval; if new time conflicts approval fails and request remains actionable; decline keeps original.

**AC-09 Suspended**: Operator suspends tenant; private access blocked; notifications for business flows are paused appropriately, audit preserved; no patient data exposed.

**AC-10 Tenant Isolation**: API, files, email links, search results, realtime events, reports, exports and background jobs reject or isolate tenant B references from tenant A.

## Target delivery realism
The previously discussed **12–16 working days** is a planning target assuming intensive work and AI assistance, not a reliable guarantee for this scope. Prioritize Slice 1–3 plus essential security; incomplete slice 4 is not production-ready, and no live patient data should be used until controls are validated. Use `13_IMPLEMENTATION_PLAN.md` to track actual effort and defer nice-to-haves rather than weakening core security.

## Final acceptance gates
1. All core journeys pass automated E2E and API tests, including negative authorization tests.
2. No high-severity open security defect; cross-tenant assertions in every business module.
3. Validation and timezone/recurrence edge tests pass; duplicate job execution safe.
4. Email delivery simulated and provider-verified with non-sensitive templates; failures visible.
5. Arabic RTL and English LTR key flows tested across desktop and mobile.
6. Database migration, backup/restore rehearsal, rollback path, environment configuration and secret handling documented.

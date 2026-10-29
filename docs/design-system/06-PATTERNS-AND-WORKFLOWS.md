# RDS 06 — Patterns and Workflows

**Status: PROPOSED** · Derived strictly from docs 03 (flows F01–F11), docs 04 (state machines) and docs 05 (permissions). No new business capabilities are introduced. Components referenced: RDS 05. Screens: RDS 09.

## 0. Shared workflow grammar

Before module specs, four reusable grammar rules keep every module consistent:

1. **Queue → detail grammar**: every operational list (requests, quotes, change requests, exceptions) is a DataTable (RDS 05 B1) with saved-filter tabs (status groups), row → detail panel (desktop) / page (mobile). State-changing actions live in the detail context, never as row-level surprises beyond a max-3 icon cluster.
2. **Stepper grammar** (multi-step creation): numbered step rail (done = brand check, current = brand ring, upcoming = neutral), one topic per step, review step before submit, server errors return to the offending step with field errors, drafts preserved (request wizard, care plan editor). Steps are routes (back/forward safe).
3. **Approval grammar**: banner (C7) + explicit confirm with consequence + reason when domain-required + recorded identity/time + server-side revalidation; optimistic UI forbidden for the approval transition itself.
4. **Exception grammar**: every conflict/denial is an actionable Alert (C8) with the affected entities linked and a "resolve" path; nothing is silently dropped, nothing auto-mutates.

## 1. Organization and administration dashboards

- **Agency dashboard** (Owner/Admin/Coordinator): KPI band (4 cards: today's visits confirmed/in-progress/completed, unassigned visits, requests awaiting review, late change requests — docs 10 wireframe priorities) + 2:1 mosaic: today/upcoming visit list : team availability summary. Every KPI links to its pre-filtered list. Timezone label always visible.
- **Platform operator dashboard**: tenants table (name, status chip, slug, owner contact, created, counts) + aggregate usage; no patient content access anywhere (F11). Activation/suspend behind Destructive confirm with reason; suspended tenant rows keep readable history (AC-09).
- States: dashboards show data-only-empty states ("no visits today" is *success*, not error). Density compact. Loading = skeleton mosaic.

## 2. Service requests

- **Queue** (`UNDER_REVIEW` default tab; tabs: New / Awaiting customer / Approved / Closed): columns requester (name+email), service, area, preferred window, submitted (relative + absolute), status, assignee-less. Primary per-row action: review.
- **Detail**: requester identity + verification state; original request content (read-only snapshot semantics — the request text never rewrites); status timeline (B9); quote group summary; linked patient (if any); actions per BR-REQ: start review, request info (→ AWAITING_CUSTOMER with secure message), approve (enabled only when commercial acceptance or fixed-price acknowledgment snapshot exists — disabled buttons carry explanatory tooltip), reject (reason required), link/create patient (F06).
- **AWAITING_CUSTOMER** renders a waiting banner with last-sent date; customer reply returns it to UNDER_REVIEW (no staff action needed to "re-open").
- Permissions: coordinators+; customers see only their own via portal (§15). Approve never auto-creates patients or visits (F03.6) — the success panel offers the two next actions as links instead of doing them silently.

## 3. Patient management

- **List**: DataTable (name, age, ID `tabular-nums` mono, active plans, last visit, grants count); search by name/ID (tenant-scoped Combobox); "Add patient" primary.
- **Create/link flow**: dialog or route with dedup step — normalized-name/DOB match candidates listed ("possible existing patient" cards with match-cues); choose *link* (records reason-free link + audit) or *create new* (reason required when duplicates suggested were ignored — F06.3). No cross-tenant results ever; merge is out of MVP (docs 02) so no merge UI.
- **Profile**: PatientSummaryHeader (C1) + Tabs: Overview (operational facts only), Visits (filtered table), Care plans (C2 cards), Documents (private file list, upload gated, "private" badge + scan-state: *processing / available / rejected* — quarantine visible to authorized staff), Access grants (grant table: customer, scopes chips, status, verified-by, expiry; actions: add grant (wizard: customer → scopes → evidence upload → confirm), revoke (destructive confirm + immediate effect note)).
- **States**: empty visits/plans tabs use EmptyState with CTAs; documents show processing skeleton until scanned (never downloadable while processing).
- **Privacy**: caregivers never reach this module (no nav item); customers see a portal projection only (§15).

## 4. Care plans

- **List**: cards/table hybrid (patient, service, status chip, version, next occurrence, health chip).
- **Editor** (stepper, drafts preserved): 1 service+patient → 2 period (DateRangePicker with x/60 counter, hard stop >60) → 3 recurrence (weekday toggles + start time + duration; DST-transition days show inline warning) → 4 tasks & clinical instructions (instruction fields flagged clinical; activation blocked until qualified approval — A06) → 5 review & activate.
- **Versioning**: editing an ACTIVE plan creates draft vN+1; diff Dialog (field-level old→new) before send-to-approval; activation snapshots tasks/instructions (immutable); "affects only future unstarted visits" stated on the diff (F07 edge).
- **Generation preview**: after activation the review table shows all generated occurrences (date, occurrenceKey mono, PLANNED chip, unassigned); bulk assign entry point here (C6 bulk mode).
- **Pause/cancel**: Pause explains "generation/assignment paused; confirmed visits untouched"; Cancel requires reason + future-visits treatment choice (per BR-PLAN) with explicit counts.

## 5. Visit scheduling (calendar + lists)

- Calendar week/day per RDS 05 B10 + agenda toggle; PLANNED lane on top; visit click → VisitDetailPanel (C4).
- **Standalone visit creation**: from patient profile or calendar "+" — dialog reusing plan-editor fragments minus recurrence.
- **List view**: DataTable with status tabs; the default "today" scope; bulk assign from selection.
- Density compact; now-line; tenant tz in calendar header.

## 6. Caregiver assignment and availability

- Assignment UX = C6 (candidates, soft-rank reason chips, transactional confirm, bulk outcomes). Conflict error grammar per §0.4.
- **Availability admin**: caregiver profile tab (C5): weekly intervals editor (A10 single interval/day), dated exceptions list + leave wizard with affected-visit preview (F10: marking leave flags assignmentHealth=NEEDS_REASSIGNMENT, enqueues notification; original assignments remain until coordinator reassigns — UI shows flagged rows, never auto-swaps).
- **Reassignment queue**: DataTable of visits where assignmentHealth=NEEDS_REASSIGNMENT (or flag filter); action → candidate picker with current caregiver context.
- Buffer changes (settings) trigger "upcoming assignment scan" results panel listing flagged conflicts (BR-SCH) — read-only flags with resolve links.

## 7. Visit check-in / check-out (caregiver)

- Caregiver portal surface (§16 shell): Today list → visit card → **Visit execution view** (single column, lg controls, 360–430 px primary target):
  1. Pre-start: appointment window, patient minimum info (name + access notes only), service + tasks checklist preview, address/area; **Start visit** disabled with reason until eligible window/tenant ACTIVE (tooltip explains; no guessing).
  2. Start → spinner → **server-confirmed** IN_PROGRESS (button shows pending until response; no optimistic state — P1/docs 10). actualStartAt displayed after confirmation.
  3. During: task checklist (DONE checkbox / NOT_DONE opens mandatory reason dialog), notes textarea auto-saving draft locally.
  4. **End visit**: enabled when all required tasks classified (else disabled + list of missing items); confirm dialog summarizes outcomes; completion shows server actualEndAt + COMPLETED chip; reviewStatus NEEDS_REVIEW shows "coordinator may review" hint.
- Interruption/exception path: "report problem" → exception note → operational exception report (F08); coordinator correction is a separate audited flow, never inline editing of the completed record (append-only rendering, B9).

## 8. Visit completion and coordinator review

- Completed visit detail (staff): outcome summary (tasks + reasons), notes snapshot (read-only), actual times, reviewStatus chip. Review action (coordinator+): add review outcome / flag NEEDS_REVIEW→REVIEWED / append correction — each creates a new timeline entry with author+reason; the original completion content is never editable in UI (BR-VST).
- **Review queue**: visits COMPLETED + NEEDS_REVIEW filter tab; bulk "mark reviewed" with confirm; MISSED designation is a coordinator decision dialog (never automatic) requiring outcome + reason (BR-VST).

## 9. Rescheduling and cancellation approval

- **Change-request queue** (coordinator): tabs PENDING (default) / Decided; urgency LATE rows carry danger left-border + "late" chip (BR-CHG); columns: visit (date/time, patient privacy-filtered), customer, type (RESCHEDULE/CANCEL icon+label), requested new window, urgency, age of request.
- **Decision detail**: original appointment (unchanged while pending — stated verbatim), requested change, policy context (cutoff config name, computed NORMAL/LATE), reason; Approve runs server recheck — conflicts return actionable Alert keeping request PENDING (F09); Approve/Decline both require confirm; Decline requires reason; outcome notifies customer+caregiver via outbox (toast confirms submission, not delivery).
- **Customer side**: portal "request change" on a SCHEDULED future visit (MANAGE_VISITS grant): small form (type, optional new slot, reason) → success panel states "original appointment stays confirmed until approved" (docs 10 copy law). One PENDING per visit enforced — the button renders disabled with explanation when one exists.

## 10. Service catalogs

- **Admin**: template gallery (platform templates, read-only, "import" action) + agency services table (name, pricing model chip FIXED/STARTING_FROM/CUSTOM_QUOTE, price+unit, status published/draft, areas); edit form with pricing unit explicit; publish/unpublish with consequences ("hidden service keeps historical requests" — docs 02); price change creates new effective config with warning that accepted records are untouched (BR-PRC).
- **Customer catalog** (portal): service cards (name, description, price display per model: FIXED shows amount+unit; STARTING_FROM shows "from X" + explanatory caption; CUSTOM_QUOTE shows "quoted after review") → detail page → request CTA. No cart/checkout artifacts ever (no payment in V1).

## 11. Quotes and quote approvals

- **Builder** (coordinator, from request): line items editor (service/quantity/unit price/total, `tabular-nums`, integer minor units via formatted input), currency fixed to tenant (read-only chip), terms, validity date; **Send** creates immutable SENT vN (confirm dialog: "customers see exactly this").
- **Detail (staff)**: version rail (v1 SUPERSEDED → v2 SENT …), current effective offer highlighted, revision requests panel with state chips; actions on effective SENT: create revision replacement (draft vN+1 prefilled), decline revision (reason), let expire (info note; expiry is time-checked server-side regardless of jobs).
- **Customer quote view** (portal, branded): offer header (version + valid-until), line items, total, terms, identity-verification gate before actions (magic-link/OTP per A02), actions Accept (explicit consent copy: "you accept exactly this version"; success is server-confirmed idempotent — double click lands on "already accepted" result, F03 edge) / Request revision (reason; while PENDING accept shows disabled + explanation) / Reject (reason optional). Persistent notice: "accepting is not a payment" (docs 10).
- Race safety UX: accept on expired/superseded returns friendly 409 panel with current state + link to newest effective offer.

## 12. Notifications

- Bell + panel (C10) + notification center page (full list, filters by kind/read, mark-all). Tenant notification policy (settings) distinguishes protected essential events (disabled-by-tenant forbidden, UI shows lock icon + explanation) vs optional toggles (D17). Delivery failure visibility for staff: "notification health" card in settings/reports listing failed jobs count (danger) with re-drive action where API provides.
- Copy law: no clinical details, generic entity references, authenticated links only (BR-NOT).

## 13. Operational reports

- Report types per docs 02: requests funnel, visit statuses, timeliness (% starts on time), caregiver load. Composition: filter bar (period DateRangePicker, service, status, timezone-fixed) → KPI cards → DataTable (detail rows) → minimal bar chart where the metric is a distribution. Every report footer states numerator/denominator/exclusions in a collapsible "how this is counted" panel (docs 01 success-signals law). Tenant-scoped always; export deferred (docs 02 not-in-V1 — no export buttons).
- **Caregiver "own limited" analytics**: personal visits count/completion only.

## 14. Organization settings

- Sections (Owner/Admin): Branding (logo upload private+scanned, primary color constrained to approved palette options, wordmark preview both locales), Services (→ module 10), Scheduling (travel buffer slider 0–120 min with default 30 + warning that changes flag upcoming conflicts, cancel/reschedule cutoffs hours, late-review toggle), Notification policy (module 12), Timezone & currency (IANA picker + ISO currency, read-only display elsewhere; changing either warns about display-only effect), Team (invites table: email, role, status pending/accepted/expired, resend/revoke; invite = email + role + 48 h expiry note).
- Form grammar: per-section save (dirty tracking + unsaved guard), audit-sensitive changes show "changes are recorded" hint. Danger zone (suspend customers? no — tenant-level suspend is operator-only) — settings has no destructive tenant actions in V1.

## 15. Client portal (customer)

- **Shell**: portal header (agency brand, locale switch, notifications, account) — no sidebar; bottom-safe navigation on mobile (simple top nav + cards).
- **Home**: greeting + active requests summary cards + upcoming visits (VIEW_VISITS grant) + quick actions (new request, track request).
- **Track request** (guest, verified): status timeline + entitlement-scoped quote access; verification via single-use link; no patient details without grant (F02.5).
- **My family**: patient cards (name, relationship label, grant scope chips, expiry); "request access" flow → coordinator validation (F05.3) with pending state; revoked grant → card disappears + explanation entry in notifications.
- **My visits**: granted patients only; visit summary projection (C4 customer variant); change-request entry per §9.
- Tone: warm, `bodyLg` prose, comfortable density, reassurance microcopy at every gate (why verification is needed, what a quote acceptance means).

## 16. Caregiver mobile experience (responsive web, 360–430 px)

- **Shell**: top compact header (agency name, avatar) + bottom tab bar: Today · Past · Profile (44 px targets); content max 480 px centered.
- **Today**: date header + day timeline of assigned visits (state chips; past/completed collapsed), offline banner with retry when fetch fails ("showing last loaded" honesty).
- **Visit execution**: module 7 flow; sticky bottom primary action (Start/End) within thumb zone; large text (`bodyLg`), high-contrast chips.
- **Past visits**: read-only outcomes list; profile: own availability display (read) + qualification status; password/lang settings.
- No all-patient search, no cross-visit data, no marketing surfaces (docs 05 rule 6).

## 17. State coverage contract (applies to every module above)

Every data region implements: loading (skeleton), empty (C9 with correct variant), error (Alert + retry, form state preserved), success (toast + persistent change), permission-denied (C9 no-access for staff; absence for customer/caregiver), and suspended-tenant read-only behavior. This contract is part of each module's definition of done (docs 13 DoD) and RDS 10 acceptance criteria.

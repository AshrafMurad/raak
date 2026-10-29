# RDS 09 — Screen Specifications

**Status: PROPOSED** · Screen-level architecture for every surface in the docs 10 page inventory and the docs 03 route map. Workflow behavior lives in RDS 06 (referenced as M§n); components in RDS 05; shell in RDS 04. No new business capability is introduced here.

## 0. How to read a screen spec

Each screen defines: **Route** (illustrative, from docs 03) · **Users** (acting principals) · **Goal** (primary job) · **Layout** (composition from RDS 04 patterns) · **Actions** (primary / secondary) · **Components** (RDS 05 inventory) · **States** (only deviations from the standard contract) · **Notes** (RTL / a11y / responsive / privacy only where non-obvious).

**Standard contract (applies to every screen, never restated):** the four data states and permission/suspended behavior of RDS 06 §17; skip link, landmarks, one `h1`, focus rules of RDS 08; logical-CSS mirroring of RDS 07; density per surface (RDS 01 §4); all copy from translation namespaces; one primary CTA per view.

**Route host conventions** (docs 03): platform = `platform.<base>`, agency portal = `<tenantSlug>.<base>` (root = customer-facing), workspace = same host under `/workspace/*`, locale segment always first (`/ar`, `/en`).

---

## 1. Public platform surface (`platform.<base>`)

### P-1 Landing / product overview
- **Route** `/[locale]` · **Users** anonymous (owner prospects).
- **Goal** Understand what Raak does; reach agency signup.
- **Layout** Marketing column (no shell): `display` hero, feature sections (`sectionTitle`), CTA band. Prose max 720 px.
- **Actions** Primary: "Register your agency" (→ P-2). Secondary: language switch, login link.
- **Components** PageShell seed (existing), Button link, locale switch.
- **Notes** Only surface allowed `display` type; no illustrations beyond icon glyphs; no pricing/billing claims (out of V1 boundary).

### P-2 Agency signup
- **Route** `/[locale]/register-agency` (implemented as `/register`) · **Users** anonymous owner.
- **Goal** Create PENDING_APPROVAL tenant + owner account.
- **Layout** PageShell two-column: value intro (start) + form card (end); single column <1024 px.
- **Fields** Legal name, display name, slug (live validation, `TENANT_SLUG_TAKEN` inline), timezone (IANA select), currency (ISO select), support email, owner email + password.
- **Actions** Primary: create account. Secondary: login link.
- **Components** Input (label-top pattern A3/A10), Select, Notice (auth-forms pattern), Button.
- **States** Server slug conflict → inline field error, form preserved; success → P-3.
- **Notes** Slug/emails render `dir="ltr"` inputs with flow-direction labels; `autocomplete` per RDS 08 §4.6. Existing implementation is the seed; migrate raw palette/type utilities per RDS 10 Phase 2.

### P-3 Agency pending status
- **Route** `/[locale]/register/pending` · **Users** owner after signup.
- **Goal** Explain activation is manual; set expectations; offer re-verification.
- **Layout** Centered card ≤480 px: status Alert (info), steps list ("we review → we activate → you configure"), support hint.
- **Actions** Secondary: resend verification email (rate-limited, cooldown shown), back to login.
- **Notes** Never reveals platform-review internals; no countdown timers (RDS 08 §3).

---

## 2. Auth screens (all hosts, existing Sprint 0–1 implementations are the seed)

### A-1 Login · A-2 Register (see P-2) · A-3 Verify email · A-4 Reset password · A-5 Accept invitation
- **Route** `/[locale]/login`, `/verify-email`, `/reset-password`, `/accept-invitation` (capability-token pages).
- **Users** staff / customer / operator per host audience; invitation = invited staff only.
- **Goal** Authenticate or complete a capability token action.
- **Layout** PageShell; single form card; token pages show entity context ("invitation for Afiya Care as Caregiver") before credential step.
- **Actions** Primary: submit. Secondary: switch locale (token preserved — implemented), request new link.
- **States** Expired/used token → dedicated panel with reissue path (error-code localized at boundary); success → destination per audience (workspace / portal home / platform).
- **Notes** Invitation shows role + tenant name + 48 h expiry in copy; accept disabled until password meets policy; one audience per host — never offer tenant choice (docs 05).

---

## 3. Agency workspace (`<tenantSlug>.<base>/workspace/*`)

Shell: RDS 04 §1 (sidebar + header). Density: compact. All tables server-paginated; all list URLs carry query state.

### W-1 Dashboard
- **Route** `/workspace` · **Users** Owner, Admin, Coordinator.
- **Goal** Triage the day: what needs action now.
- **Layout** RDS 04 §6 dashboard mosaic: KPI band (today completed / in-progress, unassigned visits, requests awaiting review, late change requests) + 2:1 split (today & upcoming visits list : team availability summary). Timezone chip in header region.
- **Actions** Primary none (navigation surface); every KPI/list row links to pre-filtered list.
- **Components** KPI card (B11), DataTable fragment, StatusBadge, EmptyState ("no visits today" = success tone).
- **Notes** No charts on V1 dashboard (lists answer "what now" better); data-only-empty rule M§1.

### W-2 Service requests queue
- **Route** `/workspace/requests` · **Users** Owner, Admin, Coordinator.
- **Layout** Page header + status tabs (New `SUBMITTED`+`UNDER_REVIEW` default / Awaiting customer / Approved / Closed) + DataTable 8-col with detail panel 4-col (RDS 04 list+detail); <1280 px detail becomes page.
- **Columns** Requester (name+email), service, area, preferred window, submitted (relative + absolute, `tabular-nums`), status StatusBadge, assignee state.
- **Actions** Per-row: open (review). Toolbar: search, filters (M§2), export none.
- **Components** B1, B3, A6, C9.
- **Notes** Queue grammar M§0.1; mobile = card list (identity, service, status, submitted).

### W-3 Request detail
- **Route** `/workspace/requests/:id` (or panel) · **Users** as W-2.
- **Layout** Identity header (requester + verification state StatusBadge) → original request snapshot (read-only card) → quote group summary → linked patient card → status Timeline (B9) → actions bar.
- **Actions** Start review · request info (→ AWAITING_CUSTOMER, secure message composer) · approve (disabled until commercial-acceptance snapshot exists; tooltip explains) · reject (reason required, destructive confirm) · link/create patient (→ W-8).
- **Notes** Approve success panel offers next actions as links (never auto-creates, M§2); AWAITING_CUSTOMER renders waiting banner with last-sent date; request text is immutable — edits happen via customer reply, shown as timeline entries.

### W-4 Quotes list
- **Route** `/workspace/quotes` · **Users** Owner, Admin, Coordinator.
- **Layout** Tabs (Draft / Sent / Decided) + DataTable: request ref, customer, version rail summary (`v1 SUPERSEDED → v2 SENT`), total (`tabular-nums`, tenant currency), status, valid-until, actions (open).
- **Notes** Effective SENT rows highlighted subtly (`bg-sunken`); expired badges computed server-side (time-checked, not client clock — BR-QTE).

### W-5 Quote builder
- **Route** `/workspace/quotes/new?requestId=…` and `/workspace/quotes/:id/edit` (DRAFT only) · **Users** Coordinator+.
- **Layout** Form page max 640: requester summary card (read-only) → line-item editor rows (service select, qty, unit price, line total `tabular-nums`) → add/remove row → terms textarea → validity DatePicker → totals card (sticky footer on mobile).
- **Actions** Primary: Send (destructive-style confirm: "customers see exactly this version; it becomes immutable") · Secondary: save draft.
- **Components** Input, Select, DatePicker (B8), formatted money input (integer minor units), Dialog.
- **Notes** Currency fixed to tenant (read-only chip); qty/price validation inline; draft preserved (A10).

### W-6 Quote detail (staff)
- **Route** `/workspace/quotes/:id` · **Layout** Version rail (inline-start, versions as nodes) + content: current version line items, terms, status; revision panel (PENDING/RESOLVED chips); actions on effective SENT: create revision replacement (draft vN+1 prefilled), decline revision (reason), let-expire note.
- **Notes** Superseded versions read-only with "viewed for history" banner; M§11 governs revision gates.

### W-7 Patients list
- **Route** `/workspace/patients` · **Users** Owner, Admin, Coordinator (caregivers: no nav item; direct URL → no-access panel).
- **Layout** Page header (primary: Add patient) + search Combobox (name/ID) + DataTable: name, age/DOB, ID (mono `tabular-nums`), active plans count, last visit, grants count.
- **Notes** Row → W-9. Search server-scoped; "no results" covers both absent and not-permitted (anti-enumeration).

### W-8 Patient create / link (dedup)
- **Route** `/workspace/patients/new` (+ `?requestId=` context) · **Layout** Two-phase: entry form (name, DOB, area, contact-minimum) → dedup review: candidate match cards ("possible existing patient" with match cues) each with **Link** / dismiss; dismissing matches with **Create new** requires reason.
- **Actions** Primary (phase 2): Link existing · Create new. Cancel preserves draft.
- **Notes** Cross-tenant matches impossible (server-scoped) — UI never renders a "wrong tenant" state; M§3; no merge UI (out of MVP).

### W-9 Patient profile
- **Route** `/workspace/patients/:id` · **Layout** PatientSummaryHeader (C1) + Tabs (B4): Overview · Visits · Care plans · Documents · Access grants.
  - **Overview**: operational facts card + recent activity timeline.
  - **Visits**: filtered DataTable (status chips, actual times).
  - **Care plans**: C2 cards with version/health chips.
  - **Documents**: private file list — name, uploader, scan state (`processing`/`available`/`rejected` StatusBadge), private badge; upload gated per permission; processing rows not downloadable (skeleton state).
  - **Access grants**: grant table (customer, scope chips, authorization type, verified-by, expiry, status) + add-grant wizard (customer → scopes → evidence upload → confirm) + revoke (destructive confirm, immediate-effect note).
- **Actions** Header inline actions per C1 (new request, new plan, edit).
- **Notes** Progressive disclosure: full address/phone behind "contact details" disclosure, not default; M§3 privacy laws.

### W-10 Caregivers list
- **Route** `/workspace/caregivers` · **Layout** DataTable: caregiver (avatar+name), qualifications summary Badge list, availability state, active assignments today/week, expiring-qualification warning chip; row → W-11.
- **Notes** Caregiver records are staff accounts, not patients — no PHI projection rules, but qualification data stays tenant-scoped.

### W-11 Caregiver profile
- **Route** `/workspace/caregivers/:id` · **Layout** Identity header + Tabs: Overview (qualifications, service authorizations with expiry warnings) · Availability (C5 weekly grid + exceptions/leave list; edit per permission; leave wizard with affected-visit preview) · Schedule (their visits, calendar link) · Activity (audit).
- **Notes** Leave flow M§6: preview lists affected SCHEDULED visits, flags `NEEDS_REASSIGNMENT`, never auto-swaps.

### W-12 Care plans list
- **Route** `/workspace/care-plans` · **Layout** Hybrid table/cards: patient, service, StatusBadge (B3 plan mapping), version, next occurrence, health chip (unassigned count warning); primary: New care plan.
- **Notes** PAUSED plans show "generation paused; confirmed visits unaffected" caption (state honesty).

### W-13 Care plan editor (stepper)
- **Route** `/workspace/care-plans/new?patientId=…` / `…/:id/edit` (creates draft vN+1) · **Layout** Stepper M§0.2, steps as routes: 1 Service+patient → 2 Period (DateRangePicker, x/60 counter, hard stop) → 3 Recurrence (weekday toggles + start time + duration; DST-day inline warning) → 4 Tasks & clinical instructions (clinical fields flagged; activation blocked pending qualified approval — C7 banner) → 5 Review & activate.
- **Actions** Primary (step 5): Activate. Secondary: save draft (auto + explicit), diff with previous version (Dialog, field-level old→new, "affects only future unstarted visits").
- **Notes** Editing ACTIVE plan never mutates history — snapshot semantics; drafts client-persisted (A10); M§4.

### W-14 Generation preview
- **Route** `/workspace/care-plans/:id/preview` (post-activation) · **Layout** Review table of all generated occurrences: date, occurrenceKey (mono), time, PLANNED StatusBadge (dashed, unassigned), service snapshot; header count "N visits generated".
- **Actions** Primary: Bulk assign (→ C6 bulk mode from selection) · Secondary: open calendar filtered to plan.
- **Notes** Read-only (occurrences immutable snapshots); regeneration idempotence is server-owned — UI never offers "regenerate".

### W-15 Visits calendar
- **Route** `/workspace/visits/calendar` · **Users** Owner, Admin, Coordinator.
- **Layout** RDS 05 B10: header (range label, today, prev/next mirrored chevrons, week/day switch, agenda toggle, timezone label, caregiver filter) + week grid with PLANNED unassigned lane on top; resource (per-caregiver) mode via caregiver filter.
- **Actions** Visit block click → W-17 as drawer; "+" empty-slot creation (dialog, M§5).
- **Notes** Agenda toggle is the a11y path (B10); conflict shading for leave; now-line current-day only; month view out of scope.

### W-16 Visits list
- **Route** `/workspace/visits` · **Layout** Status tabs (default "today") + DataTable: date/time (`tabular-nums`), patient (privacy-filtered), service, caregiver, StatusBadge + assignmentHealth/review chips as separate chips, actions (assign/open).
- **Actions** Toolbar: bulk assign (selection) → C6; filters M§0.1.
- **Notes** CANCELLED rows strikethrough time; MISSED distinct chip; LATE change-request linkage via patient row menu.

### W-17 Visit detail panel
- **Route** `/workspace/visits/:id` (page) / drawer context · **Layout** C4 sections: state header → assignment → tasks/outcomes → actual times ("recorded by server") → notes (append-only) → pending changes → timeline. Actions from typed eligibility map only.
- **Notes** Audience projections: caregiver/customer never receive this panel raw (C4); coordinator corrections are new timeline entries, never inline edits (M§8).

### W-18 Candidate picker / assignment
- **Route** dialog from W-16/W-14/W-17 · **Layout** C6: candidates table (caregiver, rank-reason chips, window, load, conflicts absent-by-construction) → confirm step (visit summary + buffer note + pending state).
- **Notes** Server is sole filter (BR-SCH); conflict on confirm = actionable Alert, dialog stays open, nothing mutates; keyboard path equal (listbox + Enter); no drag.

### W-19 Reassignment / exception queue
- **Route** `/workspace/visits/exceptions` · **Layout** DataTable of `assignmentHealth=NEEDS_REASSIGNMENT` (+ buffer-conflict flags from settings scans): visit, caregiver context, reason chip, flagged-at; action → W-18 with current-caregiver context.
- **Notes** Read-only flags with resolve links (M§6); never auto-reassigns.

### W-20 Change requests queue
- **Route** `/workspace/change-requests` · **Layout** Tabs PENDING (default) / Decided + DataTable: visit window, patient (filtered), customer, type icon+label (RESCHEDULE/CANCEL), requested new window, urgency (LATE = danger left-border + chip), age.
- **Notes** M§9: original appointment unchanged while pending — stated in detail, never assumed.

### W-21 Change request decision
- **Route** `/workspace/change-requests/:id` · **Layout** Original appointment card (verbatim, StatusBadge SCHEDULED) + requested change card + policy context (cutoff name, computed NORMAL/LATE) + reason quote + actions.
- **Actions** Approve (server recheck; conflict → C8 Alert, stays PENDING) / Decline (reason, destructive confirm). Both record identity + notify via outbox (toast = "submitted", not "delivered").

### W-22 Reports
- **Route** `/workspace/reports` · **Layout** Report-type Tabs (requests funnel, visit statuses, timeliness, caregiver load) → filter bar (period DateRangePicker, service, status) → KPI cards → DataTable → minimal bar chart where distribution matters.
- **Notes** "How this is counted" collapsible footer (numerator/denominator/exclusions); no export (out of V1); timezone fixed and labeled; M§13.

### W-23 Notification center
- **Route** `/workspace/notifications` · **Layout** Full list (C10 item anatomy), filters (kind, read), mark-all-read; bell panel (C10) is the quick surface.
- **Notes** Copy laws BR-NOT; deep links die gracefully to no-access panel.

### W-24 Team & invites
- **Route** `/workspace/settings/team` (renders within W-25 settings shell) · **Layout** Invites table (email, role, status pending/accepted/expired, sent-at, resend/revoke) + staff list + primary: Invite member (email + role Select + 48 h expiry note).
- **Notes** Roles rendered with localized labels + canonical code chips (staff contexts); no role escalation without permission — invite dialog role options permission-filtered.

### W-25 Settings
- **Route** `/workspace/settings/*` · **Users** Owner, Admin (Coordinator: limited) · **Layout** Settings shell: inline-start section nav (Branding · Services · Scheduling · Notifications · Timezone & currency · Team) + stacked cards max 960, per-section save (dirty tracking, unsaved guard M§14).
  - **Scheduling**: travel buffer slider 0–120 (default 30) with "changes flag upcoming conflicts" warning + post-save conflict scan results panel (read-only flags + resolve links); cutoffs hours; late-review toggle.
  - **Branding**: logo upload (private+scanned pipeline noted), primary color constrained to approved palette options, wordmark preview in both locales.
  - **Services**: links to catalog admin (M§10).
- **Notes** Timezone/currency changes warn "display-only effect"; no destructive tenant actions here (operator-only); M§14 grammar.

---

## 4. Customer portal (`<tenantSlug>.<base>/` root, branded)

Shell: portal header only (no sidebar) — RDS 04 §2.3; density comfortable; `bodyLg` prose; tone warm and plain-language.

### C-1 Branded landing / services list
- **Route** `/[locale]` · **Users** anonymous + customers.
- **Goal** Understand agency offering; start a request.
- **Layout** Agency brand header + hero (agency name, `display`/`sectionTitle` scale) + service cards grid (1-col mobile, 2-col ≥768): name, short description, price display per model (FIXED amount+unit; STARTING_FROM "from X" + caption; CUSTOM_QUOTE "quoted after review"), status (unpublished never listed).
- **Actions** Primary per card: Request this service (→ C-3). Secondary: track request, login/account.
- **Notes** PENDING/SUSPENDED tenant → generic availability notice (no internals, F01.5); no cart/checkout artifacts ever.

### C-2 Service detail
- **Route** `/services/:slug` · **Layout** Service content (description, what's included, pricing model explanation, areas covered) + sticky CTA on mobile; primary: Request this service.

### C-3 Request wizard (guest-capable)
- **Route** `/request` · **Users** guest or logged-in customer.
- **Layout** Stepper M§0.2 (4 steps per docs 10): service → requester + beneficiary relationship → area + preferred window → review/submit. Review shows privacy notice acceptance (required checkbox).
- **Fields** Name, email, phone (optional), relationship, patient name/minimal distinguishing details, city/area, preferred window, notes (minimal).
- **Notes** Never collects clinical detail (docs 10 guest-form law); duplicate submission → dedupe hint (F02); drafts preserved; success → C-4.

### C-4 Submission receipt
- **Route** `/request/submitted` · **Layout** Success panel: confirmation copy ("no appointment yet — the agency reviews and sends an offer"), tracking code (mono, `bdi`, "not a password" caption), "check your email" verification step, what-happens-next mini timeline.
- **Notes** Tracking code is opaque, never sufficient for access (F02.4 copy must not over-promise).

### C-5 Track request (verified guest)
- **Route** `/track` → email OTP/magic link → `/track/:token` (token single-use, scoped) · **Layout** Status timeline + entitlement-scoped quote access links; no patient details without grant (F02.5).
- **States** Expired/used token → friendly re-verify panel (rate-limited).
- **Notes** Verification UX per A02: OTP inputs accept paste; remaining validity stated in copy.

### C-6 Quote view (accept / revision / reject)
- **Route** `/track/:token` or `/account/quotes/:id` · **Layout** Agency-branded card: version + valid-until header → line items (qty, unit, total, `tabular-nums`) → total + currency → terms → action bar. Persistent notice: "accepting is not a payment".
- **Actions** Primary: Accept (identity-verification gate first; consent copy "you accept exactly this version") · Request revision (reason; while PENDING, Accept disabled + explanation) · Reject (reason optional, destructive confirm).
- **States** Race/expiry: friendly 409 panel with current state + link to newest effective version (F03 edge, M§11); idempotent double-accept → "already accepted" result.
- **Notes** Success/failure only after server confirm (no optimistic accept); reviewer identity never shown (customer view).

### C-7 Login / account signup
- **Route** `/account/login`, `/account/signup` · **Layout** PageShell-style single card; signup optionally links guest requests via re-authenticated claim flow (F05); post-login destination: C-8.

### C-8 Home (authenticated)
- **Route** `/account` · **Layout** Greeting + quick actions (new request, track request) + active requests summary cards + upcoming visits (VIEW_VISITS grants).
- **Notes** Each card names the benefiting patient only when a grant exists; revoked grants → section absent (never an error).

### C-9 My requests
- **Route** `/account/requests` · **Layout** Comfortable list (56–64 px items): service, submitted, status chip (localized labels only — customer contexts hide canonical codes), quote link when entitlement applies.

### C-10 My family
- **Route** `/account/family` · **Layout** Patient cards: name, relationship label, scope chips, expiry, status; "request access" flow (→ coordinator validation, pending state, F05.3).
- **Notes** Revoked grant → card disappears + notifications entry explains; scopes rendered as localized chips with a plain-language tooltip per scope.

### C-11 My visits
- **Route** `/account/visits` · **Layout** Granted patients only; visit summary projection (C4 customer variant): date/window, service, StatusBadge (localized), caregiver first name where projection allows.
- **Actions** Per future SCHEDULED visit (MANAGE_VISITS): Request change → C-12.

### C-12 Change request form
- **Route** dialog/page from C-11 · **Layout** Small form: type (RESCHEDULE/CANCEL), optional new window (DatePicker/TimePicker), reason. Success panel states verbatim: "the original appointment stays confirmed until the coordinator approves this change".
- **States** One PENDING per visit — button disabled with explanation when exists (M§9).

---

## 5. Caregiver portal (`<tenantSlug>.<base>/workspace` — caregiver session, mobile shell)

Shell: RDS 06 §16 — compact header + bottom tabs (Today · Past · Profile), content max 480 px, `bodyLg`, targets ≥44–48 px, offline honesty banner.

### G-1 Today
- **Route** `/workspace/today` · **Layout** Date header + day timeline of assigned visits: time (`tabular-nums`), service, patient first name + access notes only, StatusBadge, state-aware CTA (Start when eligible / Open / View result).
- **Notes** Past/completed collapse; eligibility-gated Start button shows reason tooltip when disabled (window/tenant state — M§7).

### G-2 Visit execution
- **Route** `/workspace/visits/:id/run` · **Layout** Single column M§7: pre-start card → task checklist (DONE / NOT_DONE+reason dialog) → notes textarea (local draft autosave) → sticky bottom primary (Start visit → End visit, server-confirmed each).
- **States** Pending spinner until server response (never optimistic); End disabled until required tasks classified (missing list shown); connectivity failure → retry, draft preserved (RDS 08 §8).
- **Notes** "Report problem" exception path → operational exception report (F08); no patient data beyond minimum (docs 05 rule 6).

### G-3 Past visits
- **Route** `/workspace/past` · **Layout** Read-only grouped list (date groups): visit, outcome chips (task summary), reviewStatus hint; no editing (append-only law).

### G-4 Profile
- **Route** `/workspace/profile` · **Layout** Own availability (read view of C5), qualification status list (expiring warnings), password + language settings; no agency data, no all-patient search anywhere in this surface.

---

## 6. Platform operator console (`platform.<base>/platform/*`)

Shell: minimal (RDS 04 §2.3) — top nav (Tenants · Operator audit), no sidebar, compact density. Existing `/platform/tenants` page is the seed (audit + migration debt in RDS 10).

### O-1 Tenants list
- **Route** `/platform/tenants` (exists) · **Users** PlatformOperator.
- **Layout** Page header + DataTable: agency (name), workspace slug (mono `dir="ltr"`), owner contact, created, counts (owners/staff/customers), StatusBadge (F01 mapping), actions.
- **Actions** Per row: Activate / Suspend (destructive confirm + reason required for suspend — existing behavior preserved).
- **States** Unauthorized (401) → login-required panel (existing); suspended rows keep readable history (AC-09).
- **Notes** Migrates ad-hoc amber/emerald/red chips to StatusBadge tokens in Phase 2 (RDS 10 debt register).

### O-2 Tenant detail
- **Route** `/platform/tenants/:id` · **Layout** Identity header (name, slug, status, timezone, currency, created) + Tabs: Metadata & owner · Activity (audit events: activation, suspension with reasons and operator identity) · Aggregate usage (O-3 data scoped to tenant).
- **Notes** No patient content of any kind (F11); suspend reason history visible with operator identity (audit honesty).

### O-3 Aggregate usage
- **Route** `/platform/usage` · **Layout** KPI band (tenants by status, total staff/customers counts) + tenants comparison table; totals only — no per-patient anything (docs 05 matrix row: "totals only").

### O-4 Operator audit
- **Route** `/platform/audit` · **Layout** Filterable Timeline/B9-style list of operator actions (who, what, when, reason); filter by operator/action/tenant.

---

## 7. Cross-screen consistency contract (QA checklist per screen)

1. Exactly one `h1`; breadcrumbs match route depth; sidebar/tab active state matches location.
2. One primary CTA; destructive actions confirm with consequence; disabled actions explain themselves.
3. Statuses rendered only via StatusBadge (B3 mapping) — no ad-hoc chips.
4. All four data states + permission-denied + suspended-tenant behavior demonstrable (M§17).
5. RTL pass: logical CSS only, icons mirrored per RDS 07 §5, bidi strings isolated.
6. Numeric columns `tabular-nums`; dates via `Intl` + tenant tz; money via tenant currency formatter.
7. Copy: no literals; staff sees code+label, customers see labels only; privacy-safe toasts.

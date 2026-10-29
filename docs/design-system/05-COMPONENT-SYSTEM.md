# RDS 05 — Component System

**Status: PROPOSED** · Built on Tailwind v4 + RDS tokens. Foundation stack (roadmap-gated, owner approval for new deps): shadcn/ui CLI conventions, Radix UI primitives for behavior, `lucide-react` icons, `class-variance-authority` + `clsx` + `tailwind-merge` for variants. No second visual library.

File conventions (for implementers): primitives in `frontend/components/ui/*` (shadcn-style, e.g. `button.tsx`); RDS composites in `frontend/components/rds/*` (e.g. `status-badge.tsx`, `data-table.tsx`); healthcare patterns in `frontend/components/rds/care/*`. All copy from translation namespaces; all colors/type via RDS utilities.

Legend for each spec: **V** variants · **S** sizes · **St** states · **K** keyboard · **A** accessibility · **RTL** · **R** responsive · **U** usage · **X** anti-patterns.

---

## A. Foundations

### A1. Button

- **Purpose**: trigger actions. The only element allowed to be a primary CTA.
- **Anatomy**: label (`text-button`) + optional leading/trailing icon (16 px, `gap-2`); spinner replaces leading icon while pending.
- **V**: `primary` (bg-inverted/brand-800 hover/brand-900 active, text-inverse) · `secondary` (bg-surface, border-line, hover bg-hover + border-strong) · `ghost` (transparent, hover bg-hover) · `danger` (solid `status-danger`, white text; confirm dialog required before render of its action) · `link` (text-brand underline-offset-2). Icon-only is `IconButton` (A2), not a Button variant.
- **S**: `sm` h-32 px-3 · `md` h-40 px-4 (default) · `lg` h-44 px-5 (customer/caregiver surfaces). Radius `rounded-control` (pill `rounded-full` only for filter chips).
- **St**: per RDS 02 §3 interactive table. Pending: `aria-busy`, disabled, spinner 16 px, label kept (no layout shift). Disabled: `bg-sunken text-disabled` + real `disabled`.
- **K**: native button/link semantics; Enter/Space activate; focus ring per tokens. `link` variant renders `<Link>` when internal.
- **A**: disabled buttons keep accessible name; loading announces via `aria-live="polite"` region on the action container, not per-button.
- **RTL**: icon order via logical flex (leading = inline-start); directional icons mirrored per RDS 07 §5.
- **R**: in mobile form footers, primary stretches full width; list-page header actions compress to icon buttons with overflow menu.
- **U**: one primary per view; secondary for the common alternative; ghost inside cards/toolbars; danger only for destructive (cancel visit, revoke grant, suspend tenant).
- **X**: primary twice on a page; buttons that look disabled but are clickable; icon-only without accessible name; `danger` for mere "remove filter".

### A2. IconButton

- 32/40 px square, `rounded-control`, single 18–20 px icon, mandatory `aria-label` (translation key) + optional tooltip. Variants mirror Button secondary/ghost. Used for header actions, table row actions, drawer close.

### A3. Input / Textarea

- **Purpose**: single/multi-line text entry.
- **Anatomy**: label (`body`, above, mandatory — docs 10 "explicit visible labels") · control (h per size, `bg-surface border border-line rounded-control px-3`, focus ring) · optional inline-start/trailing adornment (icon or unit, `text-secondary`) · helper text (`bodySm text-secondary`) · error message (`bodySm`, `status-danger-ink`, with 14 px alert icon).
- **V**: default · with adornment(s) · read-only (bg-sunken, no border change) · invalid (border-danger + message + `aria-invalid`).
- **S**: sm 32 / md 40 / lg 44 (customer+caregiver default lg).
- **St**: focus (2px brand ring), hover (border-strong), disabled (sunken/disabled text), invalid, read-only. Never validate on blur per-keystroke; validate on blur + on submit (RDS 08 §4).
- **K/A**: label linked via `for/id`; `aria-describedby` → helper + error ids; error announced by submit summary pattern (Forms, A9).
- **RTL**: adornment sides flip via logical classes (`start-3`, `end-3`); text-align follows direction; LTR-only fields (email, phone codes) set `dir="ltr"` on the input with label staying in flow direction.
- **X**: placeholder-as-label; floating labels; red-only invalid signaling (icon + text always); masking that fights paste.

### A4. Select / Combobox

- **Select**: native-feel listbox via Radix `Select`; trigger styled like Input, h-40; menu `bg-surface rounded-card shadow-2 border-line` (`--z-dropdown`), item h-36 hover bg-hover, selected check at inline-end. Use for ≤15 static options.
- **Combobox**: Radix `Combobox` pattern (input + filtered listbox); async search for patients/caregivers/services (server-scoped, debounced 250 ms, shows count + "refine" hint beyond 50); empty state "no matches"; loading row of skeletons; selected value renders as dismissible chip in multi mode.
- **K**: full arrow/Enter/Esc/Home/End via Radix; typeahead both scripts; `aria-expanded`, `aria-activedescendant` handled by primitive.
- **RTL**: menu opens aligned to inline-start; checkmark side flips.
- **U**: Combobox for entity pickers (patient link, caregiver filter); Select for enums (status filters, role).
- **X**: loading all options eagerly for large sets; allowing free text where the server validates enums.

### A5. Checkbox, RadioGroup, Switch

- Radix primitives. Control 20 px (16 px in dense tables), radius `rounded-sm` (checkbox), full (radio/switch). Selected: bg-inverted fill, white check/dot. Focus: 2 px ring with 2 px offset on the control, plus group label linked.
- Switch: 36×20 track, 16 px thumb; `aria-label` mandatory when no visible text; used for notification policy toggles and settings, **not** for state that requires a separate submit (those use checkboxes + Save).
- Checkbox lists (task outcomes, filter facets) support tri-state parent (all/some/none). Keyboard: Space toggles; radios roving tabindex.
- RTL: geometry symmetrical; switch "on" direction follows inline-end (thumb travels toward inline-end) — Radix handles with logical CSS.

### A6. Badge / StatusBadge / Chip

- **Badge**: count/metadata pill: h-20 px-2 `bodySm`, `bg-sunken text-secondary rounded-full`; notification counts use `status-danger` solid white text (≥4.5:1 at 12 px semibold — danger white 4.8 ✓), cap "99+".
- **StatusBadge**: the **only** renderer of domain states. Anatomy: dot or icon (12 px) + localized label, chip per RDS 03 §B3 mapping (`*-subtle` bg, `*-ink` text, `*-border` hairline, `rounded-sm`, px-2 h-22). Props: `{ kind: 'visit'|'request'|'quote'|'plan'|'change'|'tenant', value }` — the mapping lives in one typed module, never in screens. PLANNED adds dashed icon `circle-dashed`; IN_PROGRESS uses brand chip; MISSED distinct icon from CANCELLED (hue alone forbidden).
- **Chip (filter chip)**: interactive pill, selected = brand-50/brand-700/brand-200 border; removable chips show × (IconButton sm) with accessible name "remove filter X".
- **A**: status never conveyed by color alone (label always); decorative dot `aria-hidden`.
- **X**: ad-hoc hex chips per screen; StatusBadge for non-domain states (use Badge); truncating status labels (wrap instead).

### A7. Tooltip

- Radix Tooltip; `bodySm`, `bg-neutral-900 text-white rounded-sm px-2 py-1 shadow-2` (`--z-tooltip`); delay 300 ms open, instant close; never receives focus itself; escapes via portal. Used only for: truncated text, icon-only affordances, term definitions. Never for information required to complete a task (make it visible text instead). Arrow hidden; collision-aware flip; RTL positions flip automatically via logical anchors.

### A8. Skeleton

- `bg-sunken rounded-sm animate-pulse` (pulse 1.5 s, disabled under reduced motion — replaced by static `bg-sunken` blocks, docs 10). Shapes: text line (h-12/20), control (h-40 rounded-control), card (rounded-card), table rows (row height per density), avatar circle. Compose to mirror final layout (no spinners for regions ≥300 ms expected). `aria-hidden` + container `aria-busy="true"` + visually-hidden "loading" text announced once.
- **X**: skeleton for <150 ms responses (flash); spinners inside tables; shimmer gradients (use pulse).

### A9. Alerts (inline) and Toasts

- **Alert**: banner `rounded-card border p-4` with 20 px icon + title (`body` 600) + description (`bodySm`) + optional actions. Tones map to statuses (info/warning/success/danger/neutral) using the subtle triad. Roles: danger/error → `role="alert"`; others `role="status"`. Placed: top of content region for page-level; inside cards for section-level.
- **Toast**: transient confirmation of completed mutations, bottom-inline-start stack (`--z-toast`), 5 s dismiss, hover pauses timer, max 3 visible then collapse counter, close IconButton, `role="status"`. Never the only record of a failure — failures that need action render inline; success toast + persistent state change (row chip, timeline entry).
- **U split**: system-wide banners (tenant suspended, clinical approval pending) = Alert; "quote v2 sent" = Toast.
- **X**: stacking errors as toasts; toasts for destructive confirmations (use Dialog).

### A10. Forms and validation (pattern, applies to all field components)

- Layout: label top; optional description; control; helper/error; vertical rhythm 16 px; two-column only ≥1024 px for short paired fields (name parts), never for long forms.
- Required: mark with localized asterisk + legend explaining it; submit-time summary block at top (`role="alert"`, links jump to fields) + per-field messages tied via `aria-describedby`.
- Draft preservation: client-persisted drafts (sessionStorage) for care-plan editor and request wizard (docs 10 "preserve draft where safe"); explicit "restored draft" notice with discard action.
- Submission: button pending state; double-submit guarded; server errors mapped to fields where the contract defines them, else form-level Alert with error code localized at UI boundary (docs 10).
- Unsaved-changes guard: leaving an edited form via nav prompts Dialog "discard changes?" (default = stay).

---

## B. Data and enterprise components

### B1. DataTable (the workhorse)

- **Purpose**: primary staff surface for queues/lists (requests, quotes, patients, caregivers, visits, change requests, tenants, reports).
- **Anatomy**: toolbar (search input, filter controls, view options, bulk-actions bar) · header row (`text-table-header text-secondary bg-sunken`, sticky `top-56` under header, `--z-sticky`) · body rows (h-40 compact / h-48 comfortable, `border-b border-line-subtle`, hover bg-hover) · row selection checkbox column (bulk contexts) · footer (pagination + result count + density note).
- **Features**: sortable columns (ascending/descending/none tri-state, sort icon + `aria-sort`); column visibility/width presets per view (persisted per user); row click opens detail (RDS 06 pattern); keyboard row navigation optional but header controls fully Tab-reachable; cell renderers: StatusBadge, `tabular-nums` numerics, truncation with tooltip, action IconButton cluster (max 3 + overflow).
- **St**: loading = 8 skeleton rows; empty = EmptyState inside table body; error = Alert above table with retry; partial refresh keeps scroll.
- **Bulk bar**: appears in toolbar row when selection > 0: "N selected · [primary bulk action] [clear]"; per-item outcome results render in a result Dialog (success list / conflict list with reasons — required by BR bulk assignment per-visit outcomes, docs 03 F07).
- **A**: `<table>` semantics with `<caption class="sr-only">`; `aria-sort` on headers; sortable headers are buttons; selection checkbox labelled "select row {n}"; sticky header keeps scope.
- **RTL**: column order mirrors; sort/expand chevrons mirror; inline-start sticky first column for mobile scroll.
- **R**: <768 px: either (a) card list via row template per table type, or (b) horizontal scroll with sticky identity column + fade edge + "swipe" hint; choice is fixed per table in RDS 09 (queues = card list; wide financial tables = scroll).
- **U**: server-driven pagination/sort/filter (URL query as source of truth → shareable, back-button safe); client transform never re-filters authorization-truncated data silently.
- **X**: client-side sorting of paginated server data; hiding columns as the only mobile answer; putting long prose in cells (link to detail instead); nested tables.

### B2. Filters and search (pattern)

- Filter bar: Combobox/Select/DateRange/Chip set, right-aligned "Clear all"; applied filter count chip on mobile entry button; every filter reflected in URL query; "no results" empty state offers "clear filters".
- Saved views are **not** in MVP scope (defer with advanced reporting) — do not build.

### B3. Pagination

- Server-paginated: page size 25 (staff) / 10 (customer portal); controls: prev/next IconButtons + "page x of y" + page-size select (10/25/50); numbered buttons max 5 window. `nav` landmark, `aria-label="pagination"`, current page `aria-current="page"`. Cursor-based where API contracts define it (rendered identically as prev/next).

### B4. Tabs

- Radix Tabs; underline style: 2 px brand-700 active indicator on `border-b border-line` rail; label `body` 500; scrollable rail with fade edges when overflow; `arrow-key` navigation, automatic activation. Used for: entity detail sections (patient profile: overview/visits/documents/access), settings groups, quote version comparison. Not used as a wizard substitute.

### B5. Detail panel

- Desktop: 420 px sticky side panel (list+detail composition, RDS 04 §6) or full-page detail for complex entities. Content order: identity header (title + StatusBadge + key facts) · primary actions · sections (`cardTitle`) · activity/audit timeline. Panel close returns focus to the triggering row.
- Mobile: full-screen route (not drawer) for entity detail; drawer reserved for quick previews/confirmations.

### B6. Drawer (sheet)

- Radix Dialog side variant; width 480 (sm) / 560 (md); inline-edge slide 240 ms ease-standard; scrim; focus trap + return; `Esc` closes (with unsaved-changes guard if form inside); `--z-drawer`. Used for: quick visit preview, notification panel, filter sheet (mobile), candidate picker summary.

### B7. Dialog

- Radix Dialog; max-w sm 440 / md 560 / lg 720; `rounded-overlay shadow-3` (`--z-modal`); anatomy: title (`cardTitle`), description, content, footer (secondary left [cancel], primary right [confirm] in logical order — confirm never auto-focused for destructive; focus lands on cancel/description).
- **Destructive confirmations** (docs 10): state consequence explicitly ("Visit on 12 Nov 09:00 will be cancelled; the caregiver is notified."), require reason via Select/Textarea when the domain requires one (cancellation reason; duplicate-ignore reason; decline revision), disable confirm until valid.
- Wizard/multi-step uses dedicated Stepper pattern (RDS 06 §13), not chained Dialogs.

### B8. Date & time pickers

- **DatePicker**: month grid, week starts **Sunday** (ar/en both — Saudi working week; confirm with owner, listed as open decision), weekday initials localized, today outlined, selected filled brand, disabled dates struck (past, beyond plan horizon, tenant cutoffs), month/year steppers, "today" action; `role="grid"` keyboard model (arrows, PgUp/Dn month, Home/End week).
- **TimePicker**: 15-min step list (native-feel), 24 h; DST-nonexistent local times are rejected server-side — UI pre-validates marked transition days with inline warning (docs 03 F07 edge).
- **DateRangePicker**: two-month popover ≥768 px, single-month +ends below; used for plan period (cap 60 days — show live remaining-day counter "42 of 60 days used"), reports.
- All display tenant timezone; entering times means tenant-local wall time (labeled).

### B9. Timeline (activity/audit history)

- Vertical list: inline-start rail (2 px `border-line-subtle`) with 10 px dots (status-colored per B3 mapping where the entry is a state change), entry = event label (`body`), actor + timestamp (`bodySm text-secondary`, `tabular-nums`, tenant tz), optional reason/note quote block. Append-only rendering; corrections show as new entries ("correction added by …", original preserved — BR-VST no-overwrite law). Sorted newest-first with "show earlier" pagination. Screen-reader: `<ol>` with full sentences (date + actor + event), not visual-rail-dependent.

### B10. Calendar (scheduling surface)

- **Views**: week (default, staff) and day; month view is **out of V1 scope** (docs 10 names week/day only). Header: range label, today button, prev/next (mirroring chevrons), view switch, timezone indicator, caregiver filter multi-select.
- **Grid**: time axis `bodySm` 30-min rows (8 px per minute → 240 px/h compact); columns per day (7) or per caregiver (resource mode for candidate picking); now-line (brand 2 px + dot) only on current day.
- **Visit block**: 4 px inline-start bar colored by visit state (B3) + time range (`tabular-nums`) + patient/service label (privacy-filtered by viewer) + caregiver avatar when resource mode; PLANNED = dashed border + warning bar; SCHEDULED = solid; IN_PROGRESS = brand + pulse dot; CANCELLED = 40% opacity + strikethrough; MISSED = danger + triangle. Click → VisitDetailPanel (drawer on calendar).
- **Unassigned lane**: PLANNED visits for the visible range appear in a collapsible top lane (drag-free assignment: select visit → open candidate picker; drag-and-drop is deferred — keyboard/pointer paths must be equal, and V1 optimizes decision speed over drag theatrics; this also satisfies WCAG dragging-alternative 2.5.7 by default).
- **States**: loading skeletons per column; empty day = "no visits" watermark only in day view; error banner with retry; conflict shading (caregiver leave = hatched `warning-subtle` block, non-interactive with tooltip).
- **A**: grid is supplemented by an accessible list view toggle ("agenda") — the calendar is visually primary, the agenda is the screen-reader/keyboard-simple path (both read same data).
- **RTL**: time axis on the inline-start; day order mirrors (Sat→Sun right-to-left in ar); now-line unchanged.
- **X**: color-only PLANNED vs SCHEDULED (dash+label enforced); silent clipping of overlapping visits (lane-stack them); client-side invention of buffer visuals (buffer shown as gap annotation only where API exposes it).

### B11. KPI card

- Compact stat: label (`bodySm text-secondary`) + value (`text-stat tabular-nums`) + optional delta row + optional sparkline. Card `rounded-card border-line p-4`; height uniform; 4-up on desktop, 2-up tablet, carousel-less 2×2 on mobile. Max 4–6 per dashboard. KPIs link to the filtered list behind them (e.g. "Unassigned visits 7" → visits list pre-filtered PLANNED). Numbers come from defined report endpoints (numerator/denominator rules live in docs 01 "success signals" — UI renders, never computes business metrics client-side).

---

## C. Healthcare coordination patterns (`components/rds/care`)

### C1. PatientSummaryHeader

- **Purpose**: consistent identity banner at top of every patient-scoped screen (profile, plan editor, visit detail).
- **Anatomy**: avatar (initials; photo out of V1) · name (`cardTitle`) · key facts row (`bodySm text-secondary`): age/DOB, ID (mono, copyable), tenant-scoped since-date · StatusBadges (active grants count, care plans ACTIVE count) · inline actions (granted-role-dependent: new request, new plan, edit).
- **Privacy**: renders only fields the viewer's scopes allow (VIEW_BASIC minimum); caregivers see name + visit-relevant facts only; customers never see this component (portal uses its own family card).
- **X**: embedding full address/phone by default (progressive disclosure via profile); showing duplicate-suspect hints to unauthorized roles.

### C2. CarePlanOverview

- Card summarizing a plan version: service, status chip (B3 plan mapping), period with day-count (x/60), weekdays + time pattern, version (`v3` mono), clinical approval state (banner if pending/rejected — approval identity shown), generated-visits health (assigned x / unassigned y → link to filtered list). Version switcher (Select) swaps snapshot content read-only; "compare with previous" opens diff Dialog (docs 03 F07 preview requirement). Actions: edit (creates draft vN+1), pause, cancel — each gated + confirmed per domain rules.

### C3. VisitStatusBadge → see A6 (canonical).

### C4. VisitDetailPanel

- **Audience-aware**: staff (full), caregiver (assigned tasks + minimum patient info), customer (summary projection via portal components — never this panel raw, docs 10 "distinct response projections").
- Sections: state header (StatusBadge + appointment window `tabular-nums` + tz) · assignment (caregiver + assignmentHealth chip) · tasks checklist with outcomes (DONE / NOT_DONE+reason visible) · actual start/end (server times, "recorded by server" hint) · notes (read-only post-completion; append-only correction entry) · change requests pending (warning banner linking) · timeline (B9).
- Actions by state, rendered strictly from a typed eligibility map (`PLANNED: [assign, edit]`, `SCHEDULED: [reassign, cancel, …]`, `IN_PROGRESS: [view only for coordinator]`, `COMPLETED: [review, addendum]`) — no invisible buttons that 404.

### C5. CaregiverAvailabilityView

- Weekly grid (7 days × intervals, A10: single interval/day UI): cells show interval chips; dated exceptions/leave rendered as hatched warning rows on the date list beside the grid; qualification/service authorizations summarized as Badge list with expiry dates (expiring <30 days = warning chip). Read-only for coordinators (edit is admin/caregiver-self per permissions); leave creation opens Dialog with overlap preview ("3 future SCHEDULED visits affected" + list + links, F10).

### C6. AssignmentDialog / CandidatePicker

- **Purpose**: coordinator confirms caregiver for a visit (AC-05/AC-06). Two-step: candidates list → confirm.
- **Candidates table**: columns: caregiver (avatar+name), rank reason chips (`primary preference`, `lighter load`, `same area` — explicit soft-ranking labels, never "AI suggested"), availability window, load today/week, conflict state. Hard-filtered server-side (BR-SCH 1–5); UI adds zero filtering of its own beyond display; a caregiver absent from the list is simply not eligible (no red "disqualified" rows — anti-enumeration of staff deficiencies).
- **Conflict surfacing**: if a candidate became ineligible after list load, confirm returns the actionable conflict error (keep dialog open, show Alert with server reason; never mutate).
- **Confirm**: Dialog footer shows visit summary + buffer note; pending spinner; success → row/visits update to SCHEDULED + toast + audit entry visible in timeline.
- **Bulk mode**: from DataTable selection; results Dialog lists per-visit committed/failed + reasons (docs 03 F07).
- **A**: fully keyboard operable (list = listbox semantics, Enter opens confirm); "suggested" order announced as ordered list with reasons.
- **X**: client-side feasibility math; auto-assign; showing substitute candidates only after primary fails silently (prefer chip is informational, not a hidden gate).

### C7. ApprovalWorkflow (reusable approval banner)

- Variants: quote acceptance (customer side), change-request decision (coordinator), clinical instruction approval (qualified reviewer only), revision handling.
- Anatomy: Alert-style banner (tone per state) + context lines (entity, requester, urgency/late flag) + actions. Rules: approver identity + timestamp recorded and shown after action; declining requires reason; approval of change requests re-checks conflicts server-side and surfaces actionable conflict errors (BR-CHG); while a revision is PENDING the accept button renders disabled with explanation tooltip (BR-QTE).
- Clinical approval banner additionally states scope ("approves this exact plan version") — capability-gated rendering, `*` permission (docs 05 matrix).

### C8. ConflictIndicator

- Inline warning composition for scheduling conflicts (buffer overlap, leave overlap, DST, plan overlap): icon + localized reason + affected entity links + "resolve" primary (→ candidate picker / reschedule). Used in: assignment confirm errors, leave preview, change-request approval failure, generation preview. Never auto-resolves; never silently rewrites appointments (BR-SCH buffer scan flags only).

### C9. EmptyState

- Composition: 48 px illustrative icon (`text-ink-subtle`, no illustrations/photos in V1), title (`cardTitle`), one-line body (`body`), optional primary action. Three standard copies per context: nothing-yet (with creation CTA when authorized), no-results (with clear-filters), no-access (staff: explicit "you don't have permission" panel with request-access hint; customer/caregiver: section simply absent — docs 10 sensitive-section law).

### C10. NotificationPanel / NotificationItem

- Bell popover (480 px drawer on mobile): grouped Unread/Earlier; item = unread dot + icon by event kind (quote, visit, request, system) + title + relative time; click navigates to the authorized entity route (deep link dies gracefully to no-access panel if grant revoked). Mark-all-read, per-item mark-read on focus. Copy is generic/safe (no PHI — BR-NOT); privacy note: titles never contain patient details, entity names resolved after authorization.

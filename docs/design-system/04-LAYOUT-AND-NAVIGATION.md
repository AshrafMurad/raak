# RDS 04 — Layout and Navigation

**Status: PROPOSED** · Implements the shell requirements of docs 10 ("Page inventory and high-level layout") for all four surfaces. Tokens: RDS 02. Screens using this shell: RDS 09.

## 1. Application shell anatomy (workspace, ≥1024 px)

```
┌──────────┬────────────────────────────────────────────────────────────┐
│          │  Header (h-56, sticky, bg-surface, border-b line-subtle)   │
│  Sidebar │  [menu⇱] [breadcrumb]                [search] [🔔] [user]  │
│  w-256   ├────────────────────────────────────────────────────────────┤
│  (or 64  │  Page header (pt-24/32)                                    │
│  rail)   │  pageTitle · description ·            [secondary] [PRIMARY]│
│  bg-     ├────────────────────────────────────────────────────────────┤
│  surface │  Content (bg-canvas, max-w-1440, px-24/32, pb-48)          │
│  border-r│  12-col grid, gap-16/24; cards bg-surface rounded-card     │
│          │  border-line shadow-1                                       │
└──────────┴────────────────────────────────────────────────────────────┘
```

- Sidebar: `bg-surface`, right edge in RTL / left in LTR (logical `border-inline-end`), width 256 px expanded / 64 px icon rail. Collapsed state is a per-user preference persisted client-side; **never** the default on first use.
- Header is sticky (`--z-sticky`); content scrolls under it with `shadow-2` only while scrolled.
- Content column: `max-w-[1440px]` centered; below 1440 px it fills with 24 px gutters; below 768 px gutters are 16 px.
- Surfaces without a sidebar (auth pages, guest request wizard, quote view): centered single column, max 480–640 px, wordmark header, locale switch (existing `PageShell` pattern is the seed).

## 2. Primary navigation (sidebar)

### 2.1 Structure

Three stacked regions, each visually separated by `border-line-subtle`:

1. **Workspace context** (top, always expanded even in rail): agency wordmark/avatar + name + tenant status chip (ACTIVE only when relevant; PENDING/SUSPENDED renders banner instead — RDS 06 §15). For PlatformOperator: "Raak Platform" + operator badge.
2. **Primary sections**: flat list of destinations for the acting role (§2.3). Item = icon (20 px) + `sidebarLabel`; height 40 px; active = `bg-selected` + `text-brand` + 3 px inline-start indicator bar (brand-700, logical `border-inline-start`, mirrors in RTL); hover = `bg-hover`.
3. **Secondary/footer**: Notification center link, Settings (role-gated), user entry (opens account menu), collapse toggle.

### 2.2 Behaviors

- Rail (collapsed 64 px): icons only, `aria-label` from same translation key; flyout popover (hover/focus, `--z-dropdown`) shows label; active dot under icon.
- Badge counts: request queue (NEW+AWAITING_CUSTOMER), change requests PENDING, notifications unread (cap "99+"). Count = server truth fetched with nav data; zero renders nothing.
- Keyboard: sidebar is a `<nav>` with list semantics; items are links (real `<a>`), Tab-reachable, active item `aria-current="page"`. `Alt+S` skips focus to sidebar, `Alt+C` to content (skip link also provided — RDS 08).
- Mobile (<1024 px): sidebar becomes an overlay drawer (scrim `--raak-bg-scrim`, `--z-drawer`, 280 px, slide 240 ms `ease-standard`), opened by the header menu button, closed by scrim/Esc/`Alt+M`; focus trapped; route change closes it. Between 768–1023 px the drawer may persist as a "mini" pinned rail per user preference; default is drawer.

### 2.3 Navigation inventory per principal (permission-derived; hide what's unauthorized)

| Principal | Sidebar destinations (order) |
|---|---|
| AgencyOwner / AgencyAdmin | Dashboard · Service requests · Quotes · Patients · Caregivers · Care plans · Visits · Change requests · Reports · Settings |
| CareCoordinator | Dashboard · Service requests · Quotes · Patients · Caregivers · Care plans · Visits · Change requests · Reports (Settings hidden unless granted) |
| Caregiver (own portal surface, not workspace shell) | My visits (Today) · Past visits · My profile |
| Customer (portal shell) | Home · Services · My requests · My family · My visits · Notifications · Account |
| PlatformOperator (separate realm, minimal shell) | Tenants · Operator audit |

Rules: navigation renders from a typed config keyed by role + capabilities (`clinical_approve` adds nothing to nav but unlocks review actions inside plans/visits). Roles never appear as separate nav trees; one tree, capability-filtered.

## 3. Top header

Single row, 56 px, `bg-surface`, contains (order, logical):

1. Menu toggle (mobile) / collapse toggle (desktop, icon-only 32 px).
2. **Breadcrumbs** (see §4) — hidden on <768 px (page header carries context).
3. Spacer.
4. **Global search** (≥768 px): trigger button (⌘K / Ctrl+K hint) opening a command palette (`--z-modal`): searches within tenant scope only — patients, caregivers, requests/quotes by ID or name, visits by date — results grouped, each entry routed through authorization (server-filtered; UI shows "no results" for both "doesn't exist" and "not allowed" — anti-enumeration, docs 05 rule 3). Guest/customer portals get **no global search**.
5. **Timezone indicator** (staff scheduling-relevant pages): compact `Asia/Riyadh` label, links to nothing (informational, prevents "why is the visit at 9?" confusion).
6. **Notifications bell**: unread count badge; opens notification panel (RDS 05) or routes to notification center page on mobile.
7. **User account menu**: avatar (initials, `--radius-full`, brand-50 bg + brand-700 text) → menu: profile, language switch (mirrors `PageShell` switch, preserves current path), logout, "logout all sessions" (staff only). Shows principal type + agency name; role label localized.

Header never duplicates page actions; page-level CTAs live in the page header (§5).

## 4. Breadcrumbs

- Pattern: `Workspace ▸ Section ▸ Entity`. Section links to list view; entity node shows title/ID and is `aria-current="location"`, not a link.
- Long names truncate to 24 chars + ellipsis with full text in `title`/tooltip; max 4 levels, collapsing middle levels into an overflow menu beyond that.
- Rendering: `bodySm`, `text-secondary`; separators are chevron icons that **mirror in RTL**; separator is `aria-hidden`, list is `<ol>` with `aria-label`.
- Entity titles are privacy-filtered like any other render (a coordinator sees patient name; a caregiver breadcrumb shows visit date + service, not patient name beyond minimum necessary — docs 05 rule 6).

## 5. Page header pattern (every workspace page)

```
[row 1] pageTitle (text-page-title)                    [ghost/secondary actions…] [PRIMARY ACTION]
[row 2] description (body, text-secondary, optional)
[row 3] contextual: tabs | filters | status summary chips (module-specific, RDS 06)
```

- Height is content-driven; sticky is **not** used (tables get their own sticky header instead).
- Exactly one primary button. On mobile, primary action moves to a sticky bottom bar **only** for wizard/creation flows; list pages keep it in a header row under the title.
- Destructive or global actions never sit in the page header (they belong to the entity context).

## 6. Content grid

- 12-column grid, `gap-4` (16 px) mobile → `gap-6` (24 px) desktop.
- Standard compositions:
  - **List + detail**: list table (8 cols) + detail panel (4 cols, sticky `top-72`) on desktop; detail becomes a drawer/full page on <1280 px. Used by request queue, change requests, candidate picker.
  - **Stacked cards**: single column of `rounded-card` sections, max 960 px (patient profile, settings).
  - **Dashboard mosaic**: KPI band (4 stat cards) + 2:1 split (operational list : secondary list); never more than 6 cards per dashboard (docs 10 density rule).
- Card: `bg-surface rounded-card border border-line shadow-1`; header row (cardTitle + action) with `border-b border-line-subtle` when the card body scrolls.

## 7. Workspace/organization context

- One session = one tenant (docs 05). The shell therefore has **no tenant switcher**; context region displays identity, not choice.
- Tenant lifecycle is reflected shell-wide: PENDING_APPROVAL → full-width warning banner under header ("workspace read-only until activated", links disabled); SUSPENDED → sessions rejected server-side; UI shows neutral suspended notice page (AC-09).
- Locale switch lives in the account menu (authenticated) and header (public pages), preserving the current path; capability URLs (verify-email, reset, invitation) preserve their token across switch — behavior already implemented in `PageShell`, generalized as the rule.

## 8. Loading, empty, error shells

Every route region renders one of four states; no layout shift between them (reserve heights):

| State | Rendering |
|---|---|
| Loading | Skeleton shapes matching final layout (RDS 05 §Skeleton); route-level: sidebar renders instantly (static shell), content skeletons |
| Empty | EmptyState component (icon, one-line explanation, primary next action when authorized); differentiates "nothing yet" from "no results for filters" from "no permission" (staff sees explicit no-access panel, RDS 06 §16) |
| Error | Inline alert at content top (`role="alert"`), retry action preserving form/scroll state; never a dead screen; 403/404 use dedicated panel pages |
| Success | Toast (transient, `--z-toast`) + persistent state change; server-owned transitions wait for the server (P1) |

## 9. Mobile layouts (<768 px)

- Sidebar → drawer (§2.2); breadcrumbs hidden; header keeps search icon (full-screen search), bell, avatar.
- Tables → card list or horizontal scroll with sticky first column (RDS 05 §DataTable); filters collapse into a bottom-sheet panel with an active-filter count chip.
- Page header stacks: title, then description, then actions row (secondary as icon buttons with labels in overflow menu "⋯").
- Bottom tab bar is **not** used in the workspace (staff context is desktop-first); the caregiver portal uses its own bottom tab bar (RDS 09 §6).
- All tap targets ≥44 px; page transitions are content-only (no full-screen slide).

## 10. Shell responsibilities summary (what the shell owns vs pages own)

| Shell owns | Page owns |
|---|---|
| Sidebar, header, breadcrumbs, search, notifications trigger, account menu, tenant banner, skip links, density wrapper, RTL direction | Page title/description/actions, tabs, filters, data regions, entity state, toasts for its mutations, empty/loading/error of its regions |

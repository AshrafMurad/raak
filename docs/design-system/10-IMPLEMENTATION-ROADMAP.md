# RDS 10 — Implementation Roadmap

**Status: PROPOSED** · Sequenced implementation of RDS 01–09. Documentation-first: nothing in this file has been applied to application code. Brand values (D21–D23, docs 10, `frontend/app/tokens.css`) are locked and are never "phased" — every phase works inside them.

## 1. Current state (verified audit, 2026-10-29)

Implemented: Sprint 0 (fonts, tokens.css, i18n dictionary architecture, locale routing, capability-token pages) and Sprint 1 (auth flows, platform tenants admin). Stack confirmed: Next.js 16 App Router, React 19, Tailwind v4.1, TypeScript strict; **no shadcn/Radix/lucide installed yet**. No workspace/customer/caregiver shell exists — only `PageShell` (auth/public pattern).

### 1.1 Strengths to preserve

- `tokens.css` mirrors docs 10 exactly; `@theme inline` maps locked names to utilities (`bg-brand`, `text-ink`, …).
- `html lang/dir` set once from the locale segment; `LOCALE_DIRECTION` single mapping (ADR-0005).
- Bidi hygiene already practiced: `dir="ltr"` on slug/UUID cells, `text-start` tables, `dir` isolation on mixed content.
- Capability-token locale switch preserves path + token; typed dictionaries with `en: typeof ar` parity check.
- Server-state honesty: loading/error/unauthorized branches, `role="status"/"alert"` usage, no optimistic success.

### 1.2 Findings (objective violations of docs 10; classified)

| # | Finding | Location | Class |
|---|---|---|---|
| F-1 | Raw Tailwind palette bypasses status tokens (`amber-300/50`, `emerald-300/50`, `red-300/50`, `red-50`, `slate-950/40`) | `tenant-admin.tsx` status chips, modal scrim, notice | High |
| F-2 | Hand-rolled modal: no focus trap, no focus move/return, manual `z-50` | `tenant-admin.tsx` action dialog | High |
| F-3 | Action buttons ~30 px effective height (`text-xs` + `py-1.5`) — below touch target law | `tenant-admin.tsx` | High |
| F-4 | Raw Tailwind type steps (`text-sm/base/lg/xl/xs`) instead of docs-10 scale | `page-shell.tsx`, `auth-forms.tsx`, `tenant-admin.tsx` | Medium |
| F-5 | `uppercase tracking-[0.14em]` eyebrow applied unconditionally — breaks Arabic no-tracking law (docs 10) | `page-shell.tsx` | Medium |
| F-6 | Non-token radius/shadow: `rounded-lg`, `rounded-xl`, `shadow-xl` | `tenant-admin.tsx`, `auth-forms.tsx` | Medium |
| F-7 | Success notice uses raw emerald pair (semantic misuse: brand/info tint is correct) | `auth-forms.tsx` Notice | Low |
| F-8 | Literal `'…'` pending label (i18n leak) | `tenant-admin.tsx` | Low |

Recommendations (not violations): replace counts line `0 / 100` with localized result-count caption; move refresh action into DataTable toolbar grammar when Phase 4 lands.

### 1.3 Debt register (each item closed by a phase below)

| Debt | Files | Closed in |
|---|---|---|
| F-1…F-3, F-6…F-8 token/component violations | `tenant-admin.tsx`, `auth-forms.tsx` | Phase 2 |
| F-4, F-5 type scale + Arabic eyebrow | `page-shell.tsx` | Phase 2 |
| Semantic-token Tailwind extension (RDS 02 §10) not yet in `globals.css` | `globals.css` | Phase 1 |

## 2. Target state

All four surfaces (workspace, customer portal, caregiver portal, operator console) built from RDS tokens + one component library (shadcn/Radix), one status mapping, one data-state grammar — passing RDS 07 §8 and RDS 08 §7 gates in `ar` and `en`, desktop/tablet/mobile.

## 3. Phases

Prompt-proposed sprints 1–7 map to phases 1–6 plus 7–8 (QA split into hardening and CI). Each phase ends runnable: lint + typecheck + tests green before the next begins.

### Phase 1 — Foundations (tokens, lint, theme)
- **Objective**: every RDS 02 semantic token exists and is enforced.
- **Scope**: extend `tokens.css` (primitives, semantic, status derivatives, component tokens, z-index, motion); extend `@theme inline` in `globals.css` (RDS 02 §10 mapping incl. 12 type keys); density wrapper utilities; token lint (raw hex/`rgb(`/`hsl(` outside `tokens.css`, banned utilities `text-sm|base|lg|xl|xs`, `bg-white`, palette classes) + physical-direction lint (`left/right` physical CSS) as ESLint/CI step; contrast-audit script runnable locally (prints RDS 03 §B2 matrix).
- **Files**: `frontend/app/tokens.css`, `frontend/app/globals.css`, lint config, `scripts/` (lint/contrast).
- **Dependencies**: none (no new packages).
- **Acceptance**: `npm run lint`/`typecheck`/`test` green; lint fails on a planted violation; contrast script output matches §B2; existing pages render unchanged (aliases preserve locked names).
- **Risks**: Tailwind v4 `@theme inline` ordering pitfalls → verify utility generation for every semantic name before proceeding.

### Phase 2 — Shared components + debt closure
- **Objective**: foundational primitives (RDS 05 §A) shipped; all F-1…F-8 debt closed.
- **Scope**: owner-approved installs (see §4): `shadcn` CLI components (button, input, textarea, select, checkbox, radio-group, switch, badge, avatar, tooltip, popover, alert, toast/sonner, skeleton, separator, card, dialog, sheet, tabs, breadcrumb, dropdown-menu, form/field), `lucide-react`, `cva/clsx/tailwind-merge`, restyled to RDS variants; RDS composites `StatusBadge` + single typed status-mapping module, `EmptyState`, `Icon` mirror wrapper (RDS 07 §5); migrate `page-shell.tsx`, `auth-forms.tsx`, `tenant-admin.tsx` onto tokens/primitives (incl. Latin-only eyebrow helper, Dialog for tenant actions, ≥44 px actions).
- **Dependencies**: Phase 1; **owner approval O-1**.
- **Acceptance**: debt register §1.3 empty; token lint passes repo-wide; every migrated screen keeps current behavior (auth flows, tenant activate/suspend incl. reason validation) — verified by existing Vitest suites + manual pass; `ar` screenshot shows no uppercase/tracking on eyebrow.
- **Testing**: unit tests for StatusBadge mapping exhaustiveness (every state × kind); component tests for focus trap/return on Dialog.
- **Risks**: dependency approval delay (fallback: hand-rolled interim primitives keep tokens, but Dialog a11y argues strongly for approval); shadcn style presets conflict with tokens → install unstyled/new-york base and restyle via `cva` per RDS.

### Phase 3 — Application shell
- **Objective**: RDS 04 shell exists for workspace + operator console; portal shells defined.
- **Scope**: `AppShell` (sidebar 256/64 + rail flyouts + mobile drawer + role/capability-filtered nav config), top header (breadcrumbs, search trigger — O-4 gating, timezone chip, bell, account menu), PageHeader/Tabs/FilterBar slots, skip links + scroll-padding, portal header (customer), caregiver bottom-tab shell.
- **Dependencies**: Phase 2.
- **Acceptance**: keyboard-only round-trip sidebar↔content↔header; drawer trap + Esc + route-close; `aria-current` states; RTL mirroring screenshot parity; no layout shift between states.
- **Testing**: shell component tests (nav filtering per role fixture, badge zero-render); E2E nav smoke per role.
- **Risks**: nav config drift from docs 05 matrix → generate fixtures from a single typed config file.

### Phase 4 — Enterprise components
- **Objective**: RDS 05 §B data layer.
- **Scope**: DataTable (toolbar, sticky header, sort, selection, bulk bar, URL-query state, mobile card-list/scroll modes), Pagination, Filters pattern, Tabs, Detail panel, Drawer, Dialog variants (destructive confirm w/ reason), DatePicker/TimePicker/DateRange (Sunday start pending O-3), Timeline, KPI card.
- **Dependencies**: Phase 3; API list endpoints per docs 07.
- **Acceptance**: queues render server-paginated data with shareable URL state; sort/filter never client-recomputed over truncated pages; all states of §B1 demonstrable; agenda/keyboard equivalence patterns present.
- **Testing**: table contract tests (sort aria, selection announce, empty/loading); pagination + filter URL round-trip; date-picker RTL grid tests.
- **Risks**: scope creep into saved views (out of MVP — do not build); calendar excluded here (Phase 5).

### Phase 5 — Operational workflow components
- **Objective**: RDS 05 §B10–B11 + §C care composites.
- **Scope**: Calendar (week/day, PLANNED lane, agenda toggle), CandidatePicker/AssignmentDialog (transactional confirm + conflict surfacing + bulk results), ApprovalWorkflow banner, ConflictIndicator, Stepper, PatientSummaryHeader, CarePlanOverview, VisitDetailPanel, CaregiverAvailabilityView, NotificationPanel.
- **Dependencies**: Phase 4; backend scheduling endpoints (docs 07 assign transaction, BR-SCH).
- **Acceptance**: AC-02/AC-04…AC-08 flows pass through these components; no optimistic server-owned transitions; conflict paths show actionable C8 states (AC-06 double-assign renders exactly one success + one conflict).
- **Testing**: interaction tests per component; concurrency conflict rendering test with mocked 409; reduced-motion calendar checks.
- **Risks**: heaviest phase — split delivery order: Stepper → Approval/Conflict → VisitDetail → Picker → Calendar.

### Phase 6 — Screen integration
- **Objective**: RDS 09 screens assembled per surface, following docs 13 release slices (Slice 2 acquisition surfaces, Slice 3 care operations, Slice 4 reliability surfaces).
- **Scope**: build/retrofit every RDS 09 screen onto shells + components; portal (C-1…C-12), workspace modules (W-1…W-25), caregiver (G-1…G-4), operator (O-1…O-4 done incrementally from Phase 2 debt closure); translation namespaces per feature.
- **Dependencies**: Phases 3–5 (per-surface order can parallelize after Phase 4).
- **Acceptance**: each module meets RDS 09 §7 checklist + RDS 06 §17 state contract; no raw tokens/type steps in new code (lint enforces); business behavior unchanged (docs 04 invariants).
- **Risks**: module teams improvising variants → weekly design-review against RDS; deviations recorded as ADR.

### Phase 7 — Bilingual and accessibility hardening
- **Objective**: release gates docs 02 gate 5 + docs 10 a11y gates.
- **Scope**: RDS 07 §8 matrix (5 flows × ar/en × mobile/desktop + keyboard passes + bidi torture + 200 %/320 px reflow); RDS 08 §7 manual audits (axe E2E per locale, NVDA/VoiceOver incl. Arabic voice, coarse-pointer audit); caregiver field-condition checks (RDS 08 §8).
- **Dependencies**: Phase 6 per surface (run incrementally, not big-bang).
- **Acceptance**: zero serious/critical axe findings on key pages both locales; keyboard journeys complete; matrix documented with evidence.
- **Risks**: late discoveries forcing component API changes → run this pass per Phase 6 module, not only at the end.

### Phase 8 — CI enforcement and governance
- **Objective**: drift becomes impossible.
- **Scope**: contrast matrix script in CI (fails on new pair < AA); token + physical-direction lint wired to build; `:dir()`-sensitive component snapshot tests; per-PR a11y checklist (RDS 08 §7.5); showcase page (design-system coverage per shadcn skill practice) serving as living documentation — optional, owner appetite.
- **Dependencies**: Phases 1–2 tooling exists; full value after Phase 6.
- **Acceptance**: CI red on each planted violation class; showcase (if approved) covers state matrices both directions.
- **Risks**: lint false positives blocking work → allowlist file with justification comments, reviewed in PR.

## 4. Dependency and approval gates

| Gate | Content | Rule |
|---|---|---|
| **O-1** | Install shadcn CLI components + Radix (transitively), `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge` | Owner approval required before Phase 2 (AGENTS.md: no unnecessary UI libraries; this is the *one* specified library set). Downloads are small/incremental (`npx shadcn@latest add …` per component) — agent-executable within the slow-internet constraint; no bulk `add --all`. |
| **O-2** | Dark mode | Specification only (RDS 02 §9); implementation forbidden without owner decision. |
| **O-3** | Calendar week start = Sunday both locales | Confirm with owner before Phase 4 date pickers (RDS 07 §6). Default in specs: Sunday. |
| **O-4** | Global search / ⌘K palette in MVP | Requires a tenant-scoped search endpoint not present in docs 07 core list — confirm scope; default: build shell without search trigger, add when API exists. |
| **O-5** | Sidebar collapsed default + persistence semantics | Client per-user preference (RDS 04) — confirm storage (localStorage vs account setting). |

## 5. Validation strategy (every phase)

1. `npm run lint`, `npm run typecheck`, `npm run test` — exact commands, real results reported (AGENTS.md law).
2. Visual verification in both `ar` and `en` at 390 / 768 / 1280 / 1440 px for touched screens.
3. RDS 09 §7 checklist per touched screen; state contract (RDS 06 §17) demonstrable.
4. Business behavior unchanged: corresponding backend contract tests still pass; no new client-side authorization assumptions (docs 05 rule 8).
5. Docs updated in the same change when reality diverges from RDS (token additions per RDS 02 §11).

## 6. Risks (cross-phase)

1. **Dependency approval stalls Phase 2** → interim primitives must still be token-pure; never ship raw-palette fallbacks.
2. **RTL as afterthought** → Phase 1 lint makes physical CSS a build failure from day one.
3. **Density improvisation** → only the two density wrappers exist; per-screen padding tweaks are review-rejected.
4. **Optimistic UI regressions on server-owned transitions** → component library encodes pending-then-confirm (Button pending law, caregiver run view) so the mistake is structural, not per-screen.
5. **Scope creep** (saved views, month calendar, drag-assign, export, dark mode, patient payments) → all explicitly out of V1; additions require owner decision + ADR.

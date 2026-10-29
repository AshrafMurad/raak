# Raak Design System (RDS) — Entry Point

The authoritative index for Raak's UI/UX architecture. RDS is **documentation-first**: it specifies; it does not ship. Application code is changed only through the roadmap in `design-system/10-IMPLEMENTATION-ROADMAP.md`.

## Authority order

1. **Locked**: `docs/01_PRODUCT_AND_DECISIONS.md` (D01–D23), `docs/10_UI_UX_DESIGN_SYSTEM.md` (brand, type scale, component rules), `frontend/app/tokens.css` (implemented token values). RDS never contradicts these; where locked values exist, RDS only elaborates.
2. **Normative when approved for implementation**: RDS 01–10 (status: PROPOSED — apply per roadmap phase; deviations require an ADR and a docs update in the same change).
3. Business behavior always comes from `docs/03–05`; RDS renders it, never redefines it.

## Approved brand decisions (unchangeable here)

| Decision | Value |
|---|---|
| Name / wordmark | رعاك \| Raak text wordmark only — no logomark until a separate branding phase |
| Primary | `#243B70` — CTAs, active nav, links, focus |
| Accent | `#7485CF` — decorative data emphasis only; never small text on light backgrounds, never severity |
| Background / Text | `#F8F9FD` canvas · `#202A40` core text |
| Typography | IBM Plex Sans Arabic (ar) · IBM Plex Sans (en); weights 400/500/600/700; self-hosted (ADR-0004) |
| Character | Light-first, calm enterprise surfaces, crisp tables/calendars, restrained shadows; no glassmorphism/gradients/medical clichés |
| Language | Arabic RTL default, English LTR full parity (release gate) |

## Architecture in one paragraph

RDS is a four-layer token system (primitives → semantic → component → Tailwind v4 utilities; RDS 02) consumed by one component library (shadcn/Radix restyled to RDS variants; RDS 05) arranged in one application shell with four densities/surfaces (workspace, customer portal, caregiver portal, operator console; RDS 04, RDS 09) executing documented workflows with a single status grammar and state-honest data states (RDS 06), mirrored — not flipped — for Arabic RTL (RDS 07), meeting WCAG 2.2 AA with restrained motion (RDS 08). Conceptual influences: IBM Carbon ~70% (enterprise structure), Atlassian ~20% (workflow patterns), Apple HIG ~10% (interaction refinement) — no visual copying of any of them.

## Documentation index

| File | Contents |
|---|---|
| `design-system/01-DESIGN-PHILOSOPHY.md` | Positioning, design principles, brand expression, dual density, voice, anti-patterns, skill application record |
| `design-system/02-DESIGN-TOKENS.md` | Token architecture and layers, color scales, semantic tokens, type/space/radius/shadow/z-index/motion tokens, breakpoints, Tailwind v4 integration, governance, dark-mode spec (not approved) |
| `design-system/03-TYPOGRAPHY-AND-COLOR.md` | Families and script rules, locked type scale, numerals/dates/money, contrast matrix + derived laws, canonical status-color mapping, data-viz rules |
| `design-system/04-LAYOUT-AND-NAVIGATION.md` | App shell anatomy, sidebar/header/breadcrumbs, per-role navigation inventory, page-header and grid patterns, loading/empty/error shells, mobile layouts |
| `design-system/05-COMPONENT-SYSTEM.md` | Foundational, enterprise, and care-domain component specs (variants, states, keyboard, a11y, RTL, usage, anti-patterns) |
| `design-system/06-PATTERNS-AND-WORKFLOWS.md` | Shared workflow grammar + module-level UX for requests, patients, plans, scheduling, assignment, visits, quotes, notifications, reports, settings, portals |
| `design-system/07-RTL-AND-RESPONSIVENESS.md` | Direction architecture, layout mirroring map, bidi rules, icon mirroring lists, per-surface responsive rules, direction × responsive test matrix |
| `design-system/08-ACCESSIBILITY-AND-MOTION.md` | WCAG 2.2 AA policy, focus management, announcements, forms/validation, motion standards, testing gates, caregiver field conditions |
| `design-system/09-SCREEN-SPECIFICATIONS.md` | Every screen (public, auth, workspace, customer portal, caregiver portal, operator console): route, users, goal, layout, actions, components, states, notes |
| `design-system/10-IMPLEMENTATION-ROADMAP.md` | Current-state audit + debt register, eight phases with acceptance criteria, dependency/approval gates, open decisions, validation strategy, risks |

## How implementation agents use RDS

1. **Find the screen** in RDS 09 → note its components and referenced modules (M§n → RDS 06).
2. **Compose from RDS 05** — if a spec exists, use it; build a new component only when no pattern fits, then propose it as an RDS addition in the same change.
3. **Style only with semantic tokens** (RDS 02 utility grammar; type only via the 12 scale keys). Raw hex, palette classes, raw type steps, and physical direction CSS fail lint (roadmap Phase 1).
4. **Statuses render through StatusBadge** and the single mapping in RDS 03 §B3 — never ad-hoc chips.
5. **Check RTL + a11y before review**: RDS 07 (logical CSS, icon mirroring, bidi isolation) and RDS 08 (focus, announcements, targets); the RDS 09 §7 checklist is the per-screen gate.
6. **Never** render optimistic success for server-owned transitions; never add out-of-V1 features (payments, dark mode, saved views, month calendar, drag-assign) — see RDS 10 §6.
7. Deviations from RDS that change a contract → ADR + product-owner approval; token changes → RDS 02 §11 governance.

## Open decisions requiring product-owner input

O-1 shadcn/Radix/lucide dependency approval (blocks Phase 2) · O-2 dark mode (spec-only) · O-3 calendar week start Sunday · O-4 global search in MVP · O-5 sidebar collapse persistence — details in RDS 10 §4.

# RDS 01 — Design Philosophy

**Raak Design System (RDS)** · Status: PROPOSED for product-owner approval · Reference: `docs/10_UI_UX_DESIGN_SYSTEM.md` (brand source, D21–D23 locked) · Entry point: `docs/DESIGN_SYSTEM.md`

## 1. Positioning

RDS is an original enterprise design language for Raak's four surfaces: agency workspace, branded customer portal, caregiver mobile web portal, and platform operator console. It is **documentation-first**: nothing here changes application code, business logic, APIs, or the locked brand identity.

### Conceptual influences (priorities, not copies)

| Influence | Weight | What we take | What we reject |
|---|---|---|---|
| IBM Carbon | ~70% | Enterprise information architecture; structured 2× grid discipline; consistent spacing; complex tables/filters/forms; clear visual hierarchy; semantic tokens; accessible, predictable components; restrained use of color as meaning | Carbon's visual identity, Carbon React library, tile/pictogram aesthetics, blue-on-blue product branding |
| Atlassian Design System | ~20% | Complex workflow and task management patterns; status communication; calendar/scheduling interfaces; contextual navigation; information density with progressive disclosure; clear inline feedback | Atlassian branding, lozenge visual style, mascot/tone-of-voice |
| Apple HIG | ~10% | Refined typographic polish; purposeful subtle motion; precise focus/selection states; considerate interaction details (undo affordances, confirmation placement) | Apple visual chrome, translucency/vibrancy, iOS component geometry |

The result must read as **Raak**: midnight-blue authority, lavender used sparingly as data emphasis, Arabic-first typography, calm operational surfaces. No glassmorphism, no decorative gradients, no medical clichés, no saturated sidebars.

## 2. Design principles

These principles resolve design disputes. When two options both "work", the one that better satisfies the lower-numbered principle wins.

1. **Clarity before decoration.** Every visual decision must serve comprehension or operation. If an element does not inform, navigate, or act, remove it.
2. **State honesty.** The UI always distinguishes *proposed* from *confirmed*, *draft* from *sent*, *generated* from *assigned* (PLANNED ≠ SCHEDULED), *button time* from *verified presence*. Never render optimistic success for server-owned transitions (check-in/out, quote acceptance) before the server confirms.
3. **Density with breathing room.** Agency workspace is data-dense (compact tables, 12-column grids, progressive disclosure). Customer portal is calm and spacious. Two densities, one component library — density is a context decision, never a per-screen improvisation.
4. **Arabic-first mirroring by construction.** Every component is designed RTL-first with logical properties, then verified LTR. RTL is layout mirroring plus typography, icon mirroring, numerals, dates, and mixed-direction handling — never "flip flexbox".
5. **Deny-by-default visibility.** UI surfaces exactly what the acting principal is authorized to see. Forbidden content renders as an explicit "no access" state for staff contexts, and is simply absent for customer/caregiver contexts. The UI is advisory; the server remains the boundary.
6. **One way to do a thing.** A destructive action always confirms with consequence; a state-changing action always lands in a visible status; a list always has the same filter/empty/loading grammar. No per-module reinventions.
7. **Predictable motion.** Motion confirms causality (panel opened, item saved) at 120–240 ms. Nothing loops, bounces, or decorates. `prefers-reduced-motion` disables all non-essential movement.
8. **Operational speed.** Frequent coordinator tasks (triage a request, assign a visit, approve a change) must be reachable in few, predictable steps. Keyboard paths and bulk operations are first-class, not enhancements.

## 3. Brand expression (locked identity, D21–D23)

| Element | Rule |
|---|---|
| Name | **رعاك / Raak** wordmark only; no logomark until separate branding phase |
| Primary `#243B70` | Primary CTAs, active navigation, key links, focus rings, page-title accents. White text on primary passes contrast |
| Accent `#7485CF` | Decorative data emphasis, chart series, selected-state tints (via `accent-subtle`). **Never** small text on light backgrounds (3.5:1); never a severity encoding |
| Background `#F8F9FD` | App canvas behind white surfaces |
| Text `#202A40` | Core text; anchors the neutral scale |
| Fonts | IBM Plex Sans Arabic (ar), IBM Plex Sans (en); weights 400/500/600/700 only |
| Character | Light-first, crisp tables and calendars, subtle shadows, generous-but-not-empty spacing, enterprise-practical |

Wordmark usage: dictionary-driven (`common.brand.name` / `common.brand.latin`), never hardcoded per component. Arabic wordmark is primary in `ar`, Latin in `en`; the secondary may appear muted beside it.

## 4. Dual-density philosophy

| | Agency workspace | Customer portal | Caregiver portal | Operator console |
|---|---|---|---|---|
| Density | Compact (`data-density="compact"`) | Comfortable (default) | Comfortable, large targets | Compact |
| Row height | 40–44 px | 56–64 px list items | ≥56 px, 44 px targets | 40–44 px |
| Body size | 14 px (13 px metadata) | 16 px prose | 16 px | 14 px |
| Tone | Efficient, neutral | Warm, reassuring, plain language | Task-focused, glanceable | Terse, tabular |
| Color use | Status-driven | Status + brand reassurance | Status-driven | Status-driven |

Density is chosen per surface via a wrapper (`data-density` or React context), never by ad-hoc per-screen padding.

## 5. Voice and content principles

- Arabic default; English full parity. All product copy from feature translation namespaces; zero literal business text in components (doc 10 rule).
- Statuses show **canonical English code + localized label** in staff contexts (A11: English technical codes canonical); customer portal shows localized labels only.
- Errors are actionable and privacy-preserving: say what to do next, never leak whether another tenant's resource exists (404 semantics), never include patient details in toasts/logs.
- Numbers: Western digits (0–9) everywhere (A11). Currency as ISO code + tenant currency, integer minor units formatted by locale.
- Confirmations name the consequence ("The original appointment stays confirmed until the coordinator approves this change"), not generic "Are you sure?".

## 6. Explicit anti-patterns (never ship)

1. Generic AI-SaaS look: purple-blue gradient heroes, floating glass cards, oversized rounded-3xl dashboards.
2. Color-only status (chip without label), or lavender for clinical severity.
3. Hardcoded hex values, `text-sm`-style raw Tailwind type scale, or physical `left/right` CSS in components.
4. Giant KPI cards consuming a full viewport row on desktop; data views with >40% empty whitespace.
5. Optimistic success on server-owned transitions; silent auto-state-changes rendered as user actions.
6. Invented features or states not present in docs 03/04 (no AI matching claims, no payment UI, no GPS).
7. A second component library to imitate Carbon's look.
8. Animations longer than 240 ms on operational surfaces; parallax; looping skeletons shimmer for users with reduced motion.
9. Mixed-direction text without isolation (Arabic sentence swallowing LTR emails/IDs).
10. Focus suppression, `outline: none` without replacement, or hit targets below 24×24 px (44 px on touch surfaces).

## 7. What RDS is not

- Not a rebrand: D21–D23 values, fonts, and light-first character are untouched.
- Not a UI framework migration: Tailwind v4 + semantic tokens stay; shadcn/Radix are additions specified in `10-IMPLEMENTATION-ROADMAP.md` and require owner approval before installation.
- Not dark mode: a coherent dark specification exists in `02-DESIGN-TOKENS.md` §9 for future approval only; light mode is the only implemented experience.

## 8. Skill application record (design-authoring phase)

Agent skills reviewed while authoring RDS, and how each shaped it:

| Skill | Applied to | Effect |
|---|---|---|
| `frontend-design` | RDS 01 principles, anti-patterns | "Avoid templated defaults" became §6: Raak's distinctiveness is spent in exactly one place — midnight-blue authority + Arabic-first typography — while every other surface stays quiet. Its warnings (SaaS-card kit, gradient washes, ALL-CAPS eyebrows everywhere) map directly onto §6. Its plain-language copy rules shaped §5 voice principles. |
| `apple-design` (installed after initial discovery) | RDS 08 motion, typography | Adopted: size-specific tracking (negative for large Latin display, none for Arabic — RDS 03 §A3), leading-by-size, focus precision, reduced-motion as gentler equivalents not removal. **Rejected for V1**: springs/bounce/momentum interactions and translucent materials — conflicts with §2.7 (predictable motion ≤240 ms, no bounce) and docs 10 (no glassmorphism); enterprise operational surfaces prioritize predictability over playfulness. Recorded as a deliberate divergence, not an oversight. |
| `web-design-guidelines` | RDS 08 | Interface-quality rules (focus visibility, target size, forms, announcements) consolidated into the a11y policy and the per-release review checklist (§7). A formal guideline-compliance file review is part of roadmap Phase 7 hardening. |
| `shadcn` | RDS 05 | Composition discipline: semantic tokens only, Field/FieldGroup form grammar, Alert/Empty/Badge/Separator/Skeleton instead of custom markup, variant-first component APIs, icon conventions. Its "one library, restyled" model is exactly RDS's stance on Carbon visuals. |
| `vercel-react-best-practices` | Roadmap implementation notes | RSC/client boundaries, bundle discipline, and data-fetching rules are implementation-time guidance for Phases 2–6 (documented in RDS 10 §5 validation), not design-system law. |

Skills named in the authoring brief but not installed were recorded and not used; no skill guidance overrode locked decisions — Raak requirements, AGENTS.md, and D01–D23 take precedence in every conflict.

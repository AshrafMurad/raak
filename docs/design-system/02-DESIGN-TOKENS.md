# RDS 02 — Design Tokens

**Status: PROPOSED (extends, never overrides, the locked values in `frontend/app/tokens.css` and docs 10/D21–D23)** · Light mode is the only approved implementation; dark mode is specification-only (§9).

## 1. Token architecture

Four layers, one direction of dependency:

```
Layer 1 Primitives   --raak-neutral-*, --raak-brand-*, --raak-status-* (raw values, never used by components)
Layer 2 Semantic     --raak-bg-*, --raak-border-*, --raak-text-*, --raak-status-*-tint/ink/border (what components consume)
Layer 3 Component    --raak-control-height-*, --raak-row-height-* (few, only where variants need them)
Layer 4 Tailwind map @theme inline { --color-*, --text-*, --radius-*, --shadow-* }  → utilities (bg-surface, text-body…)
```

Rules:

1. Components reference **Tailwind semantic utilities** (`bg-surface`, `text-ink-muted`, `border-line`) or `var(--raak-*)` semantic vars — never raw hex, never primitive scale vars.
2. Existing locked variable names (`--raak-brand-primary`, `--raak-app-background`, `--raak-radius-card`, …) are preserved as aliases of scale values; nothing currently shipped breaks.
3. Adding a token requires a docs update (this file) in the same change. Removing/renaming a semantic token requires an ADR.

## 2. Primitive color scales

Anchors marked 🔒 are locked (D22 / docs 10 / existing `tokens.css`) and must not change. Unanchored steps are RDS proposals tuned for monotonic ramps.

### Neutral (blue-gray, anchored on text `#202A40`)

| Token | Value | Anchor |
|---|---|---|
| `--raak-neutral-0` | `#FFFFFF` | 🔒 surface |
| `--raak-neutral-25` | `#F8F9FD` | 🔒 canvas |
| `--raak-neutral-50` | `#F2F4F9` | |
| `--raak-neutral-100` | `#E9ECF4` | |
| `--raak-neutral-150` | `#E3E7F0` | 🔒 border-default |
| `--raak-neutral-200` | `#D4DAE7` | |
| `--raak-neutral-300` | `#B9C2D6` | |
| `--raak-neutral-400` | `#99A4BC` | |
| `--raak-neutral-500` | `#7B869E` | |
| `--raak-neutral-600` | `#647086` | 🔒 text-secondary |
| `--raak-neutral-700` | `#525C73` | |
| `--raak-neutral-800` | `#3E475E` | |
| `--raak-neutral-900` | `#202A40` | 🔒 text-primary |
| `--raak-neutral-950` | `#171E30` | |

### Brand (midnight blue ramp + lavender accent)

| Token | Value | Anchor / role |
|---|---|---|
| `--raak-brand-25` | `#F7F8FD` | faintest tint (hover on subtle rows) |
| `--raak-brand-50` | `#EEF1FA` | 🔒 primarySubtle (selected backgrounds) |
| `--raak-brand-100` | `#DFE5F6` | tint hover |
| `--raak-brand-200` | `#C6CFEC` | tint borders |
| `--raak-brand-300` | `#A6B2DF` | |
| `--raak-brand-400` | `#7485CF` | 🔒 accent (also aliased `--raak-accent`) |
| `--raak-brand-500` | `#5D6FBD` | |
| `--raak-brand-600` | `#3D5599` | |
| `--raak-brand-700` | `#243B70` | 🔒 primary (CTA, links, focus) |
| `--raak-brand-800` | `#1A2D59` | 🔒 primaryHover |
| `--raak-brand-900` | `#14213F` | pressed |
| `--raak-accent` | `#7485CF` | 🔒 decorative/data only — see contrast rules in RDS 03 |
| `--raak-accent-subtle` | `#E9EAF9` | 🔒 controlled accent fills |
| `--raak-accent-strong` | `#4C58A8` | NEW: text-safe accent (6.4:1 on white) when lavender emphasis must be readable |

Compatibility aliases (keep, point at scale): `--raak-brand-primary: var(--raak-brand-700)`, `--raak-brand-primary-hover: var(--raak-brand-800)`, `--raak-brand-primary-subtle: var(--raak-brand-50)`.

### Status (5 semantic hues)

Base values 🔒 locked. Each status derives `ink` (text-safe on white/tints), `subtle` (tint background), `border`, `hover` (tint hover).

| Status | base 🔒 | ink | subtle | border | hover |
|---|---|---|---|---|---|
| success | `#23856A` | `#1D6D58` | `#E7F4EF` | `#BFE3D6` | `#D9EEE6` |
| warning | `#A96A16` | `#8F5812` | `#FBF3E6` | `#F0DDBE` | `#F5E7CE` |
| danger | `#C44650` | `#A93A43` | `#FAECED` | `#F0CDD0` | `#F5DCDE` |
| info | `#315DA3` | `#29508D` | `#E9EFF9` | `#C8D7EF` | `#D9E4F4` |
| neutral | `#667085` | `#565F72` | `#F0F2F7` | `#DBDFE9` | `#E4E8F0` |

Naming: `--raak-status-success`, `--raak-status-success-ink`, `--raak-status-success-subtle`, `--raak-status-success-border`, `--raak-status-success-hover`, etc.

Usage law (from docs 10, restated as tokens):
- `base`: icons ≥16 px, borders of emphasis, large text (≥18 px semibold), solid fills behind **white** text (all five bases ≥4.4:1 with white; warning solid-with-white is reserved for ≥18px/600 or icons — small white-on-warning text is forbidden, use `ink` on `subtle` instead).
- `ink`: all 12–14 px status text and chip labels.
- `subtle` + `border` + `ink`: the standard status chip / alert tint triad.
- Status is **never hue alone** (RDS 05 StatusBadge anatomy: label + tint + optional icon).

### Chart/data-viz palette (ordered, max 7 series)

`brand-700 → accent → info → success → warning → danger → neutral-400`. Series also differ by marker/dash pattern so charts survive monochrome and color-vision deficiency. Accent is never used for a "bad" series.

## 3. Semantic tokens

### Backgrounds

| Token | Value | Use |
|---|---|---|
| `--raak-bg-canvas` | `neutral-25` 🔒 | App canvas |
| `--raak-bg-surface` | `neutral-0` 🔒 | Cards, sheets, tables, inputs |
| `--raak-bg-sunken` | `neutral-50` | Table headers, inset toolbars, code/ID blocks, disabled fills |
| `--raak-bg-hover` | `neutral-50` | Row/list hover on white surfaces |
| `--raak-bg-selected` | `brand-50` 🔒 | Selected rows, active nav items |
| `--raak-bg-selected-hover` | `brand-100` | Hover on selected |
| `--raak-bg-inverted` | `brand-700` 🔒 | Primary button fill, inverted banners |
| `--raak-bg-scrim` | `rgba(23, 30, 48, 0.45)` | Dialog/drawer scrim (neutral-950 at 45%) |

### Borders

| Token | Value | Use |
|---|---|---|
| `--raak-border-subtle` | `neutral-100` | Dividers inside cards, table row lines |
| `--raak-border-default` | `neutral-150` 🔒 | Inputs, cards, sidebar seam |
| `--raak-border-strong` | `neutral-300` | Hovered input border, emphasized separators |
| `--raak-border-focus` | `brand-700` 🔒 | Focus rings |
| `--raak-border-focus-inverse` | `neutral-0` | Focus on brand/dark fills |
| `--raak-border-danger` | `status-danger` | Invalid input borders |

### Text

| Token | Value | Use |
|---|---|---|
| `--raak-text-primary` | `neutral-900` 🔒 | Core text |
| `--raak-text-secondary` | `neutral-600` 🔒 | Metadata, secondary labels (5.0:1 on white) |
| `--raak-text-tertiary` | `neutral-500` | Placeholders, disabled-adjacent hints (4.5:1 on white only ≥14px; use secondary below) |
| `--raak-text-disabled` | `neutral-400` | Disabled control text (not required to pass contrast; control must also be `disabled`/`aria-disabled`) |
| `--raak-text-inverse` | `neutral-0` | Text on brand-700/status solid fills |
| `--raak-text-brand` | `brand-700` 🔒 | Links, active nav, brand emphasis (10.9:1) |
| `--raak-text-accent-strong` | `accent-strong` | Readable lavender emphasis (6.4:1) |

### Interactive states (canonical)

| State | Fill | Text | Border |
|---|---|---|---|
| Hover (secondary/ghost) | `bg-hover` (neutral-50) | primary | default→strong |
| Hover (primary) | `brand-800` 🔒 | inverse | — |
| Active/pressed | `brand-900` / `neutral-100` | inverse/primary | — |
| Focus-visible | unchanged | unchanged | 2px `border-focus` outline, 2px offset |
| Selected | `bg-selected` | `text-brand` | `brand-200` (chips/rows) |
| Disabled | `bg-sunken` | `text-disabled` | `border-subtle` |
| Loading | unchanged fill | unchanged | spinner replaces/leads label; `aria-busy` |
| Read-only input | `bg-sunken` | primary | default |
| Invalid | surface | primary + `status-danger-ink` message | `border-danger` |

## 4. Typography tokens

The docs-10 scale is locked. Existing `--raak-text-*-size/-line` variables stay; they map into Tailwind v4 `--text-*` theme keys (RDS 03 for full rules).

| Tailwind key | CSS vars (existing) | Size/line | Weight | Role |
|---|---|---|---|---|
| `text-display` | `--raak-text-display-*` | 36/48 | 700 | Marketing hero only (portal landing) |
| `text-page-title` | `--raak-text-page-title-*` | 28/40 (24/32 <768px) | 700 | Page titles |
| `text-section-title` | `--raak-text-section-title-*` | 22/34 | 600 | Major sections |
| `text-card-title` | `--raak-text-card-title-*` | 18/28 | 600 | Cards, dialogs, panels |
| `text-body-lg` | `--raak-text-body-lg-*` | 16/28 | 400 | Customer prose, caregiver body |
| `text-body` | `--raak-text-body-*` | 14/24 | 400 | Staff controls, forms, tables |
| `text-body-sm` | `--raak-text-body-sm-*` | 13/22 | 400 | Compact staff metadata |
| `text-caption` | `--raak-text-caption-*` | 12/20 | 400 | Non-essential labels only |
| `text-button` | `--raak-text-button-*` | 14/20 | 500 | Controls |
| `text-table-header` | `--raak-text-table-header-*` | 13/20 | 600 | Table headers |
| `text-sidebar-label` | `--raak-text-sidebar-label-*` | 14/22 | 500 | Navigation |
| `text-stat` | `--raak-text-stat-value-*` | 28/36 | 600–700 | KPI values, `tabular-nums` |

Component rule: only these 12 keys. Raw Tailwind steps (`text-sm`, `text-base`, …) are banned in new UI; the two current ad-hoc usages in `page-shell.tsx` are migration debt tracked in RDS 10 Phase 2.

## 5. Space, radius, shadow, elevation

**Spacing**: Tailwind default 4 px grid, unchanged. Allowed rhythm: `1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20` (4→80 px). Page gutters 16 (mobile) / 24 (tablet) / 32 (desktop). Card padding: 16 compact / 20–24 comfortable. Section gaps: 24–32. No arbitrary one-off values (`p-[13px]` banned).

**Radius**:

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6 px | Chips, tags, kbd, inline code |
| `--radius-control` | 10 px 🔒 | Buttons, inputs, selects, menu items |
| `--radius-card` | 12 px 🔒 | Cards, panels, popovers |
| `--radius-overlay` | 14 px | Dialogs, drawers, toasts |
| `--radius-full` | 9999 px | Avatars, round icon buttons, pills |

Rule: an overlay never nests a control of larger radius; concentric radii shrink inward.

**Shadows** (borders do the separating; shadows only lift):

| Token | Value | Use |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(32,42,64,.06), 0 1px 3px rgba(32,42,64,.08)` 🔒 | Resting cards |
| `--shadow-2` | `0 4px 12px rgba(32,42,64,.10), 0 2px 4px rgba(32,42,64,.06)` | Dropdowns, popovers, sticky headers |
| `--shadow-3` | `0 12px 32px rgba(32,42,64,.16), 0 4px 8px rgba(32,42,64,.08)` | Modals, drawers |

## 6. Sizing, density, z-index

**Controls**: `--raak-control-sm: 32px` (dense toolbars, table inline), `--raak-control-md: 40px` (default), `--raak-control-lg: 44px` (customer portal, caregiver). Touch surfaces enforce ≥44 px targets (RDS 08).

**Rows**: default table row 48 px; compact (staff) 40 px; list item 56–64 px. `data-density="compact" | "comfortable"` on a section wrapper selects the pair via component tokens `--raak-row-height`, `--raak-cell-pad-y`.

**Z-index** (CSS vars, used via `z-[var(--z-*)]`):

| Token | Value |
|---|---|
| `--z-sticky` | 100 (sticky headers) |
| `--z-dropdown` | 1000 (select/combobox/popover menus) |
| `--z-drawer` | 1200 |
| `--z-modal` | 1300 |
| `--z-toast` | 1400 |
| `--z-tooltip` | 1500 |

## 7. Motion tokens

| Token | Value | Use |
|---|---|---|
| `--raak-duration-fast` | 120 ms | Hover/active, chips, tooltips |
| `--raak-duration-base` | 180 ms | Menus, popovers, accordion |
| `--raak-duration-slow` | 240 ms | Dialogs, drawers, page-level reveals |
| `--raak-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default |
| `--raak-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Dismissals |

Caps: opacity/transform only; no `width/height/top/left` animations; nothing loops except a deterministic spinner/skeleton; everything honors `prefers-reduced-motion` (RDS 08).

## 8. Breakpoints and layout widths

Tailwind screens extended (keep default `sm 640` for fine mobile steps):

```css
@theme {
  --breakpoint-tablet: 48rem;   /* 768 */
  --breakpoint-desktop: 64rem;  /* 1024 */
  --breakpoint-wide: 90rem;     /* 1440 */
}
```

Semantics: mobile `<768` (stack, drawer nav; caregiver portal targets 360–430 px); tablet `768–1023` (collapsible sidebar, 2-col summaries); desktop `≥1024` (full shell); wide `≥1440` (content capped, gutters grow). Content widths: workspace max 1440 px; reading/prose max 720 px; forms max 640 px; caregiver content max 480 px centered.

## 9. Dark mode — SPECIFICATION ONLY (not approved for implementation)

Light mode is the only implemented experience. If the product owner later approves dark mode:

- Activation: explicit `data-theme="dark"` on `<html>`; **no** auto `prefers-color-scheme` switching in V1 (operational predictability).
- Only Layer 2 semantic tokens are redefined; primitives and component tokens are untouched. Components cannot break because they never read primitives.
- Proposed values (to be contrast-audited before any implementation): canvas `#141926`, surface `#1C2334`, sunken `#232B40`, border `#313B54`/subtle `#2A3248`, text `#E7EAF2`/secondary `#A6AFC4`, brand fill `#8FA0DE` (text-on-canvas 7:1+), brand-subtle `#26304D`, status bases lightened ~1 step (`success #3FA486`, `warning #C98F3D`, `danger #E06A72`, `info #6C93D6`, `neutral #98A2B8`), inks replaced by tint-text pairs, shadows off (borders carry elevation), scrim `rgba(10,13,22,.6)`.
- Gate: full WCAG 2.2 AA matrix re-run in dark before shipping; status mapping table (RDS 03 §5) re-verified for label+tint pairing.

## 10. Tailwind v4 integration (reference)

`globals.css` keeps its existing `@theme inline` block and extends it (illustrative — Phase 1 of RDS 10 implements):

```css
@theme inline {
  /* existing locked names stay */
  --color-brand: var(--raak-brand-primary);
  --color-canvas: var(--raak-app-background);
  --color-surface: var(--raak-surface-default);
  --color-line: var(--raak-border-default);
  --color-ink: var(--raak-text-primary);
  --color-ink-muted: var(--raak-text-secondary);
  --radius-card: var(--raak-radius-card);

  /* semantic additions */
  --color-sunken: var(--raak-bg-sunken);
  --color-hover: var(--raak-bg-hover);
  --color-selected: var(--raak-bg-selected);
  --color-line-subtle: var(--raak-border-subtle);
  --color-line-strong: var(--raak-border-strong);
  --color-ink-subtle: var(--raak-text-tertiary);
  --color-ink-inverse: var(--raak-text-inverse);
  --color-success: var(--raak-status-success);
  --color-success-ink: var(--raak-status-success-ink);
  --color-success-subtle: var(--raak-status-success-subtle);
  --color-success-border: var(--raak-status-success-border);
  /* …warning/danger/info/neutral identical pattern… */

  /* type scale */
  --text-page-title: var(--raak-text-page-title-size);
  --text-page-title--line-height: var(--raak-text-page-title-line);
  /* …all 12 keys from §4… */

  --radius-control: var(--raak-radius-control);
  --radius-overlay: var(--raak-radius-overlay);
  --shadow-1: var(--raak-shadow-subtle);
  --shadow-2: var(--raak-shadow-popover);
  --shadow-3: var(--raak-shadow-modal);
}
```

Resulting utility grammar (canonical examples): `bg-canvas`, `bg-surface`, `bg-sunken`, `bg-selected`, `text-ink`, `text-ink-muted`, `text-ink-subtle`, `text-brand`, `border-line`, `border-line-subtle`, `rounded-control`, `rounded-card`, `shadow-1`, `text-body`, `text-page-title`, `bg-success-subtle text-success-ink border-success-border`.

## 11. Governance

- **Add** a semantic token: PR + this-file update; reviewer confirms no primitive leakage into components.
- **Change** a locked value: forbidden without product-owner decision amending D22/D23 and docs 10.
- **Change** a proposed (unlocked) value: ADR + contrast re-audit of affected pairs.
- Token lint (roadmap Phase 1): fail builds on raw hex/`rgb(`/`hsl(` in `frontend/{app,components}` outside `tokens.css`, and on banned utilities (`text-sm|base|lg|xl`, `bg-white`, `text-gray-*`, `rounded-lg` ad hoc).

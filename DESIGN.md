---
name: Raak | رعاك
description: Arabic-first, quiet Attio/Notion-informed visual-system preview.
colors:
  raak-brand-primary: "#243B70"
  raak-brand-primary-hover: "#1A2D59"
  raak-brand-primary-subtle: "#EEF1FA"
  raak-brand-accent: "#7485CF"
  raak-brand-accent-subtle: "#E9EAF9"
  raak-app-background: "#F8F9FD"
  raak-surface-default: "#FFFFFF"
  raak-border-default: "#E3E7F0"
  raak-text-primary: "#202A40"
  raak-text-secondary: "#647086"
  raak-status-success: "#23856A"
  raak-status-warning: "#A96A16"
  raak-status-danger: "#C44650"
  raak-status-info: "#315DA3"
  raak-status-neutral: "#667085"
  # Observed dark-preview values for comparison; not final brand approval.
  preview-dark-canvas: "#161719"
  preview-dark-surface: "#202124"
  preview-dark-sidebar: "#1B1C1F"
  preview-dark-sheet: "#252629"
  preview-dark-sheet-canvas: "#1B1C1F"
  preview-dark-text: "#E5EAF4"
  preview-dark-muted: "#A3ADC2"
  preview-dark-border: "#323438"
  preview-dark-link: "#B3C2FF"
  preview-dark-link-hover: "#C8D2FF"
  preview-dark-action: "#97A8EC"
  preview-dark-action-hover: "#AFBEF5"
  preview-dark-action-text: "#141B2B"
  preview-dark-selected: "#202B47"
  preview-dark-accent: "#8F9FE4"
  preview-dark-accent-subtle: "#252E49"
  preview-dark-success: "#69C6A5"
  preview-dark-warning: "#E5B66E"
  preview-dark-danger: "#EF9199"
  preview-dark-info: "#9DBBF0"
typography:
  raak-font-arabic:
    fontFamily: "'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif"
  raak-font-latin:
    fontFamily: "'IBM Plex Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif"
  page-title:
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "40px"
  page-title-mobile:
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "36px"
  section-title:
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "28px"
  body:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontSize: "13px"
    fontWeight: 500
  table-header:
    fontSize: "13px"
    fontWeight: 500
  stat-value:
    fontSize: "28px"
    fontWeight: 500
    lineHeight: "36px"
rounded:
  raak-radius-control: "10px"
  raak-radius-card: "12px"
components:
  button-primary:
    backgroundColor: "{colors.raak-brand-primary}"
    textColor: "{colors.raak-surface-default}"
    rounded: "{rounded.raak-radius-control}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "{colors.raak-brand-primary-hover}"
  button-secondary:
    backgroundColor: "{colors.raak-surface-default}"
    textColor: "{colors.raak-text-primary}"
    rounded: "{rounded.raak-radius-control}"
    padding: "9px 15px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.raak-brand-primary}"
    rounded: "{rounded.raak-radius-control}"
    padding: "9px 15px"
  button-danger:
    rounded: "{rounded.raak-radius-control}"
    padding: "9px 15px"
  input:
    backgroundColor: "{colors.raak-surface-default}"
    textColor: "{colors.raak-text-primary}"
    rounded: "{rounded.raak-radius-control}"
    padding: "9px 12px"
  navigation-current:
    backgroundColor: "{colors.raak-brand-primary-subtle}"
    textColor: "{colors.raak-brand-primary}"
    padding: "9px 12px"
  status-planned:
    backgroundColor: "{colors.raak-surface-default}"
    textColor: "{colors.raak-text-secondary}"
    padding: "3px 8px"
  feedback-container:
    rounded: "{rounded.raak-radius-card}"
    padding: "18px"
  detail-sheet:
    backgroundColor: "{colors.raak-surface-default}"
    width: "min(480px, 100%)"
  data-table:
    textColor: "{colors.raak-text-primary}"
    width: "100%"
---

# Design System: Raak | رعاك

## Current approval and implementation handoff — 2026-11-01

The owner approved the completed preview as the visual baseline for later app
phases, including current light/dark treatments, centered Dialog, themed Selects
and motion refinements. Follow the canonical approved-preview and shared-UI
contract in `docs/10_UI_UX_DESIGN_SYSTEM.md`. Shared extraction remains an
implementation task: preview and production must consume the same promoted UI.
The captured measurements, side-sheet specimens and exploratory-theme wording
below describe earlier preview stages where they differ from the current source
and completed refinements in `docs/design/VISUAL_PREVIEW_BRIEF.md`; they do not
override the current approved preview or locked product/security decisions.

## Overview

**Creative North Star: "Owner-approved Attio/Notion calm workspace"**

Raak's demonstrated visual system is quiet, human and content-led: crisp tables, open layouts and subtle interactions. Locked midnight blue, cool white surfaces and restrained lavender selection support operational clarity. The owner explicitly superseded the earlier seed world; this document introduces no replacement metaphor or identity.

Arabic RTL is the reference composition, with English LTR receiving equal content and behavior. This record captures a synthetic component board and workspace at `/ar/design-preview` and `/en/design-preview`, alongside the Sprint 1 foundation. It describes demonstrated visual patterns, not production business workflows or a promoted shared component library.

**Key Characteristics:**

- Quiet interface with crisp tables and open sections.
- Locked Plex Arabic/Latin typography and restrained semantic color.
- White logical-start navigation and logical-end record inspection.
- Border-based depth, compact controls and explicit synthetic disclosure.

### Evidence and authority

`PRODUCT.md` supplies durable brand commitments; `docs/design/VISUAL_PREVIEW_BRIEF.md` supplies the owner-approved direction contract. `docs/10_UI_UX_DESIGN_SYSTEM.md` is the planned specification. Actual values come first from `frontend/app/tokens.css`, then `frontend/app/[locale]/design-preview/preview.css` and its `_components/button.tsx`, `status.tsx`, `design-preview.tsx` and `component-board.tsx`. `frontend/app/globals.css` supplies locale font assignment. Frontmatter is normative for this captured system; color, font-family and radius keys preserve CSS custom-property names with only the leading `--` omitted. Typography role entries describe observed preview rules, not new CSS variables. No named spacing scale exists in these sources, so none is invented here.

The supplied fresh finish-review handoff records **SHIP**, review of all 12 validated screenshots in `.impeccable/review/`, four locale/viewport browser combinations (Arabic/English × 1440px/390px), and 31 passing Vitest tests; no material fixes were identified. The captures cover workspace, board and detail in each combination. This documentation pass inspected source and the capture inventory; it did not rerun browsers or tests. The disposition applies to the synthetic visual preview, not production readiness or accessibility/compliance certification.

## Colors

Cool neutrals carry most of the interface; midnight blue acts, lavender selects, and status colors communicate labeled state.

### Primary

- `raak-brand-primary`: midnight blue for primary actions, focus outlines, links and selected navigation text.
- `raak-brand-primary-hover`: darker action hover.
- `raak-brand-primary-subtle`: pale selection and initial-avatar fill.

### Secondary

- `raak-brand-accent`: restrained lavender emphasis, including small decorative dots.
- `raak-brand-accent-subtle`: lavender selection, count and in-progress fills; not a warning color.

### Neutral

- `raak-app-background`: cool canvas used in disclosure, table headers and contextual fills. The actual preview shell and sidebar use `raak-surface-default`; the canvas token does not imply every page background is tinted.
- `raak-surface-default`: white sidebar, fields, sheet and resting surfaces.
- `raak-text-primary` / `raak-text-secondary`: ink for content and muted metadata respectively.
- `raak-border-default`: separators and control outlines.

### Semantic status

- `raak-status-success`, `raak-status-warning`, `raak-status-danger`, `raak-status-info`, `raak-status-neutral`: locked semantic primitives, not extra brand accents. Neutral is available in the shared tokens; the preview's planned chip actually uses secondary text, not the neutral status primitive.
- The preview's `--rv-success-text`, `--rv-warning-text` and `--rv-danger-text` use `color-mix(in srgb, var(--rv-success) 80%, var(--rv-text))` and its warning/danger equivalents: 80% status plus 20% ink. These are contrast-enhanced contextual text treatments, not new brand colors. Scheduled text remains the info primitive; in-progress text remains primary.
- Completed, scheduled and cancelled fills mix 7% corresponding status with 93% white. Danger buttons use 7%, increasing to 13% on hover. These contextual mixes live in snippets rather than replacing the locked HEX primitives.

Sidecar tonal ramps are generated swatch-display metadata only, not approved additional palette steps or component colors. Contrast must be checked for each real pairing; this document makes no blanket accessibility claim.

### Exploratory dark preview

The owner requested a dark comparison before approving adjustments. The `preview-dark-*` frontmatter entries record current preview values, not a replacement for the locked brand palette or approval of a dark-first product. Light remains the default; `/ar/design-preview?theme=dark` and its English counterpart explicitly render dark on the server.

The preview overrides local semantic aliases using `data-theme="dark"`: blue-gray ground, differentiated sidebar and sheet surfaces, soft light text, brighter lavender actions, and readable semantic states. Action backgrounds/text are separate from link/focus colors. Brand swatches keep their original midnight-blue/lavender values in both themes; canvas/text swatches reflect the active theme. Native controls inherit the corresponding `color-scheme`.

The header toggle uses translated action labels and keyboard activation. It writes the theme to the preview URL; refresh and language switching retain it without browser storage. Switching theme does not remount the component board or clear its local inputs. Portalled detail content and its backdrop carry the same theme explicitly. No persistent account preference or system-theme-following option is implemented.

Dark adaptation verification: eight locale/viewport/theme combinations, 32 Vitest tests, and sampled enabled component-board control/status/help text contrast at least 4.5:1. This is sampled evidence, not a blanket accessibility certification. Final visual direction and adjustments remain subject to owner discussion.

## Typography

Use `raak-font-arabic` for Arabic and `raak-font-latin` for English; both retain the incumbent system fallbacks. Fonts are self-hosted by the frontend. Allowed weights remain 400, 500, 600 and 700. No alternate typeface, artificial Arabic tracking or separate display identity is introduced.

The frontmatter hierarchy follows built CSS: page heading, mobile page heading, section heading, body, labels, table headers and summary values. The preview root is 14px with unitless 1.7 line height; the general Arabic body rule in `tokens.css` is 1.75. These are distinct scopes, not equal tokens. Main heading supporting copy is limited to 68ch.

The built page heading is weight 600 rather than the planned 700. Built section headings use 18/28 rather than the planned major-section 22/34; table headers and summary values are weight 500 rather than the planned 600 or 600/700. The token file retains its wider explicit size/line-height scale, including 36/48 display; that scale is not evidence of those roles being rendered in this preview. Small metadata varies by context (including 11px and 12px); do not normalize every label to one size.

Use tabular numerals for data, counts and timestamps. Isolate mixed-direction IDs, time ranges and ISO dates with `bdi`/local `dir="ltr"`; do not reverse the entire Arabic surface to accommodate a code.

## Layout

The built desktop shell is a 230px white logical-start sidebar beside a flexible content column. The sidebar is sticky and full viewport height. Main content has a maximum width of 1380px, centered, with 30px top and 44px inline padding; header height is at least 66px. This differs from the planned approximate 1440px container and 1024px desktop threshold.

Observed responsive thresholds are preview-specific: at widths up to 1200px main/header inline padding becomes 28px; up to 950px the sidebar is replaced by a native disclosure navigation and the header minimum becomes 56px; up to 620px main padding becomes 22px 20px 0, headings stack, summaries become two columns, board/field/feedback grids become one column, and the table retains a 690px minimum width inside horizontal overflow. At 1600px and above main inline padding becomes 64px. These rules belong to the demonstrated shell, not a universal product breakpoint contract.

Open sections use separators, with 32px top separation on desktop and 28px on mobile. Feedback groups use 16px gaps; field groups use 24px by 20px gaps. These are observed local measurements, not a fabricated spacing-token scale.

The workspace's exception-first greeting, daily summary, queue and table order is the approved first-surface composition in the brief. It is not a mandatory template for every future screen. Preserve logical mirroring and choose hierarchy for the actual task.

## Elevation & Depth

Resting preview surfaces use thin borders and tonal changes rather than card shadows. The shared `--raak-shadow-subtle` exists in `tokens.css`, but is not applied to the preview's resting feedback containers. The logical-end sheet alone uses the preview overlay shadow, with an ink-tinted 18% backdrop. Shadow values are carried in the sidecar, not new frontmatter primitives.

Motion stays local and restrained: button/navigation color changes take 130ms ease-out; the toggle thumb uses 140ms ease-out; the detail sheet enters over 180ms with `cubic-bezier(0.16, 1, 0.3, 1)` and a 12px direction-aware translation. The loading spinner rotates over 1.2s linearly. The preview disables animation and transitions under reduced-motion preference, including the portalled sheet's preview root.

## Shapes

Canonical controls use gently rounded `raak-radius-control` corners (10px); grouped containers use `raak-radius-card` (12px). This is the system's principal form language, not a claim that every rendered corner equals those tokens: navigation, search and state select use 9px, filters use 8px, and status chips use 6px. Circular initials and small dots remain lightweight markers. The edge-attached sheet is not a floating rounded card.

Use 44px interaction targets for the canonical buttons, icon controls, inputs and navigation. The built preview is not uniformly 44px: its view switch is 32px, filters are 40px, and mobile exception buttons are 40px. Record those scopes honestly rather than declaring universal target compliance.

## Components

These components are preview-scoped under `frontend/app/[locale]/design-preview/_components/`; they have not yet been promoted into a shared production library. The sidecar offers framework-free visual specimens, not replacements for application behavior, routing or dialog focus management. Snippets inherit the existing root tokens and include literal fallbacks so they remain readable in an isolated panel; they require no Tailwind bundle, framework runtime, external images or icon packages.

### Buttons

Restrained, explicit actions. The owned CVA/Slot primitive exposes primary, secondary, ghost and danger variants, plus default and icon sizes. The normal shape and padding are captured in frontmatter; the minimum target height is 44px, icon width 44px, gap 8px and label size/weight 14px/500. Button line height inherits the preview's 1.7, not the token file's planned 20px button line height. Primary hover darkens; secondary hover tints the canvas and darkens its border; ghost hover uses the selection fill; danger hover increases its contextual tint. Disabled opacity is 0.55 with a not-allowed cursor. The board's click feedback is explicitly demonstrative.

### Inputs / fields

White, outlined controls with visible labels; standard input text is 13px, minimum height 44px. Invalid fields use the danger border, associated error copy and the darker danger text mix. The search wrapper instead uses a 9px radius, a 12px input and a 2px-offset focus-within outline. General keyboard focus uses a 2px primary outline offset by 3px. Do not infer that every input style is identical.

### Navigation

White rather than saturated sidebar. Resting labels are muted; hover/current states use primary text on the pale primary selection fill, with current weight 600. Native disclosure navigation replaces the sidebar at the observed narrow threshold. Directional arrows mirror; non-directional icons do not need mirroring.

### Status chips

Compact label-plus-marker indicators, not buttons. Planned has a dashed outline and dashed-circle marker on white; scheduled has a filled dot on a soft info fill; in progress has a circle-dot marker on lavender; completed has a check on soft success; cancelled has an X on soft danger. Planned is never presented as confirmed. Preserve labels and shapes as well as hue.

### Containers and feedback

Quiet bordered groups rather than a dashboard of raised cards. Board feedback examples use 18px padding and the container radius, demonstrating error/retry, restricted, empty and loading appearances. Those examples do not demonstrate server authorization, recovery or real persistence. Initial avatars are typographic, not photographs.

### Tables

Crisp start-aligned columns, muted tinted headers and thin row separators. Headers use 12px 14px padding; cells use 13px 14px. Hover adds the canvas fill. A horizontal scroll region preserves column width on mobile. Sticky headers are a planned capability for large tables, not an observed rule in this preview.

### Logical-end detail sheet

Inspect without losing the queue. The actual Radix dialog attaches at `inset-inline-end: 0`, fills block height and uses `min(480px, 100%)` width. Header/footer padding is 24px, body padding 28px, reducing to 20px/22px on mobile. The body scrolls independently. The implementation supplies a title/description, keyboard dismissal and focus return to the opener. A static sidecar specimen documents appearance only; it does not implement a modal or certify its accessibility.

## Do's and Don'ts

### Do:

- **Do** preserve the locked tokens and locale-specific IBM Plex stacks.
- **Do** keep navigation white, tables crisp, layouts open and interactions subtle.
- **Do** mirror with logical properties and isolate mixed-direction data.
- **Do** pair status labels with distinct markers and keep planned distinct from confirmed.
- **Do** label demonstrations as synthetic and distinguish visual specimens from production behavior.

### Don't:

- **Don't** revive the superseded seed world or invent a new visual metaphor.
- **Don't** add an alternate palette, fonts or an unapproved logo. Imagery belongs to the relevant surface brief; this preview requires none.
- **Don't** introduce glassmorphism, glow, giant gradients or a saturated sidebar.
- **Don't** promote the exception-first preview composition into a universal page template.
- **Don't** treat preview review results as production readiness or accessibility/compliance certification.

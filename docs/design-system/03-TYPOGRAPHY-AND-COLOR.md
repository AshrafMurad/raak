# RDS 03 — Typography and Color

**Status: PROPOSED elaboration of docs 10 (locked scale and palette unchanged)** · Tokens: RDS 02.

## Part A — Typography

### A1. Families and loading

- Arabic UI: **IBM Plex Sans Arabic**; Latin UI: **IBM Plex Sans**. Both self-hosted via `@fontsource` (ADR-0004), weights 400/500/600/700 only. No other weights, no italics, no alternate fonts without a product decision (docs 10).
- Font selection is locale-driven on `<html lang>` (already implemented in `globals.css`): `ar` → Arabic stack first with Latin fallback; `en` → Latin stack first with Arabic fallback. The fallback order guarantees that embedded opposite-script text (an English email inside Arabic prose) renders in the co-family, not a system font.
- Font stacks stay in `tokens.css` (`--raak-font-arabic`, `--raak-font-latin`); components never set `font-family`.

### A2. Type scale (locked, docs 10)

| Key | Size/line | Weight | Usage | Notes |
|---|---|---|---|---|
| `display` | 36/48 | 700 | Marketing hero only | Responsive: 28/38 below 768 px |
| `pageTitle` | 28/40 | 700 | One per page | Responsive: 24/32 below 768 px |
| `sectionTitle` | 22/34 | 600 | Major page section | Max one visible fold; prefer cardTitle below it |
| `cardTitle` | 18/28 | 600 | Cards, dialog/panel titles | |
| `bodyLg` | 16/28 | 400 | Customer/caregiver prose, portal paragraphs | |
| `body` | 14/24 | 400 | Staff default: forms, tables, controls | |
| `bodySm` | 13/22 | 400 | Staff compact metadata (table cells, timestamps) | Never in customer portal prose |
| `caption` | 12/20 | 400 | Non-essential hints, helper text | Never for required information; helper text that matters is `bodySm` |
| `button` | 14/20 | 500 | All button labels | |
| `tableHeader` | 13/20 | 600 | Table column headers | |
| `sidebarLabel` | 14/22 | 500 | Navigation items | |
| `stat` | 28/36 | 600–700 | KPI values | `tabular-nums` mandatory |

Weights allowed: 400, 500, 600, 700. Emphasis inside body text uses weight 500–600, never italics or color alone.

### A3. Line height and script rules

| Rule | Arabic | English |
|---|---|---|
| Body line height | 1.65–1.85 (body default 1.75 set on `:root[lang='ar'] body`) | 1.4–1.6 (scale line heights) |
| Letter-spacing | **Never** apply tracking to Arabic (connected script breaks) | Eyebrow/overline may use `letter-spacing: 0.08–0.14em` **only when content is Latin**; uppercase only for Latin |
| Headings | Weight carries hierarchy; keep native spacing | Weight + size |
| Bold in Arabic | 600 max inside body (700 reserved for titles — 700 Arabic body is heavy) | 600–700 fine |
| Wordmark | `رعاك` primary in ar; Latin `Raak` muted secondary | reversed in en |

Implementation note (current gap): the existing `PageShell` eyebrow applies `uppercase tracking-[0.14em]` unconditionally — under RDS this class must be conditional on `lang === 'en'` when that component is migrated (RDS 10 Phase 2). Codified now as the rule: **uppercase/tracking utilities are wrapped in a Latin-only helper** (`ltr-only-emphasis` pattern), never applied to Arabic strings.

### A4. Numerals, times, money

1. **Western digits (0–9) everywhere** (A11 policy): IDs, codes, counts, times, phone numbers, amounts — in both locales. Arabic-Indic digits are not used in V1.
2. `font-variant-numeric: tabular-nums` (utility `tabular-nums`) on: table numeric columns, KPI values, timestamps, durations, monetary values, countdowns, version numbers, quote totals.
3. Dates/times: Gregorian calendar, `Intl.DateTimeFormat` with UI locale (`ar` / `en`) and **tenant IANA timezone** (A03) for all operational timestamps; the timezone abbreviation is shown in headers of scheduling/report views (e.g. "Asia/Riyadh"). Date style: `d MMM uuuu` locale pattern (`١` never; see rule 1); times 24 h in staff views, locale-default in customer views.
4. Money: integer minor units formatted via `Intl.NumberFormat(locale, { style:'currency', currency: tenantCurrency })`; ISO code shown beside totals in commercial views (e.g. "1,250.00 SAR"). No floating-point math in UI logic; components only format.
5. Mixed-direction embeddings (emails, UUIDs, URLs, tracking codes inside Arabic prose) are wrapped in `<bdi>` or `dir="ltr"` spans (RDS 07 §4).

### A5. Content hierarchy model

Page = `pageTitle` + optional one-line description (`body`, `text-ink-muted`) + sections (`sectionTitle`) of cards (`cardTitle`). Inside cards: `body`/`bodySm`. Screens never skip more than one level (page → card is fine; page → caption is not).

## Part B — Color

### B1. Usage rules

1. **Semantic tokens only** (RDS 02 §3); raw hex nowhere in components.
2. Color communicates status **only** through the canonical mapping (B3). Decorative use of brand/accent must not coincide with a status meaning (lavender is never "in progress" in one view and "informational" in another; in-progress uses brand, info uses info-blue, consistently).
3. Maximum one primary CTA per view. `brand-700` solid is reserved for it; everything else is secondary/ghost/link.
4. Accent lavender (#7485CF): chart series, subtle legend fills (`accent-subtle`), decorative rules (the 80×4 bar in PageShell), selection highlights. Never: small text on light bg (3.5:1), status severity, form validation.
5. Red (`danger`) appears only for: destructive actions, invalid validation, terminal failure states (REJECTED, CANCELLED, MISSED, SUSPENDED). A red badge is always accompanied by a count/label.
6. Status colors never fill large areas beyond alert banners/chips (`*-subtle` tints only); page backgrounds stay canvas/surface.

### B2. Contrast matrix (WCAG 2.2 AA verified pairs)

Computed ratios (rounded to 1 decimal). "✓" = passes 4.5:1 normal text; "✓ lg" = passes 3:1 (large text/UI components only).

| Foreground | On white `#FFF` | On canvas `#F8F9FD` | On sunken `#F2F4F9` | On brand-50 | On brand-700 | On status subtle tints |
|---|---|---|---|---|---|---|
| text-primary `#202A40` | 13.9 ✓ | 13.2 ✓ | 12.5 ✓ | 11.8 ✓ | — | ✓ |
| text-secondary `#647086` | 5.0 ✓ | 4.7 ✓ | 4.5 ✓ | 4.2 ✗ (use primary) | — | ✗ (use ink) |
| text-tertiary `#7B869E` | 3.9 ✓ lg only | 3.7 ✓ lg | ✗ | ✗ | — | ✗ |
| text-brand `#243B70` | 10.9 ✓ | 10.3 ✓ | 9.8 ✓ | 9.2 ✓ | — | ✓ |
| accent-strong `#4C58A8` | 6.4 ✓ | 6.0 ✓ | 5.7 ✓ | 5.4 ✓ | — | ✓ |
| accent `#7485CF` | 3.5 ✓ lg only | ✗ text | ✗ | ✗ | — | ✗ |
| success base `#23856A` | 4.5 ✓ | 4.3 ✓ lg | ✗ | ✗ | — | use ink |
| success ink `#1D6D58` | 6.3 ✓ | 5.9 ✓ | 5.6 ✓ | ✓ | — | 5.9 ✓ |
| warning base `#A96A16` | 4.4 ✓ lg only | ✗ text | ✗ | ✗ | — | use ink |
| warning ink `#8F5812` | 5.9 ✓ | 5.5 ✓ | 5.3 ✓ | ✓ | — | 5.5 ✓ |
| danger base `#C44650` | 4.8 ✓ | 4.6 ✓ | 4.4 ✗ lg | ✗ | — | use ink |
| danger ink `#A93A43` | 6.2 ✓ | 5.8 ✓ | 5.5 ✓ | ✓ | — | 5.8 ✓ |
| info base `#315DA3` | 6.5 ✓ | 6.1 ✓ | 5.8 ✓ | ✓ | — | use ink |
| neutral-600 base `#667085` | 5.0 ✓ | 4.8 ✓ | 4.5 ✓ | ✗ | — | use ink |
| white on brand-700 | — | — | — | — | 10.9 ✓ | — |
| white on success solid | — | — | — | — | — | 4.5 ✓ |
| white on warning solid | — | — | — | — | — | 4.4 ✗ normal → **forbidden** for small text |
| white on danger solid | — | — | — | — | — | 4.8 ✓ |
| white on info solid | — | — | — | — | — | 6.5 ✓ |

Derived laws (encode these in the StatusBadge/Button tokens so violations are structurally impossible):

- **L1**: small status text = `*-ink` on `*-subtle`, never `base` on white when ratio < 4.5 (warning base is banned as small text; danger base allowed ≥14 px only).
- **L2**: solid status fills carry white text only where ≥4.5 (success/danger/info); warning solid fill requires ≥18 px/600 or icon-only.
- **L3**: `text-secondary` on `brand-50` is banned (4.2:1) — selected rows use `text-primary`/`text-brand`.
- **L4**: placeholder/hint text uses `text-secondary` below 14 px; `text-tertiary` only ≥14 px (or non-essential decoration).
- **L5**: non-text UI boundaries (input borders, focus rings, chart marks) need 3:1 against adjacent colors: `border-default` on white = 1.6:1 → inputs additionally rely on fill/label/placeholder contrast; borders are affordance, not sole indicator. Focus ring `brand-700` on white 10.9:1 ✓; on `brand-50` 9.2:1 ✓.

### B3. Canonical status mapping (single source of truth)

Every status rendering in the product uses this table (StatusBadge implementation reads it). Pattern: `chip` = `*-subtle` bg + `*-ink` text + `*-border` hairline; icon where marked. Never invent per-screen colors.

**ServiceRequest (BR-REQ)**

| State | Status | Icon |
|---|---|---|
| `SUBMITTED` | info | inbox |
| `UNDER_REVIEW` | info | search |
| `AWAITING_CUSTOMER` | warning | message |
| `APPROVED` | success | check |
| `REJECTED` | danger | x |
| `WITHDRAWN` | neutral | minus |

**Quote (BR-QTE)** / **QuoteRevision**

| State | Status | | State | Status |
|---|---|---|---|---|
| `DRAFT` | neutral | | Revision `PENDING` | warning |
| `SENT` | info | | Revision `RESOLVED` | success |
| `ACCEPTED` | success | | Revision `DECLINED` | danger |
| `REJECTED` | danger | | Revision `WITHDRAWN` | neutral |
| `EXPIRED` | warning | | | |
| `SUPERSEDED` | neutral | | | |

**CarePlan (BR-PLAN)**

| State | Status |
|---|---|
| `DRAFT` | neutral |
| `ACTIVE` | success |
| `PAUSED` | warning |
| `COMPLETED` | info |
| `CANCELLED` | danger |

Clinical approval on a plan version: `PENDING_REVIEW` = warning banner (not a chip color change); `APPROVED` = success with reviewer identity; `REJECTED` = danger with reason.

**Visit (BR-VST)**

| State | Status | Extra encoding (state honesty, P1) |
|---|---|---|
| `PLANNED` | warning | **dashed** border/icon `circle-dashed`; label includes "unassigned" context in lists |
| `SCHEDULED` | info | solid chip; caregiver name shown |
| `IN_PROGRESS` | brand (chip: brand-50 bg / brand-700 text / brand-200 border) | pulsing dot (static under reduced motion) |
| `COMPLETED` | success | check icon |
| `CANCELLED` | danger | strikethrough of time in lists |
| `MISSED` | danger | distinct label + `alert-triangle`; never same rendering as CANCELLED |

Cross-cutting visit dimensions (rendered as **separate** chips, never merged into the state chip):

| Dimension | Value → rendering |
|---|---|
| `reviewStatus` | `NEEDS_REVIEW` = warning chip "needs review"; `REVIEWED` = subtle success check; `NOT_REQUIRED` = not rendered |
| `assignmentHealth` | `NEEDS_REASSIGNMENT` = warning chip + `user-x` icon, row left-border 3px warning |
| ChangeRequest urgency | `LATE` = danger left-border + "late" label; `NORMAL` = none |

**VisitChangeRequest (BR-CHG)**: `PENDING` warning (clock), `APPROVED` success, `REJECTED` danger, `WITHDRAWN` neutral.

**Tenant (F01)**: `PENDING_APPROVAL` warning, `ACTIVE` success, `SUSPENDED` danger.

**Notification/health**: job failure = danger; retrying = warning; delivered = not rendered (absence of bad news).

### B4. Data-viz rules

1. Palette order per RDS 02 §2; series distinguishable by marker shape/dash, not hue alone.
2. Bar/line charts: 2 px strokes, rounded caps; gridlines `border-subtle`; axis labels `bodySm`/`text-secondary`.
3. KPI deltas: ▲/▼ glyph + signed number, colored success/danger only where the direction is unambiguously good/bad for that metric; otherwise neutral.
4. No donut/pie charts for >5 segments; tables preferred under 7 rows (docs 10: reports are operational, not decorative).

# RDS 07 — RTL and Responsiveness

**Status: PROPOSED** · Arabic RTL default (`lang="ar" dir="rtl"`), English LTR parity is a release gate (docs 02 gate 5). This file defines the mechanical rules implementers follow; philosophy is in RDS 01 §2.4.

## 1. Direction architecture

1. Direction is set once on `<html lang dir>` by the locale segment (`app/[locale]`, ADR-0005; `LOCALE_DIRECTION` in `lib/i18n.ts` is the single mapping). Components never set `dir` themselves except for the mixed-content exceptions in §4.
2. **Zero physical direction CSS in components**: no `left/right`, `margin-left`, `padding-right`, `text-left`, `translate-x`. Only logical utilities: `ps-*`/`pe-*` (padding), `ms-*`/`me-*` (margin), `start-*`/`end-*` (inset), `border-s`/`border-e`, `text-start`/`text-end`, `rounded-s-*`/`rounded-e-*`, `flex-row` (which auto-mirrors), `text-left` banned in favor of `text-start`.
3. Absolute positioning uses `start-/end-`; transforms for directional motion use `rtl:rotate-180`-style variants only on the icon list in §5.
4. Third-party portals (Radix) are positioned via floating-ui logical placement — verify popovers align to inline-start, not `left`.

## 2. Layout mirroring map

| Element | LTR | RTL |
|---|---|---|
| Sidebar | Left edge | Right edge |
| Breadcrumb flow | Home ▸ Section ▸ Entity (chevron ›) | Same order, chevron ‹ mirrored, flow right→left |
| Page header actions | Right-aligned cluster | Left-aligned cluster (inline-end) |
| Table column order | First = identity | Mirrored; sort icons point per mirrored order |
| Timeline rail | Left rail | Right rail |
| Stepper | 1→2→3 left-to-right | 1→2→3 right-to-left (numbers keep Western digits) |
| Calendar days | Mon…Sun columns L→R | Mirrored columns; time axis on right |
| Drawer origin | Left (inline-start) | Right (inline-start in RTL) — drawers always open from the inline-start edge |
| Toast stack | Bottom-left | Bottom-right |
| Progress/duration bars | Fill left→right | Fill right→left |
| Carousel/pagination arrows | next = › | next = ‹ (mirrored glyph via icon swap) |

Rule: mirror *reading order*, not semantics. "Primary action on inline-end" stays true in both directions.

## 3. Typography per direction

- Family, line-height, and body rhythm per RDS 03 §A3 (already on `html[lang]` selectors). Direction-specific overrides live in two `html[lang]` CSS blocks, not per-component conditionals.
- Text alignment: default start-alignment everywhere; justified text banned (Arabic justification with kashida is out of scope).
- Ellipsis/truncation works logically with `truncate`; verify RTL truncation shows the **start** of the string (browser default truncates the logical end — acceptable; for entity names where the head matters, truncate at 24 chars in code instead of CSS when both scripts may appear).
- Punctuation and parentheses in Arabic strings must come from the Arabic translation files (never concatenated into JS strings like `"(" + x + ")"`).

## 4. Mixed-direction content (bidi)

1. Embeds (email, UUID, tracking code, URL, phone, ISO datetime, amount+code) inside directional prose are wrapped: `<bdi>{value}</bdi>` or `dir="ltr"` span with `unicode-bidi: isolate` (Tailwind `rtl:`-safe via `[unicode-bidi:isolate]`). **Never** plain interpolation.
2. Input fields whose content is script-neutral (email, phone, IDs): control gets `dir="ltr"` + `text-start` while its **label** stays in flow direction; caret/selection behavior stays predictable.
3. Money format `1,250.00 SAR` inside Arabic sentences: keep as one isolated unit (Intl output + `<bdi>`), never split symbol/amount across elements.
4. Status labels are localized words (no embedding issues); canonical English codes shown to staff render as isolated chips (`dir="ltr"`, mono, `bodySm`) beside the Arabic label — A11 policy A11.
5. Test sentence every implementer uses: submit an Arabic form containing `user@example.com` and `A1B2C3` in helper text — neither may reorder or corrupt punctuation.

## 5. Icon mirroring

`lucide-react` icons. Mirrored in RTL via a shared `<Icon>` wrapper adding `-scale-x-100` under `[dir=rtl]`:

- **Mirror**: `arrow-left`, `arrow-right`, `arrow-up-right`/`arrow-down-left` (external-link style), `chevron-left`, `chevron-right`, `chevrons-left/right`, `corner-up-left/right`, `log-in`, `log-out`, `undo-2`, `redo-2`, `indent-increase/decrease`, `panel-left`/`panel-right` (used generically as sidebar toggle), `step-forward/back`, `reply`, `share`, `list-start`... Rule of thumb: anything depicting **direction of travel or nesting** mirrors.
- **Never mirror**: `check`, `x`, `plus`, `minus`, `search`, `clock`, `calendar`, `user`, `users`, `bell`, `settings`, `alert-triangle`, `circle-dashed`, `file`, `mail`, `phone`, `home`, `heart`, `stethoscope`, media controls, `loader`. Rule of thumb: **objects, states, and symmetric glyphs** stay.
- Arrows that mean "back"/"next" in steppers/pagination get mirrored; the same glyph meaning "sort descending" does not (sort is a magnitude metaphor, keep glyph, add label).

## 6. Numerals, dates, calendars in RTL

- Western digits everywhere (RDS 03 §A4); `tabular-nums` keeps digits LTR-ordered inside RTL text naturally.
- Date tokens rendered via `Intl` with locale `ar` produce Arabic month names with Western digits; wrap rendered dates in `<bdi>` when embedded in sentences.
- Week starts Sunday (both locales, pending owner confirmation — open decision O-3); weekday headers localize (`أحد…سبت` / `Sun…Sat`).
- Time inputs: digits and `:` order stay LTR (`dir="ltr"` on the control), labels localized.

## 7. Responsive rules by surface

| Surface | <768 mobile | 768–1023 tablet | ≥1024 desktop |
|---|---|---|---|
| Workspace | drawer nav; single column; tables per B1 rule (queues → card list; wide → sticky-first-column scroll); filters in bottom sheet | drawer nav (default) or pinned mini rail; 2-col summaries; list+detail becomes stacked | full shell; list+detail split; sticky panels |
| Customer portal | stacked cards; full-width lg controls; sticky CTA in wizards | 2-col service grid | centered max-960 |
| Caregiver portal | **primary target 360–430 px**: bottom tabs, ≥44 px targets, `bodyLg` | same as mobile centered max-480 | centered max-480 (do not stretch into a desktop dashboard) |
| Operator console | stacked tables | table+drawer | table+side detail |

Universal: no horizontal page scroll; `min-w-0` on every flex/grid child that hosts text (existing bug class); gutters 16/24/32; `text-page-title` scales down below 768; touch targets ≥44 px on coarse pointers (`pointer: coarse` media check in QA).

## 8. Direction × responsive testing matrix (release gate)

For each key flow (guest request, quote accept, visit assign, caregiver start/end, change request):

1. ar/mobile, ar/desktop, en/mobile, en/desktop — complete the flow.
2. Keyboard-only pass in both directions (Tab order follows visual/logical order identically).
3. Bidi torture strings (§4.5) in every free-text echo location.
4. Calendar week strip screenshot compared ar vs en for mirroring + Sunday start.
5. `:dir()`-sensitive snapshot tests (Vitest) for the icon-mirror wrapper and logical-utility lint (RDS 02 §11 token lint extended with physical-property lint).
6. 200% zoom + reflow at 320 px (WCAG 1.4.10) in both directions.

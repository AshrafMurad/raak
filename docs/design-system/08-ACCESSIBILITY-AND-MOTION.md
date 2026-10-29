# RDS 08 — Accessibility and Motion

**Status: PROPOSED** · Target: WCAG 2.2 AA across all four surfaces, in Arabic and English (docs 02 gate 5, docs 10 a11y gates). This file is normative for implementation and QA.

## 1. Policy basics

1. Keyboard operability is mandatory for everything mouse users can do; drag-only interactions are banned (V1 has none — calendar assignment is select→confirm, satisfying 2.5.7 dragging alternatives by construction).
2. Visible focus everywhere: `:focus-visible` 2 px `brand-700` outline, 2 px offset (white outline on brand/dark fills). Focus never fully clipped (2.4.11 focus-not-obscured): sticky headers/footers must not cover focused elements — scroll-padding-top/bottom wired to shell heights.
3. Target sizes: interactive targets ≥24×24 px minimum (2.5.8), with RDS standard of **44×44 px on coarse pointers** and 32×32 acceptable only in dense desktop toolbars with spacing (target-offset awareness). Inline text links meet 44 px row spacing in portals.
4. Semantic HTML first (`button`, `a`, `label`, `table`, `ol`, `fieldset`); ARIA only to fill gaps; Radix primitives provide dialog/listbox/tab behavior — do not hand-roll.
5. Language: `<html lang>` correct per locale; embedded opposite-script content marked (`lang` attribute on English brand terms inside Arabic prose where pronunciation matters — e.g., `Raak`); status code chips `lang="en"`.
6. No color-only meaning (pair with label/icon/position — enforced by StatusBadge and chart rules).
7. Zoom/reflow: usable at 200% zoom and 320 px width without loss (1.4.10); no fixed-viewport components except the calendar, which provides the agenda list alternative.
8. Motion follows §6; reduced motion removes all non-essential movement.

## 2. Focus management (dialogs, drawers, navigation)

| Scenario | Rule |
|---|---|
| Dialog opens | Focus moves to first focusable **non-destructive** element (description link / cancel); `aria-labelledby` title; `aria-describedby` description; focus trapped; `Esc` closes unless a required decision blocks it |
| Dialog closes (submit) | Focus returns to trigger; success state announced via toast `role="status"` + focus moved to the changed row/panel when navigation stays on-page |
| Dialog closes (destructive confirm) | Same, plus the outcome is announced explicitly ("Visit cancelled") |
| Drawer | Same as dialog; route-change close returns focus to the header menu trigger |
| Wizard step change | Focus moves to the new step's `h2` (`tabIndex="-1"`); progress announced ("step 3 of 5: recurrence") |
| Client-side navigation | Focus resets to main heading (skip-link target); never leaves focus on a removed node |
| Popover/menu (Radix) | Primitive-managed; `Esc` returns focus to trigger |

Skip links: "skip to main content" as first Tab stop on every authenticated page (visible on focus, brand style). Landmarks: `header`, `nav` (labelled per instance: "primary", "breadcrumb"), `main`, `aside` for detail panels, `footer`.

## 3. Screen reader announcements

| Event | Mechanism |
|---|---|
| Route/region loading | Container `aria-busy` + one polite "loading" message; skeletons `aria-hidden` |
| Results updated (filters, pagination) | Polite live region: "12 results" after settle (300 ms debounce) |
| Mutation success/failure | Toast `role="status"` / inline Alert `role="alert"` (assertive reserved for validation summary + session expiry) |
| Bulk operation results | Focus moves to results Dialog; summary line first ("4 assigned, 1 conflict") |
| Visit state change visible to caregiver | On the execution view, polite announcement "visit started" only after server confirmation |
| Timers/countdowns | None in V1 (no auto-logout timers) — if added later, 20 s warning required (2.2.1) |
| Session expiry | Assertive alert + redirect to login preserving return path |

Tables: `<caption class="sr-only">` describes scope ("Service requests awaiting review, page 2 of 5"); `aria-sort` on sortable headers; empty cells get "—" not silence.

## 4. Forms and validation (3.3.x)

1. Every control has a visible persistent label (placeholders are hints, never labels); required marked with localized symbol + legend; optional marked "optional" in portals.
2. Help text bound via `aria-describedby` **before** error text in DOM order so it reads first.
3. Validation timing: on blur (after first touch) + on submit; never per-keystroke; never on mount.
4. Errors: per-field message with icon + 3.3.1 identification + 3.3.3 suggestion where known ("use your work email" not "invalid"); submit-time summary (`role="alert"`, focus moves to it) listing links to each invalid field; error text never color-only, never title-attribute-only.
5. Error recovery preserves input (docs 10 draft law); server 409/422 codes map to localized, actionable copy at the UI boundary.
6. `autocomplete` attributes on auth forms (`email`, `new-password`, `current-password`, `one-time-code`); OTP inputs accept paste; no script-blocked paste ever (3.3.8 accessible authentication: no cognitive-function tests without alternative — magic-link fallback satisfies email-OTP paths).
7. Timeouts: guest verification links state remaining validity in copy; no silent client-side form expiry.

## 5. Content and structure quality

- Headings: one `h1` (page title) per page; sections `h2`; cards use `h3`; no skipped levels; heading text is meaningful without sight of the layout.
- Link text is self-describing ("review request #1042", never "click here"); icon-only links/buttons carry `aria-label`.
- Reading order equals DOM order equals visual order in both directions (verify RTL with the §8 matrix in RDS 07).
- Images: brand wordmark `alt` = product name; avatars `alt=""` (decorative, name adjacent); informational icons get labels; the V1 icon-only empty states include text (no meaningful images to describe).
- Tables used for data only, never layout.

## 6. Motion standards

| Aspect | Standard |
|---|---|
| Budget | Motion only to confirm causality: open/close (drawers/dialogs/popovers), state acknowledgment (chips, save), progress (determinate preferred) |
| Durations | 120/180/240 ms tokens (RDS 02 §7); anything >240 ms is a bug |
| Easing | standard in, exit out; no bounce/elastic/spring |
| Properties | opacity + transform only; no layout-affecting animation; no scroll-jacking; smooth scroll only for focus relocation |
| Loops | Only spinner (determinate when duration knowable) and skeleton pulse; both stop on completion |
| Reduced motion | `prefers-reduced-motion: reduce` → transitions/animations ≤0.01 ms except opacity fades ≤120 ms; skeleton pulse off (static tint); now-line pulse off; toast timer unchanged (informational, not motion); calendar navigation instant |
| Implementation | One `useReducedMotion` hook + CSS `@media` defaults; components must not hand-roll durations |

## 7. Testing and gates

1. **Automated**: axe-core run in E2E on key pages per locale (zero serious/critical); ESLint `jsx-a11y` configured; focus-trap covered by component tests.
2. **Manual audit per release slice** (docs 12): keyboard-only journey of AC-01…AC-08 flows; screen reader pass (NVDA + VoiceOver; Arabic voice for `ar`) of request → quote → visit execution; 200% zoom; 320 px reflow; coarse-pointer target audit.
3. **Contrast**: RDS 03 §B2 matrix enforced at token level; new token pairs re-audited before merge (script prints ratio table in CI — roadmap Phase 8).
4. Arabic-specific: verify semantic order and truncation with real IBM Plex Arabic rendering (docs 10 gate); check `bidi` torture strings; confirm announced numbers/dates read sensibly in Arabic voice.
5. Definition of done adds: "a11y checklist for touched components attached to PR".

## 8. Caregiver context adjustments (field conditions)

- Sunlight/glare: chips and text keep AA contrast (no light-gray-on-white in the caregiver surface; `bodyLg` minimum for task text).
- Gloves/wet hands: primary actions ≥48 px height on the caregiver surface, spacing ≥8 px between adjacent targets.
- One-hand use: primary action bottom-anchored; destructive actions never in the thumb zone corner.
- Spotty connectivity: every caregiver mutation has explicit pending → confirmed → failed(retry, draft preserved) rendering; "started" is never shown before server confirm (docs 10).

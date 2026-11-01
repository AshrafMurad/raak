# Raak visual system preview

Owner approved the direction and preview scope on 2026-10-31, then approved the current completed design as the app-wide visual baseline on 2026-11-01. This is a design-validation slice alongside the existing Sprint 1 foundation, not an implementation of later domain workflows. Subsequent implementation follows the approved-preview and shared-UI contract in `../10_UI_UX_DESIGN_SYSTEM.md`: promote reusable preview foundations and have preview and production consume the same shared library.

The sections below record the preview's development history. Earlier pending-approval language and side-sheet descriptions are superseded by the final owner approval and completed centered-Dialog, themed-Select and motion refinements. Approval includes the current light/dark visual treatments; light remains the default.

## Scope and invariants

- Build `/ar/design-preview` and `/en/design-preview`: a component board and an exceptions-first coordinator workspace.
- Preserve D21–D23 and `frontend/app/tokens.css`. Arabic RTL is the reference composition; English LTR has equal content and behavior.
- All records are explicitly synthetic. No API, database, persistence, real appointment changes or fabricated mutation success.
- Demonstrate search, filters, detail inspection, keyboard dismissal/focus return, responsive navigation and component states.
- Use owned, shadcn-style primitives (CVA/Slot button, Radix dialog) customized to Raak. Source is manually composed using those patterns; no shadcn generator has been run.
- Future calendar/assignment/authorization integrations remain in their scheduled sprints. No API or database contract changes; DB/Redis are unnecessary for this synthetic preview.

## Direction contract

**THESIS:** A quiet, human, content-led workspace at the Attio/Notion craft bar. Exceptions lead; operational data carries the screen, with open sections rather than a grid of metric cards. The owner chose this familiar-workspace direction over the earlier diagram/ledger proposals.

**OWN-WORLD:** Locked midnight blue actions, cool white canvas, subtle blue-gray separators, restrained lavender selection, Plex Arabic/Latin. Controls use 10px corners, grouped surfaces 12px. Label-plus-shape status treatments separate planned from confirmed.

**STORY:** A coordinator understands what needs attention, inspects the relevant synthetic record, and returns to the same queue. Search and filtering demonstrate information hierarchy without implying a committed booking.

**FIRST VIEWPORT:** Light logical-start sidebar, slim contextual header and preview disclosure; generous greeting with one attention action; a horizontal daily summary followed by an exception queue and today's table. The component board uses the same shell and primitives.

**FORM:** Owner-pinned calm workspace; direction seed `68459e77` was explored, then superseded by explicit owner confirmation of Attio/Notion, exceptions-first, board plus workspace. Signature interaction: open an exception in a quiet logical-end detail sheet while preserving the filtered queue.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification boundary

Lint, TypeScript, existing Vitest suite, translation parity, build, and desktop/mobile Arabic/English browser checks. At most two batched visual inspection rounds. No raster assets are required.

## Owner-run downloads

The owner took over `npm install --save-dev @playwright/test` from `frontend/` after cancelling the agent's attempt. The package subsequently became available (`npm ls @playwright/test --depth=0`: 1.64.1); no agent retry was required. Browser checks used installed Chrome (`channel: 'chrome'`), without downloading browser binaries. Root `AGENTS.md` owns the download-size rule.

## Final result

### Sprint 2 shared adoption — 2026-11-01

The preview now imports the same Button, Select, status badge, centered Dialog,
input/textarea/checkbox, feedback, workspace shell and portal-shell composition
used by production catalog/intake screens. Canonical paths are under
`frontend/components/ui/` and `frontend/components/layout/`; reusable styles are
in `components/ui/styles.css`, with light/dark semantic tokens centralized in
`app/tokens.css`. The board adds the missing request stepper and explicit consent
checkbox in an embedded portal specimen. Synthetic records and preview-only
interaction orchestration remain route-local.

The spacious approved layout, Plex typography, default light theme, dark
treatment, Select typeahead, Dialog geometry/focus and reduced-motion behavior
are retained. The existing visual checker accepts `RAAK_PREVIEW_ARTIFACTS` so
Sprint 2 captures can be written separately without replacing the owner's prior
captures. See `../plans/sprint-02-status.md` for exact final verification and
production-browser coverage.


- Independent fresh visual review: **ship**, scoped to this synthetic preview; all twelve final workspace/board/detail screenshots reviewed.
- `npm run lint`, `npm run typecheck`, `npm run test` (31 tests) and `npm run build` passed from `frontend/`.
- `node scripts/check-visual-preview.mjs` passed from the repository root: Arabic/English at 1440px and 390px, search/filter combinations, queue categories, planned-versus-confirmed inspection, keyboard focus containment/return, dismissal, field validation, mobile navigation, locale switching, no API calls, no page errors and no document overflow.
- Mechanical detector returned `[]`. Initial mobile overflow from an absolutely positioned hidden table label was corrected by containing it in the scroll region; final confirmation passed. The detail screenshot uses viewport-only capture because it is a fixed sheet.
- `DESIGN.md` and `.impeccable/design.json` record the demonstrated preview system. The original locked product/spec documents retain precedence; preview-specific measurements are labeled accordingly.
- Optional follow-ups recorded by the reviewer: a mobile-table horizontal-scroll cue and a concise date field label in the detail sheet. Neither was a material shipping issue; no additional polishing rounds were run.
- No database, migration or API changes; backend checks were not relevant to this visual-only slice.

## Dark comparison requested before approval

- Owner requested a dark preview first, then a thorough adjustment interview. The existing light-first default and locked tokens remain intact. The dark semantic palette is explicitly exploratory until owner feedback.
- Direct links: `/ar/design-preview?theme=dark` and `/en/design-preview?theme=dark`. The server resolves the initial theme; the header toggle updates the URL and keeps it through refresh/language changes. Local form drafts and the current board/workspace view survive theme toggles. No storage or new packages are needed.
- Workspace, component board, detail sheet/backdrop and native form controls use the active theme. Board brand swatches keep locked values; canvas/text values change with the theme.
- `npm run lint`, `npm run typecheck`, `npm run test` (32 tests), and `npm run build` passed. The preview route is now request-rendered because it reads the theme search parameter.
- `node scripts/check-visual-preview.mjs` passed all eight locale/viewport/theme combinations. It additionally checks server-rendered initial theme, keyboard/mouse toggle, reload/locale retention, draft retention, portalled color scheme and sampled enabled control/status/help text contrast >=4.5:1. Existing behavioral checks still pass. No page errors, API calls or document overflow were detected.
- Sixteen current captures: twelve dark workspace/board/detail images plus four light workspace comparisons. Component-board captures were reset to document top after field interactions to avoid fixed-element capture artifacts. Independent scoped review: **ship for owner comparison**, no material fixes; this is not owner approval of the palette.
- Follow-up discussion should cover theme character, density, typography, layout/navigation, component treatments, table/detail behavior, mobile use and copy. Collect answers in small rounds and confirm a change list before making those adjustments.

## Owner-requested refinements — discussion, not yet implemented

- Preserve the current generous spacing, padding, row heights and overall information density. Do not globally compress the interface or increase information density.
- Improve dark-mode foreground contrast, typography hierarchy and logical grouping. Keep a title close to its description; connect related content and separate independent groups more clearly.
- Replace visit-detail side panels with a centered Dialog.
- Standardize status-badge minimum widths for consistent table alignment.
- Replace browser-native Select dropdowns with fully themed components.
- Refine hover, focus, disabled and loading states; review consistency across components and both themes.
- Owner selected a two-column overview for the centered desktop Dialog: identity/state above paired appointment fields, with a full-width operational note. Stack to one column on phones, retaining a centered dialog with comfortable margins and a scrollable body.
- Owner selected simple themed short-list Selects with keyboard typeahead; visible search belongs to longer lookup lists, not every dropdown.
- The owner approved implementation of this consolidated adjustment brief. Scope remains the synthetic preview; actual business workflows and locked brand tokens are unchanged.

### Refinement implementation checklist

- Replace the preview-scoped detail sheet layout with a centered, bounded Radix Dialog; two-column desktop overview, one-column phone layout, independently scrollable body, focus containment/return.
- Add a small incremental Radix Select dependency and a preview-scoped owned Select wrapper; theme portalled options explicitly, preserve simple short lists and keyboard typeahead, keep visible native dropdowns out of this preview.
- Adjust preview CSS for clearer foreground contrast, paired heading/description spacing, independent section separation, equal-width table status badges and coherent hover/focus/disabled/loading states. Preserve table cell and exception row padding, control minimum heights, and the existing spacious density.
- Extend the existing browser checks for centered geometry, short-viewport scrolling, custom Select keyboard/typeahead/cancellation, disabled specimens, badge widths and both themes/locales. Document demonstrated values after verification.
- Radix Select plus its incremental Radix/Floating UI dependencies were metadata-checked before installation: core new dependencies total roughly 1 MB unpacked plus small helpers, estimated transfer below 5 MB, no postinstall assets/browser downloads. `npm install @radix-ui/react-select` added 14 packages. Root `AGENTS.md` continues to govern the ~50 MB owner-download boundary.

## Preview motion refinement — 2026-11-01

Owner requested subtle, fast motion while preserving the current layout, spacing,
charcoal surfaces, brand palette, Plex typography and bilingual direction.

- Local theme color interpolation: 180ms for surfaces/text/borders; controls use
  120ms feedback. Theme labels share a stable footprint across toggles.
- Enabled controls press to 98.5% over 70ms, returning over 120ms. Focus outlines
  remain immediate and visible; disabled/busy controls do not compress.
- Dialog/backdrop have paired open/close animations: dialog 200ms in, 120ms out;
  backdrop 180ms in, 120ms out. The inspected synthetic record remains intact
  throughout the exit. Focus containment and opener return remain Radix-owned.
- Select menus use their Radix placement origin, 160ms in and 100ms out, with a
  restrained chevron rotation. Switch thumbs use transform-based translation,
  mirrored for Arabic, rather than animating layout-driving offsets.
- View and changed filter results receive one 140ms opacity acknowledgement,
  without remounting results, staggering rows, moving content or delaying input.
  The script cancels interrupted feedback and responds to changes in the motion
  preference. Closing mobile navigation returns focus to its visible summary.
- Reduced motion disables spatial, opacity and color animation, including
  portalled backdrops; immediate selection, focus and state feedback remain.
- Implementation stays in `frontend/app/[locale]/design-preview/`. No dependency
  was added and no production screen or shared token was changed.

Verification from `frontend/`: `npm run lint`, `npm run typecheck`, `npm run test`
(32 tests), and `npm run build` passed. From the repository root:
`node scripts/check-visual-preview.mjs` passed all eight Arabic/English ×
1440px/390px × light/dark combinations, including screenshots, geometry,
short-viewport dialog scrolling, keyboard focus/selection, contrast sampling,
theme/draft retention, and no API calls, page errors or document overflow.
`node scripts/check-preview-motion.mjs` passed all 16 combinations with normal
and reduced motion: actual animation frames, stable theme-toggle geometry,
press feedback, dialog exit content retention and focus return, Select keyboard
operation, view/filter feedback, RTL switch movement, mobile keyboard navigation
and live reduced-motion changes. The initial motion-check timing race was fixed
by capturing inside the browser's first animation frame rather than after a
cross-process round trip. Checks used installed headless Chrome with desktop
and mobile-sized viewports; these are not physical-device or Safari measurements.
The mechanical UI detector returned `[]`.

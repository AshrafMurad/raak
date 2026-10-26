# 10 — Raak Brand, Typography and UI/UX Specification

## Brand locked
- Product name: **رعاك | Raak**.
- Identity: healthcare coordination SaaS, trustworthy, calm, human, enterprise-practical, Arabic-first.
- Primary brand: `#243B70` (Midnight Blue); Accent `#7485CF` (Lavender); Background `#F8F9FD`; main text `#202A40`.
- Typography: IBM Plex Sans Arabic for Arabic; IBM Plex Sans for Latin. No alternate fonts without product decision.
- Logo **not selected**: exclude speculative logomark; use temporary text wordmark `رعاك` or `Raak` until separate branding phase.
- Visual character: light-first, crisp tables and calendars, restrained shadows, no green/teal primary, no glassmorphism/glow/giant gradients/medical clichés.

## Color tokens (semantic, not color names in components)
| Token | Hex | Use |
|---|---|---|
| `brand.primary` | `#243B70` | Primary CTA, active navigation labels, key links |
| `brand.primaryHover` | `#1A2D59` | Button hover / active |
| `brand.primarySubtle` | `#EEF1FA` | Selected row/sidebar background |
| `brand.accent` | `#7485CF` | Occasional chart series and decorative data emphasis; not semantic warning |
| `brand.accentSubtle` | `#E9EAF9` | Controlled accents and legend fills |
| `app.background` | `#F8F9FD` | Main dashboard canvas |
| `surface.default` | `#FFFFFF` | Cards, dialogs, inputs |
| `text.primary` | `#202A40` | Core text |
| `text.secondary` | `#647086` | Metadata and secondary labels |
| `border.default` | `#E3E7F0` | Inputs, borders, separators |
| `status.success` | `#23856A` | Completed, success |
| `status.warning` | `#A96A16` | Needs review, late cases |
| `status.danger` | `#C44650` | Failure/cancelled |
| `status.info` | `#315DA3` | Scheduled/info |
| `status.neutral` | `#667085` | Draft/inactive |

Ensure WCAG contrast for **specific combinations**, not a blanket claim that supplied colors are accessible. Prefer dark text on soft semantic backgrounds. Never use accent lavender for critical small text without a check.

## Typography tokens (explicit sizes; px)
| Semantic role | Size / line height | Weight | Usage |
|---|---|---|---|
| `display` | 36 / 48 | 700 | Marketing hero only |
| `pageTitle` | 28 / 40 | 700 | Page title (responsive to 24 mobile) |
| `sectionTitle` | 22 / 34 | 600 | Major page section |
| `cardTitle` | 18 / 28 | 600 | Card title/dialog title |
| `bodyLg` | 16 / 28 | 400 | Marketing/customer readable prose |
| `body` | 14 / 24 | 400 | Agency controls, forms, tables |
| `bodySm` | 13 / 22 | 400 | Compact metadata in staff views |
| `caption` | 12 / 20 | 400 | Non-essential secondary labels only |
| `button` | 14 / 20 | 500 | Controls |
| `tableHeader` | 13 / 20 | 600 | Table header |
| `sidebarLabel` | 14 / 22 | 500 | Navigation |
| `statValue` | 28 / 36 | 600/700 | KPI values, tabular numerals |

Allowed font weights 400,500,600,700. Use `font-variant-numeric: tabular-nums` for timestamps, counts, durations, monetary columns. Body and long-form patient portal content should prefer 16px for comfort, not 12px. Keep reasonable Arabic line height (1.65–1.85), avoid artificial letter spacing on Arabic text.

## RTL, LTR, bilingual rules
- Arabic default `lang="ar" dir="rtl"`; English `lang="en" dir="ltr"`. Entire layout mirrors logically: sidebar and breadcrumbs order, leading/trailing icons and input adornments.
- Prefer CSS logical properties (`margin-inline-start`, `padding-inline`, `inset-inline`, `border-inline`) over left/right.
- Account IDs, email, URLs, UUIDs, amounts, ISO date strings inside Arabic prose use local direction isolation (`dir="ltr"` where applicable) so mixed content does not reorder awkwardly.
- Translation namespaces per feature (`ar/dashboard.json`, `ar/visits.json`, `en/dashboard.json`, etc.); no literal business text in components, typed keys and fallback tests. Error codes translated at UI boundary.
- Arabic number presentation policy decided consistently before implementation (suggest 0–9 western digits for operational codes/time input; Arabic locale date labels). Dates displayed according to tenant timezone and user locale.
- Arabic & English email templates with appropriate direction and fallback for missing copy.

## Page inventory and high-level layout
**Public platform**: Landing, product overview, agency signup, agency pending status.

**Agency marketing/customer**: branded landing/services list/detail, request wizard, submission receipt, track-with-email verification, quote details/versions/accept/reject/revision, account signup/login, my requests, authorized family/patients, my visits, change request.

**Agency workspace**: dashboard, service requests (queue/detail), quotes, patients (list/profile/dedup), caregivers (list/profile/qualifications/availability), care plans (list/editor/versions/generation preview), visits (calendar/list/detail/candidate picker/bulk assignment), exception/reassignment queue, reports, notification center, team/invites, settings (branding, services, scheduling buffer/cutoffs, notification policy).

**Caregiver portal**: Today/My Visits, Visit detail, checklist, start/end, note draft, past visits, account profile. Prioritize 360–430px viewport.

**Platform operator**: tenants list/detail/status/owner, aggregate usage and operator audit only.

## Component rules
- Sidebar: light white surface; active item uses blue text + light blue surface; avoid saturated sidebar block.
- Header: page title + concise primary action, breadcrumb, contextual filters and notifications.
- Data tables: sticky headers on large tables; 44px+ interaction targets where possible; clear sort/filter, skeleton, empty and error states; overflow on mobile rather than crushing columns.
- Calendar: week and day views with local timezone indicator; `PLANNED` visibly distinct from confirmed `SCHEDULED`; show assignment health warning and primary/substitute badges.
- Forms: explicit visible labels; field-level errors, mandatory markers, summary on submit; preserve draft through recoverable errors where safe.
- Sensitive sections: explicit permission denied, never leak unseen identity or count; documents need private view affordance.
- Confirmations: destructive/state-changing actions show consequence and sometimes reason required; copy makes original appointment persistence clear for pending changes.
- Notifications: bell with unread count, safe generic copy, link to authorized entity.
- Cards: radius ~10–12px, borders default, subtle shadows only; dense agency pages; warmer and more spacious customer flows.
- Status chips: label plus tint; no reliance on hue alone. Avoid using lavender as clinical severity encoding.

## Wireframe content priorities
**Agency dashboard**: today confirmed/in-progress/completed, upcoming visits, unassigned visits, requests awaiting review, late/change requests, team availability, explicit timezone.

**Visit detail**: appointment window and state prominent; assigned caregiver; patient name only for authorized viewers; task list, actual start/end, changes/audit, action eligibility; separate review status.

**Quote view**: agency branding; offer version, line items and quantity/unit, currency/total, terms, expiry, revisions timeline; identity verification and explicit accept CTA; emphasize "not a payment" where helpful.

**Guest request**: short stepper service → requester + beneficiary → area + preferred window → review/submit. Don't collect full medical details from guest form. Confirmation explains no appointment yet.

## Breakpoints
- Mobile: 320–767px; caregiver/customer first, stacked forms, responsive tables via cards/scroll, sticky bottom action only if accessible.
- Tablet: 768–1023px; collapsible sidebar, 2-column summaries.
- Desktop: >=1024px; sidebar, content max width ~1440px, 12-column grid where useful.

## Accessibility and usability gates
- Keyboard navigation, visible focus, ARIA on dialogs/tabs, error messages tied to fields, minimum hit target, text zoom/reflow, no color-only semantics, skeleton reduced-motion support.
- Support screen readers in both languages; confirm Arabic semantic order with real content and actual loaded IBM Plex fonts.
- All critical flows usable without animation and with slow network/offline errors; on caregiver start/end do not show success until server confirms.

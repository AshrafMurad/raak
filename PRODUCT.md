# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Agency staff (primary)**: owners, coordinators, clinical reviewers — run requests, quotes, patients, caregivers, care plans, scheduling and visits all day in a dense workspace on desktop.
- **Caregivers**: field staff on phones (360–430px viewports); need today's visits, check-in/out, checklists, note drafts; unreliable networks.
- **Customers/families**: request care without an account, verify identity, review/accept quotes, coordinate for authorized dependents; agency-branded portal, warmer and less dense.
- **Platform operator**: Raak's own staff; tenant list/status and aggregate audit only.

## Product Purpose

Raak is a multi-tenant B2B SaaS for home-care agencies: request intake, versioned quotes, patients, caregivers, care plans, recurring-visit scheduling with conflict-free assignment, visit execution, notifications and operational reporting. Success = an agency can run its whole day — from family request to completed visit note — in Arabic-first comfort, with every authorization and state transition correct.

## Positioning

An operations and coordination platform, explicitly NOT an EMR, medical decision system, clinical advice engine, marketplace, or emergency service. Agency-licensed professionals stay responsible for clinical content. The intended position is trustworthy Arabic-first coordination: verified request ownership, versioned quotes, transactional scheduling with travel buffers, and append-only visit history. These are product requirements, not claims that every workflow is already implemented.

## Operating Context

- Arabic default (`ar`, RTL); English LTR secondary; full logical mirroring; tenant timezone display.
- Agencies operate branded subdomains (e.g. `afiya.<RAAK_BASE_DOMAIN>`); agency branding colors customer-facing surfaces.
- Dense daily-use desktop workspace; mobile caregiver portal; no native mobile apps in V1.
- Synthetic data only in dev/demos/tests. Processing real sensitive data requires the production-readiness gates in the specification pack.
- No platform subscription billing, no patient payment processing in V1; quote acceptance is not payment.

## Capabilities and Constraints

- Locked product decisions D01–D23 live in `docs/01_PRODUCT_AND_DECISIONS.md`; state machines, scheduling and commercial rules in `docs/04_BUSINESS_RULES.md`.
- TypeScript strict, typed DTO validation (Zod), Prisma migrations, server-resolved tenant/principal scoping, deny-by-default authorization.
- Status states are contractual (PLANNED ≠ confirmed SCHEDULED); completed visit notes append-only; quote versions immutable.
- Frontend: Next.js 16 App Router, React 19, Tailwind v4, self-hosted IBM Plex fonts (frontend/). Backend: Express + BullMQ worker (backend/).

## Brand Commitments

- Name: رعاك | Raak. Temporary text wordmark only — no logomark until a separate branding phase.
- Locked palette: primary `#243B70` (hover `#1A2D59`, subtle `#EEF1FA`), accent `#7485CF` (subtle `#E9EAF9`), background `#F8F9FD`, text `#202A40`/`#647086`, border `#E3E7F0`, five status colors — semantic tokens in `frontend/app/tokens.css`.
- Locked type: IBM Plex Sans Arabic (Arabic), IBM Plex Sans (Latin); weights 400–700; explicit px scale with tabular numerals for data.
- Character: light-first, calm, human, enterprise-practical; crisp tables and calendars; restrained shadows; radius 10–12px; NO glassmorphism, glow, giant gradients, green/teal primary, or medical clichés.
- Craft bar (owner-confirmed): Attio/Notion calm-workspace cohesion — quiet interface, crisp tables, open page layouts and subtle interactions. No clinical-software references were selected. The agency workspace is exceptions-first; the first visual deliverable is a component board plus a realistic synthetic workspace example.

## Evidence on Hand

- Complete specification pack in `docs/` (14 documents + git standards) is the source of truth.
- Sprint-0 frontend shell exists: locale routing, auth pages, `tokens.css`, IBM Plex via @fontsource.
- No real customer content, testimonials, imagery or logos exist; nothing may be fabricated as real — demo content must be synthetic and labeled so.

## Product Principles

1. Deny by default: every query, mutation and pixel is tenant- and authorization-scoped; privacy shows up in the UI (permission-denied states, safe generic copy).
2. State honesty: the UI never implies a booking, payment, or clinical fact that the state machine has not committed.
3. Arabic-first, not Arabic-ported: RTL, bilingual and typography decisions are native, never a flipped LTR afterthought.
4. Operational calm: dense but quiet — coordinators spend all day here; reduce noise, never add ornament.
5. Enterprise-practical: every screen ships with its empty, loading, error and offline truth.

## Accessibility & Inclusion

- Required checks: WCAG contrast per actual color combination; keyboard navigation, visible focus, ARIA on interactive patterns; screen-reader support in both Arabic and English; 44px+ targets where possible; reduced-motion support; no color-only semantics (label + tint). This record does not certify that those checks have passed.

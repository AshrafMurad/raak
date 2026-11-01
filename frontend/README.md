# Raak Frontend

Next.js 16 (App Router, Turbopack) + TypeScript strict + Tailwind CSS 4. Arabic-first RTL (`/ar` default) with English LTR (`/en`), IBM Plex fonts, locked brand tokens. Sprint 0 app shell only — see the workspace `docs/` spec pack.

## Prereqs

- Node.js 24 (`.nvmrc`)
- Backend running (`../backend`) if you wire API calls later; the shell itself needs no services.

## Develop

```bash
copy .env.example .env.local   # Windows: use `copy`; macOS/Linux: `cp`
npm install
npm run dev                    # http://localhost:3000 — `/` redirects to `/ar`
```

## Verify

```bash
npm run lint
npm run typecheck
npm run test     # dictionary parity, locale helpers, readiness success/failure
npm run build
```

## Layout

```text
proxy.ts            locale redirect (/ -> /ar) — Next 16 proxy convention
app/[locale]/       layout.tsx (html lang/dir + fonts), page.tsx (marked placeholder)
app/globals.css     Tailwind entry mapping locked tokens to utilities
app/tokens.css      locked brand palette + typography (docs 10; do not restyle)
messages/{ar,en}/   typed dictionaries (common namespace)
lib/i18n.ts         locale set, direction map, getDictionary
```

## Conventions

- No literal business text in components; typed dictionary keys only (docs 10).
- Arabic default `dir="rtl"`; use CSS logical properties for layout mirroring.
- Brand colors/fonts are locked (D22/D23): no alternate palette, no invented logo.

## Visual-system preview

Open `/ar/design-preview` (Arabic RTL) or `/en/design-preview` (English LTR).
The top switch changes between an exceptions-first workspace and the component
board. Search, state/category filters, example fields and detail panels are
interactive. All people and records are synthetic; no API calls or writes occur.

The owned button and centered Dialog composition use shadcn-style CVA/Slot and Radix
patterns, with Raak-specific styling. The owner approved the completed preview as
the app-wide visual baseline on 2026-11-01. Components currently remain local;
before production use, promote reusable foundations to `components/ui/` and
`components/layout/` and make the preview consume those same shared implementations.
Follow the reuse, token and verification contract in
`../docs/10_UI_UX_DESIGN_SYSTEM.md`; development history is in
`../docs/design/VISUAL_PREVIEW_BRIEF.md`.

After building, run `node scripts/check-visual-preview.mjs` from the repository
root for the preview browser checks. It uses the installed Chrome channel and
the owner-installed `@playwright/test` package; it never downloads a browser.
Screenshots are saved locally under `.impeccable/review/`.

### Dark comparison

Open `/ar/design-preview?theme=dark` or `/en/design-preview?theme=dark`, or use
the sun/moon control in the header. The theme is retained in the URL across
refresh and language changes. The workspace, component board and detail Dialog
share the selected theme; the default remains light. The current light/dark
treatments are part of the approved visual baseline; locked brand primitives
remain unchanged.

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

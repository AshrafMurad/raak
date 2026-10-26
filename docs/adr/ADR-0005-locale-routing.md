# ADR-0005 — Locale routing: path segments `/ar` (default) and `/en`, hand-rolled typed dictionaries

Date: 2026-10-26
Status: Accepted
Context: Doc 10 requires Arabic-default RTL and English LTR with structured namespaces and typed keys; Sprint 0 needs only the app shell. Next 16 replaces `middleware.ts` with `proxy.ts`.

## Decision

- Routes live under `app/[locale]/` with `ar` and `en` as the only accepted values (`generateStaticParams` + `dynamicParams=false`).
- `app/[locale]/layout.tsx` renders `<html lang dir>` (`ar`/`rtl`, `en`/`ltr`); no root `app/layout.tsx`.
- `app/proxy.ts` redirects `/` (and any path missing a locale prefix) to `/ar< path>`.
- Translations: typed dictionaries per namespace (`messages/{ar,en}/*.json`) with a small `getDictionary` helper and a key-parity unit test. No i18n framework yet; when real screens with routing/locale-negotiation needs arrive (Sprint 2), evaluate `next-intl` (or equivalent) with an ADR.

## Consequences

- Zero-dependency shell now; canonical status codes remain English (A11); Arabic labels only in UI.
- Adding a locale requires touching `Locale` union, dictionaries, and `generateStaticParams` together (enforced by parity test).

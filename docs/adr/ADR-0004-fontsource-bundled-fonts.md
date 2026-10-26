# ADR-0004 — IBM Plex fonts bundled via Fontsource packages

Date: 2026-10-26
Status: Accepted
Context: D23 locks IBM Plex Sans Arabic (Arabic) + IBM Plex Sans (Latin), weights 400–700. `next/font/google` downloads fonts at build time, which breaks offline/CI reproducibility.

## Decision

Bundle fonts as npm dependencies:

- `@fontsource/ibm-plex-sans-arabic` weights 400/500/600/700 (includes Arabic + Latin subsets)
- `@fontsource/ibm-plex-sans` weights 400/500/600/700

CSS imported once in the locale root layout. `font-family` stacks set per typography tokens in `@raak/ui` (`tokens.css`).

## Consequences

- Deterministic builds without network font fetches; IBM Plex is OFL-licensed, bundling permitted.
- No `next/font` automatic fallback metrics; acceptable for Sprint 0 shell, revisit if font-swap flicker matters.

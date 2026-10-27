# ADR-0008 — Tenant-host API ingress

Date: 2026-10-27
Status: Accepted (product owner instruction)

## Context

The initial illustrative route map placed the browser API at
`api.<RAAK_BASE_DOMAIN>` and required a separate verified workspace route to
establish tenant context. Sprint 1 instead resolves tenant identity directly
from an allowlisted tenant hostname and uses host-only session cookies. A
central browser API hostname would require every tenant request to carry and
verify a second workspace route, and would share the API cookie host across
tenants.

## Decision

- Browser API calls are same-origin by hostname. For both
  `<tenantSlug>.<RAAK_BASE_DOMAIN>` and `platform.<RAAK_BASE_DOMAIN>`, the edge
  routes `/v1/*` to the Express API and all web paths to Next.js.
- The edge preserves the validated external host when proxying to Express. It
  strips client-supplied forwarding headers, sets its own forwarding metadata,
  and accepts only configured platform/base-domain hosts.
- Express independently allowlists the platform host or a single valid tenant
  slug below `BASE_DOMAIN`, resolves the slug against PostgreSQL, and ignores
  client-supplied tenant IDs or slugs.
- Session and CSRF cookies remain host-only. A cookie issued on one tenant host
  is therefore not sent to another tenant or platform host; server-side session
  audience checks remain mandatory defense in depth.
- The Express upstream may have an internal service address, but a shared
  `api.<RAAK_BASE_DOMAIN>` is not the browser-facing tenant API in MVP.
- Development may use the same hostname on separate web/API ports. Credentialed
  CORS is restricted to explicitly configured development origins; production
  remains same-origin at the edge.

## Consequences

- Tenant context has one authoritative browser boundary: the validated host.
- Wildcard TLS and DNS are required only for the product-owned base domain;
  custom agency domains remain outside MVP under A08.
- Production deployment must prove host preservation, forwarded-header
  sanitization, `/v1` path routing, TLS, and host-only cookie behavior before
  real users or sensitive data are admitted.
- The route examples in `docs/03_USER_FLOWS.md` and tenant-routing guidance in
  `docs/08_ARCHITECTURE.md` are updated by this ADR.

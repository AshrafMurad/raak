/**
 * Tenant host resolution (docs 05 rule 2): the ONLY trusted source of tenant
 * identity is the Host header validated against the configured base domain.
 * Client-supplied slug/tenant headers are never consulted. Unknown or
 * non-conforming hosts are rejected (fail closed) — the caller gets the same
 * non-enumerating 404 it would get for an unknown tenant.
 */
import type { Request } from 'express';
import type { DatabaseClient } from '../../db/client';
import type { ResolvedTenantContext } from '../../contracts';
import { SLUG_PATTERN } from '../../contracts/auth';

export type HostRealm =
  | { kind: 'PLATFORM' }
  | { kind: 'AGENCY'; tenant: ResolvedTenantContext }
  | { kind: 'REJECTED' };

export interface HostResolverConfig {
  /** e.g. `raak.example.com` in production, `localhost` in development. */
  baseDomain: string;
  /** Exact host serving the platform (super admin) app. */
  platformHost: string;
}

export type HostRealmResolver = (req: Request) => Promise<HostRealm>;

function normalizeHost(raw: string | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  // Strip :port (but not the colons of a bracketed IPv6 literal, which we do
  // not accept anyway — hosts here are always domain names).
  const colon = host.lastIndexOf(':');
  if (colon > 0 && !host.includes(']')) {
    host = host.slice(0, colon);
  }
  return host.length > 0 ? host : null;
}

export function createHostResolver(db: DatabaseClient, config: HostResolverConfig): HostRealmResolver {
  const baseDomain = config.baseDomain.toLowerCase();
  const platformHost = config.platformHost.toLowerCase();
  const suffix = `.${baseDomain}`;

  return async (req: Request): Promise<HostRealm> => {
    const host = normalizeHost(req.get('host'));
    if (!host) return { kind: 'REJECTED' };
    if (host === platformHost) return { kind: 'PLATFORM' };
    // The bare base domain and anything not under it are not tenant hosts.
    if (host === baseDomain || !host.endsWith(suffix)) return { kind: 'REJECTED' };
    const slug = host.slice(0, host.length - suffix.length);
    if (!SLUG_PATTERN.test(slug)) return { kind: 'REJECTED' };
    const tenant = await db.tenant.findUnique({ where: { slug } });
    if (!tenant) return { kind: 'REJECTED' };
    return {
      kind: 'AGENCY',
      tenant: { tenantId: tenant.id, slug: tenant.slug, status: tenant.status },
    };
  };
}

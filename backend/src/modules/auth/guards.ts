/**
 * HTTP guards (docs 05 enforcement rules 2-5): host realm -> session -> CSRF
 * -> permission. Each layer fails closed with the stable error envelope.
 * Cookies are parsed without an extra dependency (session/CSRF values are
 * base64url — safe for naive header splitting).
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { DatabaseClient } from '../../db/client';
import type { ServerSessionContext } from '../../contracts';
import { errorEnvelope } from '../../contracts';
import { hashToken, safeEqual } from './crypto';
import type { HostRealm, HostRealmResolver } from './host-resolver';
import type { ResolvedStaff, ResolvedCustomer, ResolvedOperator } from './session.service';
import { resolveSession } from './session.service';
import { sessionCookieName, csrfCookieName } from './cookies';
import { authorize, type PermissionAction } from './permissions';

export interface AuthState {
  sessionId: string;
  session: ServerSessionContext;
  realm: HostRealm & { kind: 'PLATFORM' | 'AGENCY' };
  csrfTokenHash: string;
  staff?: ResolvedStaff;
  customer?: ResolvedCustomer;
  operator?: ResolvedOperator;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthState;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

function realmFrom(res: Response): HostRealm & { kind: 'PLATFORM' | 'AGENCY' } | undefined {
  const realm = res.locals.realm as HostRealm | undefined;
  if (realm && (realm.kind === 'PLATFORM' || realm.kind === 'AGENCY')) return realm;
  return undefined;
}

export function requireHostRealm(resolver: HostRealmResolver): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const realm = await resolver(req);
      if (realm.kind === 'REJECTED') {
        res
          .status(404)
          .json(
            errorEnvelope('RESOURCE_NOT_FOUND', 'Resource not found.', {
              requestId: res.locals.requestId as string | undefined,
            }),
          );
        return;
      }
      res.locals.realm = realm;
      next();
    })().catch(next);
  };
}

export function requireSession(db: DatabaseClient): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const realm = realmFrom(res);
      if (!realm) {
        next(new Error('requireSession used without requireHostRealm'));
        return;
      }
      const cookieName = sessionCookieName(realm.kind === 'PLATFORM' ? 'PLATFORM' : 'AGENCY');
      const cookies = parseCookies(req.headers.cookie);
      const sessionToken = cookies[cookieName];
      if (!sessionToken) {
        res
          .status(401)
          .json(
            errorEnvelope('UNAUTHENTICATED', 'Authentication required.', {
              requestId: res.locals.requestId as string | undefined,
            }),
          );
        return;
      }
      const resolved = await resolveSession(db, sessionToken);
      if (!resolved) {
        res
          .status(401)
          .json(
            errorEnvelope('UNAUTHENTICATED', 'Authentication required.', {
              requestId: res.locals.requestId as string | undefined,
            }),
          );
        return;
      }
      // Realm/tenant binding: a session cookie from another realm or tenant
      // host is simply unauthenticated here (docs 05: tenant resolved first,
      // never a shared sign-in).
      if (realm.kind === 'PLATFORM') {
        if (resolved.session.principalType !== 'PLATFORM_OPERATOR') {
          res
            .status(401)
            .json(
              errorEnvelope('UNAUTHENTICATED', 'Authentication required.', {
                requestId: res.locals.requestId as string | undefined,
              }),
            );
          return;
        }
      } else {
        const { tenant } = realm;
        if (
          (resolved.session.principalType !== 'AGENCY_STAFF' &&
            resolved.session.principalType !== 'AGENCY_CUSTOMER') ||
          resolved.session.tenantId !== tenant.tenantId
        ) {
          res
            .status(401)
            .json(
              errorEnvelope('UNAUTHENTICATED', 'Authentication required.', {
                requestId: res.locals.requestId as string | undefined,
              }),
            );
          return;
        }
      }
      req.auth = {
        sessionId: resolved.sessionId,
        session: resolved.session,
        realm,
        csrfTokenHash: resolved.csrfTokenHash,
        ...(resolved.staff !== undefined ? { staff: resolved.staff } : {}),
        ...(resolved.customer !== undefined ? { customer: resolved.customer } : {}),
        ...(resolved.operator !== undefined ? { operator: resolved.operator } : {}),
      };
      next();
    })().catch(next);
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireCsrf(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const auth = req.auth;
    if (!auth) {
      res
        .status(401)
        .json(
          errorEnvelope('UNAUTHENTICATED', 'Authentication required.', {
            requestId: res.locals.requestId as string | undefined,
          }),
        );
      return;
    }
    const header = req.get('X-CSRF-Token');
    if (!header || !safeEqual(hashToken(header), auth.csrfTokenHash)) {
      res
        .status(403)
        .json(
          errorEnvelope('FORBIDDEN', 'CSRF token missing or invalid.', {
            requestId: res.locals.requestId as string | undefined,
          }),
        );
      return;
    }
    next();
  };
}

export function requirePermission(action: PermissionAction): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) {
      res
        .status(401)
        .json(
          errorEnvelope('UNAUTHENTICATED', 'Authentication required.', {
            requestId: res.locals.requestId as string | undefined,
          }),
        );
      return;
    }
    const decision = authorize(
      {
        principalType: auth.session.principalType,
        ...(auth.staff?.role !== undefined ? { role: auth.staff.role } : {}),
        ...(auth.realm.kind === 'AGENCY' ? { tenantStatus: auth.realm.tenant.status } : {}),
      },
      action,
    );
    if (!decision.allowed) {
      res
        .status(403)
        .json(
          errorEnvelope('FORBIDDEN', 'You are not allowed to perform this action.', {
            requestId: res.locals.requestId as string | undefined,
          }),
        );
      return;
    }
    next();
  };
}

/** Convenience re-export so wiring code can build cookie names per realm. */
export { sessionCookieName, csrfCookieName };

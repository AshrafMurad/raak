/**
 * Realm-scoped auth cookies (docs 05): host-only (no Domain attribute) so a
 * tenant cookie never leaks to sibling subdomains or the platform host.
 * Session secret cookie is HttpOnly; the CSRF secret is readable by the SPA
 * to echo back in X-CSRF-Token. Secure + SameSite=Lax always.
 */
import type { Response } from 'express';

export type AuthRealm = 'PLATFORM' | 'AGENCY';

const REALM_COOKIE_NAMES: Record<AuthRealm, { session: string; csrf: string }> = {
  PLATFORM: { session: 'raak_session_platform', csrf: 'raak_csrf_platform' },
  AGENCY: { session: 'raak_session_agency', csrf: 'raak_csrf_agency' },
};

export interface SessionCookieInput {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export function setSessionCookies(res: Response, realm: AuthRealm, input: SessionCookieInput): void {
  const names = REALM_COOKIE_NAMES[realm];
  res.cookie(names.session, input.sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: input.expiresAt,
  });
  res.cookie(names.csrf, input.csrfToken, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: input.expiresAt,
  });
}

export function clearSessionCookies(res: Response, realm: AuthRealm): void {
  const names = REALM_COOKIE_NAMES[realm];
  res.clearCookie(names.session, { path: '/' });
  res.clearCookie(names.csrf, { path: '/' });
}

export function sessionCookieName(realm: AuthRealm): string {
  return REALM_COOKIE_NAMES[realm].session;
}

export function csrfCookieName(realm: AuthRealm): string {
  return REALM_COOKIE_NAMES[realm].csrf;
}

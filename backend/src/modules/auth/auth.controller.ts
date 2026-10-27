/**
 * Identity routes (docs 07): login/logout/me/verify-email/forgot/reset.
 * Public routes stay behind the global host-realm gate; session routes add
 * requireSession (+ CSRF for mutations). Rate limits per docs 05.
 */
import { Router, type Response } from 'express';
import { LoginSchema, VerifyEmailSchema, ForgotPasswordSchema, ResetPasswordSchema } from '../../contracts';
import { ApiError } from '../../api-error';
import type { DatabaseClient } from '../../db/client';
import { createAuthService } from './auth.service';
import { clearSessionCookies, setSessionCookies, type AuthRealm } from './cookies';
import { requireCsrf, requireSession, type AuthState } from './guards';
import type { HostRealm } from './host-resolver';
import { createRateLimiter } from './rate-limit';
import { asyncHandler, parseBody } from '../common/http';

export interface RateLimits {
  registerPerHour: number;
  loginPer15Min: number;
  forgotPerHour: number;
  verifyPerHour: number;
  resetPerHour: number;
  invitationAcceptPerHour: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  registerPerHour: 5,
  loginPer15Min: 10,
  forgotPerHour: 5,
  verifyPerHour: 30,
  resetPerHour: 10,
  invitationAcceptPerHour: 30,
};

export interface AuthControllerDeps {
  db: DatabaseClient;
  now(): Date;
  buildLink(kind: 'owner_verification' | 'password_reset', token: string): string;
  rateLimits?: Partial<RateLimits>;
  /** Injectable for tests; production uses the real clock. */
  rateLimiter?: ReturnType<typeof createRateLimiter>;
}

function realmOf(res: Response): HostRealm & { kind: 'PLATFORM' | 'AGENCY' } {
  const realm = res.locals.realm as HostRealm | undefined;
  if (!realm || realm.kind === 'REJECTED') throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  return realm;
}

export function createAuthRouter(deps: AuthControllerDeps): Router {
  const router = Router();
  const service = createAuthService({ db: deps.db, now: deps.now, buildLink: deps.buildLink });
  const limiter = deps.rateLimiter ?? createRateLimiter();
  const limits = { ...DEFAULT_RATE_LIMITS, ...deps.rateLimits };
  const byIp = (name: string, limit: number, windowMs: number) =>
    limiter({ name, key: (req) => req.ip ?? 'unknown', limit, windowMs });

  router.post(
    '/auth/login',
    limiter({
      name: 'login',
      key: (req) => `${req.ip ?? 'unknown'}:${String((req.body as { email?: unknown })?.email ?? '').toLowerCase()}`,
      limit: limits.loginPer15Min,
      windowMs: 15 * 60_000,
    }),
    asyncHandler(async (req, res) => {
      const dto = parseBody(LoginSchema, req);
      const realm = realmOf(res);
      const { created, me } = await service.login(realm, dto.email, dto.password);
      const realmKind: AuthRealm = realm.kind === 'PLATFORM' ? 'PLATFORM' : 'AGENCY';
      setSessionCookies(res, realmKind, {
        sessionToken: created.sessionToken,
        csrfToken: created.csrfToken,
        expiresAt: created.expiresAt,
      });
      res.json({ data: { ...me, csrfToken: created.csrfToken } });
    }),
  );

  router.post(
    '/auth/logout',
    requireSession(deps.db),
    requireCsrf(),
    asyncHandler(async (req, res) => {
      const auth = req.auth as AuthState;
      await service.logout(auth);
      clearSessionCookies(res, auth.realm.kind === 'PLATFORM' ? 'PLATFORM' : 'AGENCY');
      res.status(204).send();
    }),
  );

  router.get(
    '/auth/me',
    requireSession(deps.db),
    asyncHandler(async (req, res) => {
      const auth = req.auth as AuthState;
      const me = {
        principalType: auth.session.principalType,
        email:
          auth.staff?.emailNormalized ?? auth.customer?.emailNormalized ?? auth.operator?.emailNormalized ?? '',
        ...(auth.staff?.role !== undefined ? { role: auth.staff.role } : {}),
        ...(auth.realm.kind === 'AGENCY'
          ? {
              tenant: {
                tenantId: auth.realm.tenant.tenantId,
                slug: auth.realm.tenant.slug,
                status: auth.realm.tenant.status,
              },
            }
          : {}),
      };
      res.json({ data: me });
    }),
  );

  router.post(
    '/auth/verify-email',
    byIp('verify-email', limits.verifyPerHour, 60 * 60_000),
    asyncHandler(async (req, res) => {
      const dto = parseBody(VerifyEmailSchema, req);
      await service.verifyOwnerEmail(dto.token);
      res.json({ data: { ok: true } });
    }),
  );

  router.post(
    '/auth/forgot-password',
    byIp('forgot-password', limits.forgotPerHour, 60 * 60_000),
    asyncHandler(async (req, res) => {
      const dto = parseBody(ForgotPasswordSchema, req);
      await service.requestPasswordReset(realmOf(res), dto.email);
      res.status(202).json({ data: { ok: true } });
    }),
  );

  router.post(
    '/auth/reset-password',
    byIp('reset-password', limits.resetPerHour, 60 * 60_000),
    asyncHandler(async (req, res) => {
      const dto = parseBody(ResetPasswordSchema, req);
      await service.resetPassword(dto.token, dto.newPassword);
      res.json({ data: { ok: true } });
    }),
  );

  return router;
}

import { randomUUID } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { RequestIdHeaderPattern, errorEnvelope } from './contracts';
import type { AppEnv } from './config/env';
import type { Logger } from './logger';
import type { DatabaseClient } from './db/client';
import { ApiError } from './api-error';
import { createHealthRouter } from './modules/health/controller';
import type { HealthService } from './modules/health/service';
import { createHostResolver } from './modules/auth/host-resolver';
import { requireHostRealm } from './modules/auth/guards';
import { createAuthRouter, type RateLimits } from './modules/auth/auth.controller';
import { createAgencyRouter } from './modules/agency/agency.controller';

export interface AppDeps {
  env: AppEnv;
  logger: Logger;
  health: HealthService;
  now(): Date;
  /** When absent (no DATABASE_URL) only health endpoints are mounted. */
  db?: DatabaseClient;
  rateLimits?: Partial<RateLimits>;
}

/**
 * Correlation: accept an opaque client `X-Request-ID` only if it matches a safe
 * pattern; otherwise generate one. Echoed on the response and used in error
 * envelopes (docs 07).
 */
function requestIdMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.get('X-Request-ID');
    const requestId = incoming && RequestIdHeaderPattern.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.locals.requestId = requestId;
    res.on('finish', () => {
      if (res.statusCode >= 500) {
        logger.warn('request completed with server error', {
          requestId,
          method: req.method,
          statusCode: res.statusCode,
        });
      }
    });
    next();
  };
}

function notFoundHandler(req: Request, res: Response) {
  res.status(404).json(
    errorEnvelope('RESOURCE_NOT_FOUND', 'Resource not found.', {
      requestId: res.locals.requestId as string | undefined,
    }),
  );
}

interface HttpErrorLike extends Error {
  status?: number;
  statusCode?: number;
}

function isHttpErrorLike(err: unknown): err is HttpErrorLike {
  return err instanceof Error;
}

function errorHandler(logger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = res.locals.requestId as string | undefined;

    if (res.headersSent) {
      req.destroy?.();
      return;
    }

    // Domain errors carry the stable contract code (docs 07).
    if (err instanceof ApiError) {
      res.status(err.status).json(
        errorEnvelope(err.code, err.message, {
          ...(err.details !== undefined ? { details: err.details } : {}),
          requestId,
        }),
      );
      return;
    }

    const status = isHttpErrorLike(err) ? (err.status ?? err.statusCode ?? 500) : 500;

    if (status === 400 || status === 413) {
      // Body-parser style failures: safe generic message, no internals leaked.
      res
        .status(400)
        .json(
          errorEnvelope('VALIDATION_FAILED', 'Request body could not be parsed.', { requestId }),
        );
      return;
    }

    logger.error('unhandled error', {
      requestId,
      method: req.method,
      errorType: err instanceof Error ? err.name : 'UnknownError',
    });
    res
      .status(500)
      .json(errorEnvelope('INTERNAL_ERROR', 'Unexpected server error.', { requestId }));
  };
}

/**
 * CORS for the browser app (docs 08): allowlisted origins only, credentials
 * required for cookies. A wildcard origin is never combined with credentials.
 */
function corsMiddleware(allowOrigins: ReadonlyArray<string>) {
  const allowed = new Set(allowOrigins.map((origin) => origin.toLowerCase()));
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (origin && allowed.has(origin.toLowerCase())) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Request-ID');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }
    next();
  };
}

/** Email action links queued in the outbox (worker stub renders/sends later). */
function makeLinkBuilder(env: AppEnv) {
  const base = env.BASE_DOMAIN ?? 'localhost.invalid';
  const platformHost = env.platformHost ?? `platform.${base}`;
  const scheme = env.NODE_ENV === 'production' ? 'https' : 'http';
  return (kind: 'owner_verification' | 'password_reset', token: string): string => {
    const page = kind === 'owner_verification' ? 'verify-email' : 'reset-password';
    return `${scheme}://${platformHost}/ar/${page}?token=${token}`;
  };
}

const realmReject = (_req: Request, res: Response) => {
  res.status(404).json(errorEnvelope('RESOURCE_NOT_FOUND', 'Resource not found.'));
};

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  if (deps.env.trustProxyTokens.length > 0) {
    app.set('trust proxy', [...deps.env.trustProxyTokens]);
  }

  app.use(requestIdMiddleware(deps.logger));
  app.use(corsMiddleware(deps.env.corsOrigins));
  app.use(express.json({ limit: '1mb' }));
  app.use('/v1', createHealthRouter({ health: deps.health, now: deps.now }));

  if (deps.db) {
    const baseDomain = deps.env.BASE_DOMAIN;
    if (baseDomain) {
      // Every non-health route is host-realm gated (docs 05 rule 2).
      const hostResolver = createHostResolver(deps.db, {
        baseDomain,
        platformHost: deps.env.platformHost ?? `platform.${baseDomain}`,
      });
      app.use('/v1', requireHostRealm(hostResolver));
      const buildLink = makeLinkBuilder(deps.env);
      app.use(
        '/v1',
        createAuthRouter({ db: deps.db, now: deps.now, buildLink, rateLimits: deps.rateLimits }),
      );
      app.use(
        '/v1',
        createAgencyRouter({
          db: deps.db,
          now: deps.now,
          buildLink: (kind, token) => buildLink(kind, token),
          rateLimits: deps.rateLimits,
        }),
      );
    } else {
      // Fail closed when tenant routing is unconfigured.
      app.use('/v1', realmReject);
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler(deps.logger));
  return app;
}

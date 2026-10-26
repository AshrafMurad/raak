import { randomUUID } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { RequestIdHeaderPattern, errorEnvelope } from './contracts';
import type { AppEnv } from './config/env';
import type { Logger } from './logger';
import { createHealthRouter } from './modules/health/controller';
import type { HealthService } from './modules/health/service';

export interface AppDeps {
  env: AppEnv;
  logger: Logger;
  health: HealthService;
  now(): Date;
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
    const status = isHttpErrorLike(err) ? (err.status ?? err.statusCode ?? 500) : 500;

    if (res.headersSent) {
      req.destroy?.();
      return;
    }

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

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  if (deps.env.trustProxyTokens.length > 0) {
    app.set('trust proxy', [...deps.env.trustProxyTokens]);
  }

  app.use(requestIdMiddleware(deps.logger));
  app.use(express.json({ limit: '1mb' }));
  app.use('/v1', createHealthRouter({ health: deps.health, now: deps.now }));

  app.use(notFoundHandler);
  app.use(errorHandler(deps.logger));
  return app;
}

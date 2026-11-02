/**
 * Shared transport helpers for module controllers: strict body parsing with
 * safe issue projection and async error routing into the central handler.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodType } from 'zod';
import { ApiError } from '../../api-error';

export function parseBody<T>(schema: ZodType<T>, req: Request): T {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Request body failed validation.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

export function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/** Parse and require an Idempotency-Key (docs 07 high-impact POSTs). */
export function idempotencyKey(req: Request): string {
  const parsed = z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,128}$/)
    .safeParse(req.get('Idempotency-Key'));
  if (!parsed.success)
    throw new ApiError(422, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.');
  return parsed.data;
}

/** Same-origin (or dev allowlisted same-host) guard for guest-cookie portal
 * mutations (docs 07 guest transport anti-CSRF). */
export function portalOriginGuard(allowedOrigins: readonly string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origin = req.get('origin');
    if (req.method !== 'GET' && origin) {
      try {
        const parsed = new URL(origin);
        const host = req.get('host')?.toLowerCase();
        const sameOrigin = parsed.host === host;
        const trustedDevOrigin =
          allowedOrigins.includes(parsed.origin) && parsed.hostname === host?.split(':')[0];
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          parsed.origin !== origin ||
          (!sameOrigin && !trustedDevOrigin)
        )
          throw new Error();
      } catch {
        next(new ApiError(403, 'FORBIDDEN', 'Origin unavailable.'));
        return;
      }
    }
    next();
  };
}

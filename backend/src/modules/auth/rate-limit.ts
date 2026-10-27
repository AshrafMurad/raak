/**
 * Minimal in-memory fixed-window rate limiter for Sprint 1 public endpoints
 * (register, login, forgot-password, invitation accept). Single-instance by
 * design; Redis-backed limiting replaces it when the API scales horizontally
 * (recorded as a Sprint 1 risk in the plan).
 */
import type { RequestHandler, Request } from 'express';
import { errorEnvelope } from '../../contracts';

export interface RateLimitOptions {
  /** Bucket namespace (per-endpoint). */
  name: string;
  key(req: Request): string;
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const SWEEP_EVERY = 10_000;

export function createRateLimiter(now: () => Date = () => new Date()): (options: RateLimitOptions) => RequestHandler {
  const buckets = new Map<string, Bucket>();
  let calls = 0;

  function sweep(currentMs: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentMs) buckets.delete(key);
    }
  }

  return ({ name, key, limit, windowMs }: RateLimitOptions): RequestHandler => {
    return (req, res, next) => {
      const currentMs = now().getTime();
      calls += 1;
      if (calls % SWEEP_EVERY === 0) sweep(currentMs);

      const bucketKey = `${name}:${key(req)}`;
      const bucket = buckets.get(bucketKey);
      if (!bucket || bucket.resetAt <= currentMs) {
        buckets.set(bucketKey, { count: 1, resetAt: currentMs + windowMs });
        next();
        return;
      }
      bucket.count += 1;
      if (bucket.count > limit) {
        res
          .status(429)
          .json(
            errorEnvelope('RATE_LIMITED', 'Too many requests. Try again later.', {
              requestId: res.locals.requestId as string | undefined,
            }),
          );
        return;
      }
      next();
    };
  };
}

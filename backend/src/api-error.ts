import type { ErrorCode } from './contracts';

/**
 * Domain error carrying the stable API contract code (docs 07). Controllers
 * throw; the central error handler maps to the JSON envelope. Never include
 * SQL/provider/token internals in `message`.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

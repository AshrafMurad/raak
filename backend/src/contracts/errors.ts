import { z } from 'zod';

/**
 * Stable API error contract (docs 07): always a stable machine `code`,
 * a human-safe message (no SQL/provider/token data), optional details,
 * and the correlation requestId.
 */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'RESOURCE_NOT_FOUND',
  'VALIDATION_FAILED',
  'INTERNAL_ERROR',
  'TENANT_INACTIVE',
  'TENANT_SLUG_TAKEN',
  'TOKEN_EXPIRED',
  'TOKEN_ALREADY_USED',
  'RATE_LIMITED',
  'STATE_TRANSITION_INVALID',
  'QUOTE_EXPIRED',
  'QUOTE_SUPERSEDED',
  'QUOTE_REVISION_PENDING',
  'VISIT_VERSION_CONFLICT',
  'SCHEDULE_CONFLICT',
  'CAREGIVER_UNAVAILABLE',
  'QUALIFICATION_INVALID',
  'PATIENT_GRANT_REQUIRED',
  'PLAN_DURATION_EXCEEDED',
  'RECURRENCE_TIME_INVALID',
  'IDEMPOTENCY_CONFLICT',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  options: { details?: unknown; requestId?: string } = {},
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(options.details !== undefined ? { details: options.details } : {}),
      ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
    },
  };
}

/** Success responses are wrapped in `data` (docs 07 assign example). */
export const RequestIdHeaderPattern = /^[A-Za-z0-9_-]{8,128}$/;

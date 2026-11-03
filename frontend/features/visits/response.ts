import {
  arrayOf,
  flag,
  integer,
  nullable,
  objectOf,
  oneOf,
  optional,
  text,
  type Decoder,
} from '../../lib/response-validation';
import { ApiRequestError } from '../../lib/api-client';
import type {
  BulkAssignmentResult,
  CandidateResult,
  VisitDetailData,
  VisitListResult,
} from './contracts';

const status = oneOf(['PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED']);
const health = oneOf(['OK', 'NEEDS_REASSIGNMENT']);
export const decodeCaregiverOptions = objectOf({
  items: arrayOf(objectOf({ id: text, name: optional(nullable(text)) })),
  nextCursor: nullable(text),
});
const common = {
  id: text,
  status,
  assignmentHealth: health,
  scheduledStartUtc: text,
  scheduledEndUtc: text,
  timezoneSnapshot: text,
  version: integer,
  areaId: text,
  patient: objectOf({ id: text, displayName: text }),
  assignedCaregiver: nullable(objectOf({ id: text, name: text })),
};
export const decodeVisitList: Decoder<VisitListResult> = objectOf({
  items: arrayOf(objectOf({ ...common, carePlanId: nullable(text) })),
  nextCursor: nullable(text),
  timezone: text,
  bufferMinutes: integer,
});
export const decodeVisitDetail: Decoder<VisitDetailData> = objectOf({
  ...common,
  reviewStatus: text,
  occurrenceKey: nullable(text),
  cancelledReason: nullable(text),
  cancelledAt: nullable(text),
  serviceNameSnapshot: objectOf({ nameAr: text, nameEn: text }),
  carePlan: nullable(objectOf({ id: text, status: text, currentVersion: integer })),
  tasks: arrayOf(
    objectOf({
      id: text,
      order: integer,
      descriptionSnapshot: text,
      isRequired: flag,
      outcome: text,
    }),
  ),
  assignmentHistory: arrayOf(
    objectOf({
      id: text,
      oldCaregiverId: nullable(text),
      newCaregiverId: text,
      oldCaregiverName: nullable(text),
      newCaregiverName: nullable(text),
      reason: nullable(text),
      createdAt: text,
    }),
  ),
});
export const decodeCandidates: Decoder<CandidateResult> = objectOf({
  visitId: text,
  visitStatus: status,
  visitLocalDate: text,
  bufferMinutes: integer,
  advisory: oneOf([true]),
  items: arrayOf(
    objectOf({
      caregiverId: text,
      name: text,
      isPrimary: flag,
      load: integer,
      sameArea: flag,
      serviceAreas: arrayOf(text),
    }),
  ),
  excluded: arrayOf(objectOf({ caregiverId: text, name: text, reasons: arrayOf(text) })),
});
export const decodeBulkResult: Decoder<BulkAssignmentResult> = (value) => {
  const decodeOutcome = (entry: unknown) => {
    const base = objectOf({ visitId: text, ok: flag })(entry);
    return base.ok
      ? {
          ...base,
          ...objectOf({ status, assignedCaregiverId: nullable(text), version: integer })(entry),
        }
      : { ...base, ...objectOf({ code: text })(entry) };
  };
  const result = objectOf({
    results: arrayOf(decodeOutcome),
    summary: objectOf({ succeeded: integer, failed: integer }),
  })(value);
  if (
    result.results.filter((entry) => entry.ok).length !== result.summary.succeeded ||
    result.results.filter((entry) => !entry.ok).length !== result.summary.failed
  )
    throw new ApiRequestError(502, 'INVALID_RESPONSE');
  return result;
};

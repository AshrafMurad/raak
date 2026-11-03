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
import type {
  CarePlanDetail,
  CarePlanSummary,
  CarePlanVersion,
  GenerationPreview,
  PageResult,
} from './contracts';

const status = oneOf(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']);
const versionStatus = oneOf(['DRAFT', 'APPROVED', 'ACTIVATED']);
const patient = { id: text, displayName: text };
export const decodeCreatedPlan = objectOf({ id: text });
export const decodeOptionPage = objectOf({
  items: arrayOf(objectOf({ id: text, displayName: optional(text), name: optional(text) })),
  nextCursor: nullable(text),
});
export const decodeServiceOptions = objectOf({
  items: arrayOf(
    objectOf({
      id: text,
      config: objectOf({ nameAr: text, nameEn: text, allowRecurring: optional(flag) }),
    }),
  ),
  nextCursor: nullable(text),
});
const summary = {
  id: text,
  status,
  currentVersion: integer,
  primaryCaregiverId: nullable(text),
  startedAt: nullable(text),
  closedAt: nullable(text),
  createdAt: text,
  patient: objectOf(patient),
  serviceId: text,
  serviceNameAr: text,
  serviceNameEn: text,
  plannedVisits: integer,
};
export const decodePlanVersion: Decoder<CarePlanVersion> = objectOf({
  id: text,
  version: integer,
  status: versionStatus,
  validFrom: text,
  validUntil: text,
  weekdaysJson: arrayOf(integer),
  localStartTime: text,
  durationMin: integer,
  goalText: nullable(text),
  taskTemplatesJson: arrayOf(objectOf({ description: text, isRequired: flag })),
  clinicalInstructionsRestricted: nullable(text),
  timezoneSnapshot: text,
  dstResolution: oneOf(['REJECT', 'EARLIEST', 'LATEST']),
  approvedByStaffId: nullable(text),
  approvedAt: nullable(text),
  activatedAt: nullable(text),
  createdAt: text,
});
export const decodePlanList: Decoder<PageResult<CarePlanSummary>> = objectOf({
  items: arrayOf(objectOf(summary)),
  nextCursor: nullable(text),
});
export const decodePlanDetail: Decoder<CarePlanDetail> = objectOf({
  ...summary,
  patient: objectOf({ ...patient, areaId: text }),
  clinicalClass: oneOf(['CLINICAL', 'NON_CLINICAL']),
  requiredQualificationCodes: arrayOf(text),
  scheduledVisits: integer,
  versions: arrayOf(decodePlanVersion),
});
export const decodePlanPreview: Decoder<GenerationPreview> = objectOf({
  planId: text,
  version: integer,
  versionStatus,
  clinicalApprovalRequired: flag,
  spanDays: integer,
  occurrenceCount: integer,
  occurrences: arrayOf(
    objectOf({ localDate: text, weekday: integer, startUtc: text, endUtc: text }),
  ),
  wouldCancelCount: integer,
  wouldCancel: arrayOf(objectOf({ visitId: text, localDate: text })),
});

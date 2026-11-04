import {
  arrayOf,
  flag,
  integer,
  nullable,
  objectOf,
  oneOf,
  text,
  type Decoder,
} from '../../lib/response-validation';
import type {
  AuditPageData,
  CaregiversReportData,
  RequestsReportData,
  VisitsReportData,
} from './contracts';

const REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_CUSTOMER',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
] as const;
const VISIT_STATUSES = [
  'PLANNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'MISSED',
] as const;

const byRequestStatus = objectOf(
  Object.fromEntries(REQUEST_STATUSES.map((status) => [status, integer])),
);
const byVisitStatus = objectOf(
  Object.fromEntries(VISIT_STATUSES.map((status) => [status, integer])),
);

export const decodeRequestsReport: Decoder<RequestsReportData> = objectOf({
  timezone: text,
  total: integer,
  byStatus: byRequestStatus,
  byService: arrayOf(
    objectOf({
      serviceId: text,
      slug: text,
      nameAr: nullable(text),
      nameEn: nullable(text),
      count: integer,
    }),
  ),
  byServiceTruncated: flag,
});

export const decodeVisitsReport: Decoder<VisitsReportData> = objectOf({
  timezone: text,
  total: integer,
  byStatus: byVisitStatus,
  unassigned: integer,
  timeliness: objectOf({
    started: integer,
    onTime: integer,
    late: integer,
    notStarted: integer,
  }),
});

export const decodeCaregiversReport: Decoder<CaregiversReportData> = objectOf({
  timezone: text,
  items: arrayOf(
    objectOf({
      caregiverId: text,
      name: text,
      scheduledMinutes: integer,
      byStatus: byVisitStatus,
    }),
  ),
  truncated: flag,
});

export const decodeAuditPage: Decoder<AuditPageData> = objectOf({
  timezone: text,
  items: arrayOf(
    objectOf({
      id: text,
      at: text,
      actorType: nullable(oneOf(['AGENCY_STAFF', 'AGENCY_CUSTOMER', 'PLATFORM_OPERATOR'])),
      actorId: nullable(text),
      action: text,
      subjectType: text,
      subjectId: nullable(text),
      reason: nullable(text),
    }),
  ),
  nextCursor: nullable(text),
});

export interface ServiceOptionRow {
  id: string;
  slug: string;
  config: { nameAr: string; nameEn: string };
}
export const decodeServiceOptions: Decoder<ServiceOptionRow[]> = arrayOf(
  objectOf({ id: text, slug: text, config: objectOf({ nameAr: text, nameEn: text }) }),
);
export const decodeServiceOptionPage = objectOf({
  items: decodeServiceOptions,
  nextCursor: nullable(text),
});

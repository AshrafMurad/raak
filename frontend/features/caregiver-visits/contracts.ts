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

export type CaregiverVisitStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';

export interface CaregiverVisitSummary {
  id: string;
  status: CaregiverVisitStatus;
  scheduledStartUtc: string;
  scheduledEndUtc: string;
  timezoneSnapshot: string;
  version: number;
  patient: { id: string; displayName: string };
  serviceNameSnapshot: { nameAr: string; nameEn: string };
  actualStartAt: string | null;
  actualEndAt: string | null;
}

export interface CaregiverVisitTask {
  id: string;
  order: number;
  descriptionSnapshot: string;
  isRequired: boolean;
  outcome: 'PENDING' | 'DONE' | 'NOT_DONE';
  notDoneReason: string | null;
}

export interface CaregiverVisitDetail extends CaregiverVisitSummary {
  areaId: string;
  reviewStatus: string;
  tasks: CaregiverVisitTask[];
  note: { id: string; body: string; isDraft: boolean } | null;
}

export interface CaregiverVisitListResult {
  timezone: string;
  items: CaregiverVisitSummary[];
  nextCursor: string | null;
}

const summary = {
  id: text,
  status: oneOf(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED']) as Decoder<CaregiverVisitStatus>,
  scheduledStartUtc: text,
  scheduledEndUtc: text,
  timezoneSnapshot: text,
  version: integer,
  patient: objectOf({ id: text, displayName: text }),
  serviceNameSnapshot: objectOf({ nameAr: text, nameEn: text }),
  actualStartAt: nullable(text),
  actualEndAt: nullable(text),
};

export const decodeCaregiverVisitList: Decoder<CaregiverVisitListResult> = objectOf({
  items: arrayOf(objectOf(summary)),
  nextCursor: nullable(text),
  timezone: text,
});

export const decodeCaregiverVisitDetail: Decoder<CaregiverVisitDetail> = objectOf({
  ...summary,
  areaId: text,
  reviewStatus: text,
  tasks: arrayOf(
    objectOf({
      id: text,
      order: integer,
      descriptionSnapshot: text,
      isRequired: flag,
      outcome: oneOf(['PENDING', 'DONE', 'NOT_DONE']),
      notDoneReason: nullable(text),
    }),
  ),
  note: nullable(objectOf({ id: text, body: text, isDraft: flag })),
});

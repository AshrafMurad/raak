import { apiRequest } from '../../lib/api-client';
import type {
  AuditPageData,
  CaregiversReportData,
  RequestsReportData,
  RequestStatusFilter,
  ServiceOption,
  VisitsReportData,
  VisitStatusFilter,
} from './contracts';
import {
  decodeAuditPage,
  decodeCaregiversReport,
  decodeRequestsReport,
  decodeServiceOptionPage,
  decodeVisitsReport,
  type ServiceOptionRow,
} from './response';
import type { Locale } from '../../lib/i18n';

export interface ReportFilters {
  from: string;
  to: string;
  serviceId: string;
  requestStatus: RequestStatusFilter;
  visitStatus: VisitStatusFilter;
}

function queryString(filters: Partial<ReportFilters>): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.serviceId) params.set('serviceId', filters.serviceId);
  if (filters.requestStatus) params.set('status', filters.requestStatus);
  if (filters.visitStatus) params.set('status', filters.visitStatus);
  return params.size ? `?${params}` : '';
}

export function getRequestsReport(
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<RequestsReportData> {
  return apiRequest(
    `/agency/reports/requests${queryString({
      from: filters.from,
      to: filters.to,
      serviceId: filters.serviceId,
      requestStatus: filters.requestStatus,
    })}`,
    { signal },
  ).then(decodeRequestsReport);
}

export function getVisitsReport(
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<VisitsReportData> {
  return apiRequest(
    `/agency/reports/visits${queryString({
      from: filters.from,
      to: filters.to,
      serviceId: filters.serviceId,
      visitStatus: filters.visitStatus,
    })}`,
    { signal },
  ).then(decodeVisitsReport);
}

export function getCaregiversReport(
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<CaregiversReportData> {
  return apiRequest(
    `/agency/reports/caregivers${queryString({
      from: filters.from,
      to: filters.to,
      serviceId: filters.serviceId,
      visitStatus: filters.visitStatus,
    })}`,
    { signal },
  ).then(decodeCaregiversReport);
}

export function getAuditPage(cursor: string | null, signal?: AbortSignal): Promise<AuditPageData> {
  return apiRequest(
    `/agency/audit?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    { signal },
  ).then(decodeAuditPage);
}

function toOption(row: ServiceOptionRow, locale: Locale): ServiceOption {
  return {
    serviceId: row.id,
    label: locale === 'ar' ? row.config.nameAr : row.config.nameEn,
  };
}

export async function getReportServiceOptions(
  locale: Locale,
  signal?: AbortSignal,
  cursor?: string,
): Promise<{ items: ServiceOption[]; nextCursor: string | null }> {
  const page = await apiRequest(
    `/agency/services?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    { signal },
  ).then(decodeServiceOptionPage);
  return {
    items: page.items
      .map((row) => toOption(row, locale))
      .sort((a, b) => a.label.localeCompare(b.label, locale === 'ar' ? 'ar' : 'en')),
    nextCursor: page.nextCursor,
  };
}

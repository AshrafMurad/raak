'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Locale } from '../../lib/i18n';
import { useWorkspaceQuery } from '../../lib/use-workspace-query';
import {
  getCaregiversReport,
  getRequestsReport,
  getVisitsReport,
  getReportServiceOptions,
  type ReportFilters,
} from './api';
import type {
  CaregiversReportData,
  RequestsReportData,
  ServiceOption,
  VisitsReportData,
} from './contracts';
import {
  REQUEST_STATUSES,
  VISIT_STATUSES,
  type RequestStatusFilter,
  type VisitStatusFilter,
} from './contracts';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function requestStatus(value: string): RequestStatusFilter {
  return (REQUEST_STATUSES as readonly string[]).includes(value)
    ? (value as RequestStatusFilter)
    : '';
}
function visitStatus(value: string): VisitStatusFilter {
  return (VISIT_STATUSES as readonly string[]).includes(value) ? (value as VisitStatusFilter) : '';
}

function isDate(value: string): boolean {
  return DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** URL-backed report filters (docs 10): dates, canonical status codes and an
 * opaque in-tenant service id only. Invalid values fall back to "all". */
export function useReportFilters() {
  const { search, update } = useWorkspaceQuery();
  const filters = useMemo<ReportFilters>(() => {
    const params = new URLSearchParams(search);
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    const service = params.get('service') ?? '';
    return {
      from: isDate(from) ? from : '',
      to: isDate(to) ? to : '',
      serviceId: /^[0-9a-f-]{36}$/i.test(service) ? service : '',
      requestStatus: requestStatus(params.get('requestStatus') ?? ''),
      visitStatus: visitStatus(params.get('visitStatus') ?? ''),
    };
  }, [search]);
  return { filters, update };
}

export interface ReportsState {
  filters: ReportFilters;
  services: ServiceOption[];
  requests: RequestsReportData | null;
  visits: VisitsReportData | null;
  caregivers: CaregiversReportData | null;
  loading: boolean;
  error: unknown;
  serviceError: unknown;
  hasMoreServices: boolean;
  loadMoreServices: () => Promise<void>;
  changeFilters: (patch: Partial<Record<keyof ReportFilters, string>>) => void;
  refresh: () => Promise<void>;
}

/** Loads all three reports for the current filters; stale responses never
 * replace newer state (generation guard), and aborts are silent. */
export function useReports(locale: Locale): ReportsState {
  const { filters, update } = useReportFilters();
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [serviceCursor, setServiceCursor] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<unknown>(null);
  const [requests, setRequests] = useState<RequestsReportData | null>(null);
  const [visits, setVisits] = useState<VisitsReportData | null>(null);
  const [caregivers, setCaregivers] = useState<CaregiversReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++generation.current;
      setError(null);
      setLoading(true);
      setRequests(null);
      setVisits(null);
      setCaregivers(null);
      try {
        const [requestData, visitData, caregiverData] = await Promise.all([
          getRequestsReport(filters, signal),
          getVisitsReport(filters, signal),
          getCaregiversReport(filters, signal),
        ]);
        if (signal?.aborted || generation.current !== requestId) return;
        setRequests(requestData);
        setVisits(visitData);
        setCaregivers(caregiverData);
      } catch (cause) {
        if (signal?.aborted) return;
        if (generation.current !== requestId) return;
        setError(cause);
      } finally {
        if (generation.current === requestId) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void getReportServiceOptions(locale, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          setServices(page.items);
          setServiceCursor(page.nextCursor);
          setServiceError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setServiceError(cause);
      });
    return () => controller.abort();
  }, [locale]);

  const loadMoreServices = useCallback(async () => {
    try {
      const page = await getReportServiceOptions(locale, undefined, serviceCursor ?? undefined);
      setServices((current) => [
        ...new Map([...current, ...page.items].map((item) => [item.serviceId, item])).values(),
      ]);
      setServiceCursor(page.nextCursor);
      setServiceError(null);
    } catch (cause) {
      setServiceError(cause);
    }
  }, [locale, serviceCursor]);

  const changeFilters = useCallback(
    (patch: Partial<Record<keyof ReportFilters, string>>) => {
      const query: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(patch)) {
        const urlKey = key === 'serviceId' ? 'service' : key;
        query[urlKey] = value || null;
      }
      update(query);
    },
    [update],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return {
    filters,
    services,
    requests,
    visits,
    caregivers,
    loading,
    error,
    serviceError,
    hasMoreServices: serviceCursor !== null,
    loadMoreServices,
    changeFilters,
    refresh,
  };
}

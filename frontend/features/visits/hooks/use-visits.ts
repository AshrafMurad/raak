'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bulkAssignVisits, listCaregiverOptions, listVisits } from '../api';
import type {
  AssignmentHealthFilter,
  BulkAssignmentResult,
  CaregiverOption,
  VisitListResult,
  VisitStatusFilter,
  VisitSummary,
} from '../contracts';
import { bulkAssignmentsFor } from '../policies';
import { createRequestGeneration } from '../request-generation';
import { useWorkspaceQuery } from '../../../lib/use-workspace-query';
import { useMemo } from 'react';

export interface VisitFilters {
  status: VisitStatusFilter | '';
  health: AssignmentHealthFilter | '';
  from: string;
  to: string;
}

function queryFor(filters: VisitFilters, cursor?: string) {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.health ? { assignmentHealth: filters.health } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

/** List orchestration: initial load, explicit refresh, queue toggle, cursor
 * pagination and the bulk-assign command. Stale responses can never replace
 * newer list state. */
export function useVisits() {
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [caregivers, setCaregivers] = useState<CaregiverOption[]>([]);
  const { search, update } = useWorkspaceQuery();
  const params = new URLSearchParams(search);
  const status = params.get('status') ?? '';
  const health = params.get('assignmentHealth') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const filters = useMemo<VisitFilters>(() => {
    return {
      status: ['PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED'].includes(
        status,
      )
        ? (status as VisitStatusFilter)
        : '',
      health: health === 'OK' || health === 'NEEDS_REASSIGNMENT' ? health : '',
      from,
      to,
    };
  }, [status, health, from, to]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('');
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [bulkResult, setBulkResult] = useState<BulkAssignmentResult | null>(null);
  const [bulkRefreshFailed, setBulkRefreshFailed] = useState(false);
  const generation = useRef(createRequestGeneration());

  const applyList = useCallback((data: VisitListResult, append = false) => {
    setVisits((current) =>
      append
        ? [...new Map([...current, ...data.items].map((visit) => [visit.id, visit])).values()]
        : data.items,
    );
    setCursor(data.nextCursor);
    setTimezone(data.timezone);
    setBufferMinutes(data.bufferMinutes);
  }, []);

  useEffect(() => {
    const requests = generation.current;
    const controller = new AbortController();
    const requestId = requests.next();
    void Promise.all([
      listVisits(queryFor(filters), controller.signal),
      listCaregiverOptions(controller.signal),
    ])
      .then(([visitData, caregiverData]) => {
        if (!requests.isCurrent(requestId)) return;
        applyList(visitData);
        setCaregivers(caregiverData.items);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && requests.isCurrent(requestId)) setError(cause);
      })
      .finally(() => {
        if (requests.isCurrent(requestId)) setLoading(false);
      });
    return () => {
      controller.abort();
      requests.invalidate();
    };
  }, [applyList, filters]);

  const refresh = useCallback(async () => {
    const requestId = generation.current.next();
    const data = await listVisits(queryFor(filters));
    if (!generation.current.isCurrent(requestId)) return data;
    applyList(data);
    return data;
  }, [applyList, filters]);

  const loadMore = useCallback(async () => {
    if (!cursor) return null;
    const requestId = generation.current.next();
    const data = await listVisits(queryFor(filters, cursor));
    if (!generation.current.isCurrent(requestId)) return data;
    applyList(data, true);
    return data;
  }, [applyList, cursor, filters]);

  const toggleQueue = useCallback(async () => {
    const next: AssignmentHealthFilter | '' =
      filters.health === 'NEEDS_REASSIGNMENT' ? '' : 'NEEDS_REASSIGNMENT';
    update({ assignmentHealth: next || null });
  }, [filters.health, update]);

  const changeFilters = useCallback(
    (patch: Partial<VisitFilters>) => {
      const query: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(patch))
        query[key === 'health' ? 'assignmentHealth' : key] = value || null;
      update(query);
    },
    [update],
  );

  const assignBulk = useCallback(
    async (selectedIds: ReadonlySet<string>, caregiverId: string, reason: string) => {
      setBulkResult(null);
      setBulkRefreshFailed(false);
      const result = await bulkAssignVisits(
        {
          assignments: bulkAssignmentsFor(visits, selectedIds, caregiverId),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
        crypto.randomUUID(),
      );
      setBulkResult(result);
      // The command has committed; refresh errors must not turn it into a failure.
      await refresh().catch(() => setBulkRefreshFailed(true));
      return result;
    },
    [refresh, visits],
  );

  return {
    visits,
    caregivers,
    filters,
    cursor,
    timezone,
    bufferMinutes,
    loading,
    error,
    bulkResult,
    bulkRefreshFailed,
    changeFilters,
    refresh,
    loadMore,
    toggleQueue,
    assignBulk,
  };
}

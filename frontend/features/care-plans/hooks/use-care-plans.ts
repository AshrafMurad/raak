'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listCarePlans } from '../api';
import type { CarePlanStatusFilter, CarePlanSummary } from '../contracts';
import { createRequestGeneration } from '../request-generation';
import { useWorkspaceQuery } from '../../../lib/use-workspace-query';

export function useCarePlans() {
  const [plans, setPlans] = useState<CarePlanSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const { search, update } = useWorkspaceQuery();
  const candidateStatus = new URLSearchParams(search).get('status');
  const status: CarePlanStatusFilter | '' =
    candidateStatus &&
    ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(candidateStatus)
      ? (candidateStatus as CarePlanStatusFilter)
      : '';
  const setStatus = useCallback(
    (next: CarePlanStatusFilter | '') => update({ status: next || null }),
    [update],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [generation, setGeneration] = useState(0);
  const requestGeneration = useRef(createRequestGeneration());

  const load = useCallback(
    async (filter = status, next?: string) => {
      const requestId = requestGeneration.current.next();
      const response = await listCarePlans({
        ...(filter ? { status: filter } : {}),
        ...(next ? { cursor: next } : {}),
      });
      if (requestGeneration.current.isCurrent(requestId)) {
        setPlans((current) => (next ? [...current, ...response.items] : response.items));
        setCursor(response.nextCursor);
        setError(null);
      }
      return response;
    },
    [status],
  );

  useEffect(() => {
    const requests = requestGeneration.current;
    const controller = new AbortController();
    const requestId = requests.next();
    setLoading(true);
    void listCarePlans(status ? { status } : {}, controller.signal)
      .then((response) => {
        if (!requests.isCurrent(requestId)) return;
        setPlans(response.items);
        setCursor(response.nextCursor);
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
  }, [status, generation]);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  return { plans, cursor, status, setStatus, loading, error, load, refresh };
}

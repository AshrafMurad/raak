'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCarePlan } from '../api';
import type { CarePlanDetail } from '../contracts';
import { createRequestGeneration } from '../request-generation';

export function usePlanDetail(planId: string) {
  const [plan, setPlan] = useState<CarePlanDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const requestGeneration = useRef(createRequestGeneration());

  const reload = useCallback(async () => {
    const generation = requestGeneration.current.next();
    setLoading(true);
    try {
      const result = await getCarePlan(planId);
      if (requestGeneration.current.isCurrent(generation)) {
        setPlan(result);
        setError(null);
      }
    } catch (cause) {
      if (requestGeneration.current.isCurrent(generation)) setError(cause);
      throw cause;
    } finally {
      if (requestGeneration.current.isCurrent(generation)) setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    const requests = requestGeneration.current;
    void reload().catch(() => undefined);
    return () => requests.invalidate();
  }, [reload]);

  return { plan, error, loading, reload };
}

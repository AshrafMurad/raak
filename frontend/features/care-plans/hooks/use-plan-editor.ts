'use client';

import { useEffect, useState } from 'react';
import { createCarePlan, loadCarePlanEditorOptions } from '../api';
import type { CarePlanEditorOptions } from '../api';
import type { PlanContent } from '../contracts';

export function usePlanEditor() {
  const [options, setOptions] = useState<CarePlanEditorOptions | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void loadCarePlanEditorOptions(controller.signal)
      .then((result) => {
        if (current) {
          setOptions(result);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (current) setError(cause);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, []);

  return {
    patients: options?.patients.items ?? [],
    services: options?.services.items.filter((item) => item.config.allowRecurring !== false) ?? [],
    caregivers: options?.caregivers.items ?? [],
    error,
    create: (patientId: string, serviceId: string, requestId: string, content: PlanContent) =>
      createCarePlan(patientId, {
        agencyServiceId: serviceId,
        serviceRequestId: requestId.trim() || null,
        ...content,
      }),
  };
}

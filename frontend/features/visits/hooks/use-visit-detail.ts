'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { Locale } from '../../../lib/i18n';
import { assignVisit, getVisit, loadVisitCandidates, reassignVisit } from '../api';
import type { CandidateResult, VisitDetailData } from '../contracts';
import { visitCopy, visitError } from '../copy';
import { createRequestGeneration } from '../request-generation';
import { runConfirmedCommand } from '../../../lib/confirmed-command';

/** Detail orchestration for one visit: detail load with a generation guard,
 * advisory candidate lookup and the assign/reassign commands. Success feedback
 * waits for the server response and the list refresh. */
export function useVisitDetail({
  visitId,
  locale,
  onChanged,
}: {
  visitId: string;
  locale: Locale;
  onChanged(): Promise<void>;
}) {
  const c = visitCopy(locale);
  const [visit, setVisit] = useState<VisitDetailData | null>(null);
  const [candidates, setCandidates] = useState<CandidateResult | null>(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');
  const [pending, startTransition] = useTransition();
  const generation = useRef(createRequestGeneration());

  const reload = useCallback(async () => {
    const requestId = generation.current.next();
    try {
      const data = await getVisit(visitId);
      if (generation.current.isCurrent(requestId)) setVisit(data);
    } catch (cause) {
      if (generation.current.isCurrent(requestId)) {
        setMessage(visitError(c, cause));
        setTone('error');
      }
      throw cause;
    }
  }, [c, visitId]);

  useEffect(() => {
    const requests = generation.current;
    void reload().catch(() => undefined);
    return () => requests.invalidate();
  }, [reload]);

  const execute = useCallback(
    (task: () => Promise<void>) => {
      startTransition(async () => {
        try {
          const result = await runConfirmedCommand(task, [reload, onChanged]);
          setMessage(result.refreshFailed ? c.savedRefreshFailed : c.saved);
          setTone(result.refreshFailed ? 'info' : 'success');
        } catch (error) {
          setMessage(visitError(c, error));
          setTone('error');
        }
      });
    },
    [c, onChanged, reload],
  );

  const findCandidates = useCallback(() => {
    startTransition(async () => {
      try {
        setCandidates(await loadVisitCandidates(visitId));
        setMessage('');
      } catch (error) {
        setMessage(visitError(c, error));
        setTone('error');
      }
    });
  }, [c, visitId]);

  const assign = useCallback(
    (caregiverId: string, reason: string) => {
      if (!visit) return;
      execute(async () => {
        await assignVisit(
          visitId,
          {
            caregiverId,
            expectedVisitVersion: visit.version,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          },
          crypto.randomUUID(),
        );
        setCandidates(null);
      });
    },
    [execute, visit, visitId],
  );

  const reassign = useCallback(
    (caregiverId: string, reason: string) => {
      if (!visit) return;
      execute(async () => {
        await reassignVisit(visitId, {
          caregiverId,
          expectedVisitVersion: visit.version,
          reason: reason.trim(),
        });
        setCandidates(null);
      });
    },
    [execute, visit, visitId],
  );

  return {
    visit,
    candidates,
    message,
    tone,
    pending,
    findCandidates,
    assign,
    reassign,
    refresh: reload,
  };
}

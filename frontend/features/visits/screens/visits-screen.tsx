'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { visitCopy, visitError } from '../copy';
import { useVisits } from '../hooks/use-visits';
import { BulkAssignmentPanel } from '../components/bulk-assignment-panel';
import { VisitDetailPanel } from '../components/visit-detail-panel';
import { VisitList } from '../components/visit-list';
import '../visits.css';
import { useWorkspaceQuery } from '../../../lib/use-workspace-query';
import { canSelectForBulk } from '../policies';

/** Workspace visits surface: list, bulk assignment and per-visit detail. */
export function VisitsScreen({ locale }: { locale: Locale }) {
  const c = visitCopy(locale);
  const {
    visits,
    caregivers,
    filters,
    cursor,
    timezone,
    bufferMinutes,
    loading,
    error: listError,
    bulkResult,
    bulkRefreshFailed,
    changeFilters,
    refresh,
    loadMore,
    toggleQueue,
    assignBulk,
  } = useVisits();
  const { search, update } = useWorkspaceQuery();
  const selectedId = new URLSearchParams(search).get('visit');
  const setSelectedId = (id: string | null) => update({ visit: id });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const eligibleSelectedIds = new Set(
    visits
      .filter((visit) => selectedIds.has(visit.id) && canSelectForBulk(visit))
      .map((visit) => visit.id),
  );
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (listError) setMessage(visitError(c, listError));
  }, [c, listError]);

  const reloadList = useCallback(async () => {
    await refresh();
    setSelectedIds(new Set());
  }, [refresh]);

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      try {
        await task();
      } catch (error) {
        setMessage(visitError(c, error));
      }
    });
  }

  return (
    <div className="raak-visits">
      <div className="rv-page-heading">
        <div>
          <h1>{c.visits}</h1>
          <p>{c.visitsIntro}</p>
        </div>
        <Button
          variant={filters.health === 'NEEDS_REASSIGNMENT' ? 'primary' : 'secondary'}
          onClick={() =>
            run(async () => {
              await toggleQueue();
              setSelectedIds(new Set());
            })
          }
        >
          {filters.health === 'NEEDS_REASSIGNMENT' ? c.showAll : c.showQueue}
        </Button>
      </div>
      {message ? <Feedback tone="error" title={message} /> : null}
      {bulkRefreshFailed ? <Feedback tone="info" title={c.savedRefreshFailed} /> : null}
      {loading ? <Feedback title={c.loading} /> : null}
      <VisitList
        locale={locale}
        visits={visits}
        filters={filters}
        cursor={cursor}
        timezone={timezone}
        bufferMinutes={bufferMinutes}
        loading={loading}
        pending={pending}
        selectedIds={eligibleSelectedIds}
        onFilterChange={(patch) => {
          setSelectedIds(new Set());
          changeFilters(patch);
        }}
        onRefresh={() =>
          run(async () => {
            await reloadList();
            setMessage('');
          })
        }
        onToggleVisit={(visitId, checked) =>
          setSelectedIds((current) => {
            const next = new Set(current);
            if (checked) next.add(visitId);
            else next.delete(visitId);
            return next;
          })
        }
        onOpenVisit={setSelectedId}
        onLoadMore={() =>
          run(async () => {
            await loadMore();
            setSelectedIds(new Set());
          })
        }
      />
      <BulkAssignmentPanel
        locale={locale}
        caregivers={caregivers}
        selectedCount={eligibleSelectedIds.size}
        pending={pending}
        result={bulkResult}
        onAssignSelected={(caregiverId, reason) =>
          run(async () => {
            if (eligibleSelectedIds.size === 0 || !caregiverId) {
              setMessage(c.noSelection);
              return;
            }
            setMessage('');
            await assignBulk(eligibleSelectedIds, caregiverId, reason);
            setSelectedIds(new Set());
          })
        }
      />
      {selectedId ? (
        <VisitDetailPanel
          key={selectedId}
          locale={locale}
          visitId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={reloadList}
        />
      ) : null}
    </div>
  );
}

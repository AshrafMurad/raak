'use client';

import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { Field, Input } from '../../../components/ui/field';
import { Select } from '../../../components/ui/select';
import { StatusBadge } from '../../../components/ui/status-badge';
import type { VisitStatus, AssignmentHealthFilter } from '../contracts';
import { formatVisitDateTime, visitCopy } from '../copy';
import type { VisitFilters } from '../hooks/use-visits';
import { canSelectForBulk, visitStatusTone } from '../policies';
import type { VisitSummary } from '../contracts';

const VISIT_STATUSES: VisitStatus[] = [
  'PLANNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'MISSED',
];

/** List filters, visit table and cursor pagination. Renders typed state and
 * emits semantic callbacks only; endpoint and transport details stay in the
 * feature API module. */
export function VisitList({
  locale,
  visits,
  filters,
  cursor,
  timezone,
  bufferMinutes,
  loading,
  pending,
  selectedIds,
  onFilterChange,
  onRefresh,
  onToggleVisit,
  onOpenVisit,
  onLoadMore,
}: {
  locale: Locale;
  visits: VisitSummary[];
  filters: VisitFilters;
  cursor: string | null;
  timezone: string;
  bufferMinutes: number;
  loading: boolean;
  pending: boolean;
  selectedIds: ReadonlySet<string>;
  onFilterChange(change: Partial<VisitFilters>): void;
  onRefresh(): void;
  onToggleVisit(visitId: string, checked: boolean): void;
  onOpenVisit(visitId: string): void;
  onLoadMore(): void;
}) {
  const c = visitCopy(locale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <>
      <section className="raak-card">
        <div className="raak-scheduling-grid">
          <Field id="visit-status" label={c.status}>
            <Select
              id="visit-status"
              name="status"
              label={c.status}
              dir={dir}
              value={filters.status || 'ALL'}
              options={[
                { value: 'ALL', label: c.allStatuses },
                ...VISIT_STATUSES.map((value) => ({ value, label: c.states[value] })),
              ]}
              onValueChange={(value) =>
                onFilterChange({ status: value === 'ALL' ? '' : (value as VisitStatus) })
              }
            />
          </Field>
          <Field id="visit-health" label={c.assignmentHealth}>
            <Select
              id="visit-health"
              name="health"
              label={c.assignmentHealth}
              dir={dir}
              value={filters.health || 'ALL'}
              options={[
                { value: 'ALL', label: c.allHealth },
                { value: 'OK', label: c.states.OK },
                { value: 'NEEDS_REASSIGNMENT', label: c.states.NEEDS_REASSIGNMENT },
              ]}
              onValueChange={(value) =>
                onFilterChange({
                  health: value === 'ALL' ? '' : (value as AssignmentHealthFilter),
                })
              }
            />
          </Field>
          <Field id="visit-from" label={c.dateFrom}>
            <Input
              id="visit-from"
              type="date"
              value={filters.from}
              onChange={(event) => onFilterChange({ from: event.target.value })}
            />
          </Field>
          <Field id="visit-to" label={c.dateTo}>
            <Input
              id="visit-to"
              type="date"
              value={filters.to}
              onChange={(event) => onFilterChange({ to: event.target.value })}
            />
          </Field>
        </div>
        <div className="raak-actions">
          <Button disabled={pending} onClick={onRefresh}>
            {c.refresh}
          </Button>
          <span className="raak-scheduling-meta">
            {c.timezone}: <bdi dir="ltr">{timezone}</bdi>
          </span>
          <span className="raak-scheduling-meta">
            {c.travelBuffer}: {bufferMinutes}
          </span>
        </div>
      </section>
      <section className="raak-card">
        <h2>{filters.health === 'NEEDS_REASSIGNMENT' ? c.reassignmentQueue : c.visits}</h2>
        {!loading && visits.length === 0 ? <Feedback title={c.emptyVisits} /> : null}
        {visits.length ? (
          <div className="rv-table-scroll" tabIndex={0}>
            <table className="rv-table raak-scheduling-table">
              <thead>
                <tr>
                  <th>{c.selectVisit}</th>
                  <th>{c.patient}</th>
                  <th>{c.scheduledWindow}</th>
                  <th>{c.caregiver}</th>
                  <th>{c.status}</th>
                  <th>{c.assignmentHealth}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.id}>
                    <td>
                      <input
                        aria-label={`${c.selectVisit}: ${visit.patient.displayName}`}
                        type="checkbox"
                        disabled={!canSelectForBulk(visit)}
                        checked={selectedIds.has(visit.id)}
                        onChange={(event) => onToggleVisit(visit.id, event.target.checked)}
                      />
                    </td>
                    <td>{visit.patient.displayName}</td>
                    <td>
                      {formatVisitDateTime(visit.scheduledStartUtc, locale, visit.timezoneSnapshot)}
                    </td>
                    <td>{visit.assignedCaregiver?.name ?? c.unassigned}</td>
                    <td>
                      <StatusBadge tone={visitStatusTone(visit.status)}>
                        {c.states[visit.status]}
                      </StatusBadge>
                      {visit.reviewStatus === 'NEEDS_REVIEW' ? (
                        <StatusBadge tone="in_progress">{c.review.states.NEEDS_REVIEW}</StatusBadge>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge tone={visitStatusTone(visit.assignmentHealth)}>
                        {c.states[visit.assignmentHealth]}
                      </StatusBadge>
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => onOpenVisit(visit.id)}>
                        {c.open}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {cursor ? (
          <Button variant="secondary" disabled={pending} onClick={onLoadMore}>
            {c.next}
          </Button>
        ) : null}
      </section>
    </>
  );
}

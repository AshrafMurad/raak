'use client';

import { useTransition } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { Field, Input } from '../../../components/ui/field';
import { Select } from '../../../components/ui/select';
import { LOCALE_DIRECTION } from '../../../lib/i18n';
import { reportingCopy, reportingError } from '../copy';
import { useReports } from '../use-reports';
import '../reporting.css';
import '../../../components/layout/visit-flow.css';
import {
  REQUEST_STATUSES,
  VISIT_STATUSES,
  type RequestReportStatus,
  type VisitReportStatus,
} from '../contracts';

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rv-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Workspace reports surface (docs 02 Reporting, E08): aggregate cards with
 * URL-backed period/status/service filters. Counts only — no row data. */
export function ReportsScreen({ locale }: { locale: Locale }) {
  const c = reportingCopy(locale);
  const dir = LOCALE_DIRECTION[locale];
  const {
    filters,
    services,
    requests,
    visits,
    caregivers,
    loading,
    error,
    changeFilters,
    refresh,
    serviceError,
    hasMoreServices,
    loadMoreServices,
  } = useReports(locale);
  const message = error ? reportingError(c, error) : '';
  const [pending, start] = useTransition();

  const statusOptions = (statuses: readonly string[], allLabel: string) => [
    { value: '', label: allLabel },
    ...statuses.map((status) => ({
      value: status,
      label: c.statuses[status as keyof typeof c.statuses],
    })),
  ];

  return (
    <section className="raak-execution">
      <div className="rv-page-heading">
        <div>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await refresh();
            })
          }
        >
          {c.refresh}
        </Button>
      </div>
      {message ? <Feedback tone="error" title={message} /> : null}
      {serviceError ? <Feedback tone="error" title={c.servicesError} /> : null}
      <p>{c.windowHelp}</p>
      {visits ? (
        <p>
          {c.timezone}: <bdi dir="ltr">{visits.timezone}</bdi>
        </p>
      ) : null}
      <form
        className="raak-card raak-form rv-filters"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <Field id="report-from" label={c.from}>
          <Input
            id="report-from"
            type="date"
            value={filters.from}
            onChange={(event) => changeFilters({ from: event.target.value })}
          />
        </Field>
        <Field id="report-to" label={c.to}>
          <Input
            id="report-to"
            type="date"
            value={filters.to}
            onChange={(event) => changeFilters({ to: event.target.value })}
          />
        </Field>
        <Field id="report-service" label={c.service}>
          <Select
            id="report-service"
            name="service"
            label={c.service}
            dir={dir}
            placeholder={c.allServices}
            options={[
              { value: '', label: c.allServices },
              ...services.map((option) => ({ value: option.serviceId, label: option.label })),
            ]}
            value={filters.serviceId}
            onValueChange={(value) => changeFilters({ serviceId: value })}
          />
        </Field>
        {hasMoreServices || serviceError ? (
          <Button variant="secondary" disabled={pending} onClick={() => start(loadMoreServices)}>
            {serviceError ? c.retryServices : c.moreServices}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() =>
            changeFilters({ from: '', to: '', serviceId: '', requestStatus: '', visitStatus: '' })
          }
        >
          {c.reset}
        </Button>
      </form>
      {loading ? <Feedback title={c.loading} /> : null}
      {requests ? (
        <div className="raak-card" data-report="requests">
          <div className="rv-report-heading">
            <h2>{c.requests}</h2>
            <Select
              id="request-status"
              name="requestStatus"
              label={c.requestStatus}
              dir={dir}
              options={statusOptions(REQUEST_STATUSES, c.allStatuses)}
              value={filters.requestStatus}
              onValueChange={(value) => changeFilters({ requestStatus: value })}
            />
          </div>
          <p className="rv-total">
            {c.requestsTotal}: <strong data-count="requests-total">{requests.total}</strong>
          </p>
          <h3>{c.byStatus}</h3>
          <div className="rv-stats">
            {REQUEST_STATUSES.map((status) => (
              <CountRow
                key={status}
                label={c.statuses[status as RequestReportStatus]}
                value={requests.byStatus[status] ?? 0}
              />
            ))}
          </div>
          <h3>{c.byService}</h3>
          {requests.byService.length === 0 ? (
            <p>{c.emptyService}</p>
          ) : (
            <div className="rv-table-scroll" tabIndex={0} role="region" aria-label={c.byService}>
              <table className="rv-table raak-report-table">
                <thead>
                  <tr>
                    <th scope="col">{c.serviceColumn}</th>
                    <th scope="col">{c.countColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.byService.map((row) => (
                    <tr key={row.serviceId} data-service-row={row.serviceId}>
                      <td>
                        {locale === 'ar' ? (row.nameAr ?? row.slug) : (row.nameEn ?? row.slug)}
                      </td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {requests.byServiceTruncated ? <p>{c.rowsTruncated}</p> : null}
        </div>
      ) : null}
      {visits ? (
        <div className="raak-card" data-report="visits">
          <div className="rv-report-heading">
            <h2>{c.visits}</h2>
            <Select
              id="visit-status"
              name="visitStatus"
              label={c.visitStatus}
              dir={dir}
              options={statusOptions(VISIT_STATUSES, c.allStatuses)}
              value={filters.visitStatus}
              onValueChange={(value) => changeFilters({ visitStatus: value })}
            />
          </div>
          <p className="rv-total">
            {c.visitsTotal}: <strong data-count="visits-total">{visits.total}</strong>
          </p>
          <div className="rv-stats">
            {VISIT_STATUSES.map((status) => (
              <CountRow
                key={status}
                label={c.statuses[status as VisitReportStatus]}
                value={visits.byStatus[status] ?? 0}
              />
            ))}
            <CountRow label={c.unassigned} value={visits.unassigned} />
          </div>
          <h3>{c.timeliness}</h3>
          <p>{c.timelinessHelp}</p>
          <div className="rv-stats">
            <CountRow label={c.started} value={visits.timeliness.started} />
            <CountRow label={c.onTime} value={visits.timeliness.onTime} />
            <CountRow label={c.late} value={visits.timeliness.late} />
            <CountRow label={c.notStarted} value={visits.timeliness.notStarted} />
          </div>
        </div>
      ) : null}
      {caregivers ? (
        <div className="raak-card" data-report="caregivers">
          <h2>{c.caregivers}</h2>
          <p>{c.caregiverNote}</p>
          {caregivers.items.length === 0 ? (
            <p>{c.emptyCaregivers}</p>
          ) : (
            <div className="rv-table-scroll" tabIndex={0} role="region" aria-label={c.caregivers}>
              <table className="rv-table raak-report-table">
                <thead>
                  <tr>
                    <th scope="col">{c.caregiver}</th>
                    <th scope="col">{c.minutes}</th>
                    <th scope="col">{c.byStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {caregivers.items.map((row) => (
                    <tr key={row.caregiverId} data-caregiver-row={row.caregiverId}>
                      <td>{row.name}</td>
                      <td data-count="caregiver-minutes">{row.scheduledMinutes}</td>
                      <td>
                        {VISIT_STATUSES.filter((status) => (row.byStatus[status] ?? 0) > 0)
                          .map(
                            (status) =>
                              `${row.byStatus[status]} ${c.statuses[status as VisitReportStatus]}`,
                          )
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {caregivers.truncated ? <p>{c.rowsTruncated}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

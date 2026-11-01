import {
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  Clock3,
  Search,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import {
  filterPreviewVisits,
  previewVisits,
  type PreviewCopy,
  type PreviewFilter,
  type PreviewVisit,
  type PreviewTheme,
} from '../../../../lib/design-preview';
import { Button } from '../../../../components/ui/button';
import { VisitStatus } from './status';
import { Select as PreviewSelect } from '../../../../components/ui/select';
import { usePreviewFeedback } from './use-preview-feedback';

export type InspectRecord = PreviewVisit | 'request';
export type OnInspect = (record: InspectRecord, event: MouseEvent<HTMLButtonElement>) => void;

function Inspect({
  copy,
  record,
  onInspect,
}: {
  copy: PreviewCopy;
  record: InspectRecord;
  onInspect: OnInspect;
}) {
  return (
    <Button variant="ghost" onClick={(event) => onInspect(record, event)}>
      {copy.inspect}
      <ChevronRight className="rv-directional" size={15} aria-hidden="true" />
    </Button>
  );
}

export function Workspace({
  copy,
  onInspect,
  theme,
  dir,
}: {
  copy: PreviewCopy;
  onInspect: OnInspect;
  theme: PreviewTheme;
  dir: 'rtl' | 'ltr';
}) {
  const [category, setCategory] = useState<PreviewFilter>('all');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const exceptions = previewVisits.filter((visit) => visit.state === 'PLANNED' || visit.late);
  const matching = filterPreviewVisits(previewVisits, query, state, copy);
  const categoryFeedback = usePreviewFeedback<HTMLDivElement>(category);
  const resultsFeedback = usePreviewFeedback<HTMLTableSectionElement>(
    matching.map((visit) => visit.id).join(','),
  );
  const categories: { id: PreviewFilter; label: string; count: number }[] = [
    { id: 'all', label: copy.all, count: exceptions.length + 1 },
    {
      id: 'unassigned',
      label: copy.unassigned,
      count: exceptions.filter((visit) => visit.state === 'PLANNED').length,
    },
    { id: 'late', label: copy.late, count: exceptions.filter((visit) => visit.late).length },
    { id: 'requests', label: copy.requests, count: 1 },
  ];
  const visibleExceptions = exceptions.filter(
    (visit) =>
      category === 'all' ||
      (category === 'unassigned' && visit.state === 'PLANNED') ||
      (category === 'late' && visit.late),
  );
  const summary = [
    { label: copy.allVisits, count: previewVisits.length, className: 'total' },
    {
      label: copy.unassigned,
      count: previewVisits.filter((v) => v.state === 'PLANNED').length,
      className: 'planned',
    },
    {
      label: copy.inProgress,
      count: previewVisits.filter((v) => v.state === 'IN_PROGRESS').length,
      className: 'progress',
    },
    {
      label: copy.completed,
      count: previewVisits.filter((v) => v.state === 'COMPLETED').length,
      className: 'complete',
    },
  ];
  return (
    <>
      <div className="rv-page-heading">
        <div>
          <h1>
            {copy.greeting}
            <span className="rv-heading-dot" aria-hidden="true" />
          </h1>
          <p>{copy.intro}</p>
        </div>
        <Button asChild>
          <a href="#attention">
            {copy.review}
            <ArrowUpRight aria-hidden="true" size={16} className="rv-directional" />
          </a>
        </Button>
      </div>
      <section className="rv-summary" aria-label={copy.today}>
        {summary.map((item) => (
          <div className={`rv-summary-item rv-summary-${item.className}`} key={item.label}>
            <span className="rv-summary-label">
              <span className="rv-dot" aria-hidden="true" />
              {item.label}
            </span>
            <strong>{item.count.toString().padStart(2, '0')}</strong>
          </div>
        ))}
      </section>
      <section id="attention" className="rv-section" tabIndex={-1}>
        <div className="rv-section-heading">
          <div>
            <h2>
              {copy.attention}
              <span className="rv-count">{exceptions.length + 1}</span>
            </h2>
            <p>{copy.attentionHint}</p>
          </div>
          <span className="rv-section-icon">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
        </div>
        <div className="rv-filters" aria-label={copy.attentionNav}>
          {categories.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <div className="rv-exceptions" ref={categoryFeedback}>
          {visibleExceptions.map((visit) => (
            <div className="rv-exception" key={visit.id}>
              <span className={`rv-exception-icon ${visit.late ? 'rv-exception-late' : ''}`}>
                {visit.late ? (
                  <Clock3 size={19} aria-hidden="true" />
                ) : (
                  <UsersRound size={19} aria-hidden="true" />
                )}
              </span>
              <div className="rv-exception-content">
                <h3>{visit.late ? copy.lateTitle : copy.assignTitle}</h3>
                <p>
                  <span>{copy.people[visit.person]}</span>
                  <span className="rv-separator" aria-hidden="true">
                    /
                  </span>
                  <bdi dir="ltr">{visit.time}</bdi>
                  <span className="rv-exception-description">
                    {visit.late ? copy.lateHint : copy.assignHint}
                  </span>
                </p>
              </div>
              <Inspect copy={copy} record={visit} onInspect={onInspect} />
            </div>
          ))}
          {category === 'all' || category === 'requests' ? (
            <div className="rv-exception">
              <span className="rv-exception-icon rv-exception-request">
                <ClipboardList size={19} aria-hidden="true" />
              </span>
              <div className="rv-exception-content">
                <h3>{copy.requestTitle}</h3>
                <p>
                  <span>{copy.requestPerson}</span>
                  <span className="rv-separator" aria-hidden="true">
                    /
                  </span>
                  <bdi>REQ-218</bdi>
                  <span className="rv-exception-description">{copy.requestHint}</span>
                </p>
              </div>
              <Inspect copy={copy} record="request" onInspect={onInspect} />
            </div>
          ) : null}
        </div>
      </section>
      <section id="visits" className="rv-section" tabIndex={-1}>
        <div className="rv-section-heading">
          <div>
            <h2>{copy.tableTitle}</h2>
            <p>{copy.tableHint}</p>
          </div>
          <span className="rv-count">{previewVisits.length}</span>
        </div>
        <div className="rv-table-toolbar">
          <label className="rv-search">
            <Search size={17} aria-hidden="true" />
            <span className="rv-sr-only">{copy.search}</span>
            <input
              name="preview-search"
              autoComplete="off"
              type="search"
              placeholder={copy.searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <PreviewSelect
            id="preview-state"
            name="preview-state"
            label={copy.filter}
            className="rv-state-select"
            value={state}
            onValueChange={setState}
            theme={theme}
            dir={dir}
            options={[
              { value: 'all', label: copy.allStates },
              ...Object.entries(copy.statusesMap).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        <div className="rv-table-scroll" role="region" aria-label={copy.tableTitle} tabIndex={0}>
          <table className="rv-table">
            <caption className="rv-sr-only">{copy.tableHint}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.person}</th>
                <th scope="col">{copy.window}</th>
                <th scope="col">{copy.caregiver}</th>
                <th scope="col">{copy.state}</th>
                <th scope="col">
                  <span className="rv-sr-only">{copy.inspect}</span>
                </th>
              </tr>
            </thead>
            <tbody ref={resultsFeedback}>
              {matching.map((visit) => (
                <tr key={visit.id}>
                  <td>
                    <div className="rv-person">
                      <span className="rv-avatar" aria-hidden="true">
                        {copy.people[visit.person].slice(0, 1)}
                      </span>
                      <div>
                        <button
                          type="button"
                          className="rv-name-button"
                          onClick={(event) => onInspect(visit, event)}
                        >
                          {copy.people[visit.person]}
                        </button>
                        <span className="rv-cell-meta">{copy.services[visit.service]}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <bdi dir="ltr" className="rv-numeric">
                      {visit.time}
                    </bdi>
                    <span className="rv-cell-meta">
                      <bdi>{visit.id}</bdi>
                    </span>
                  </td>
                  <td>
                    {visit.caregiver ? (
                      <span className="rv-caregiver">
                        <UserRound size={14} aria-hidden="true" />
                        {copy.caregivers[visit.caregiver]}
                      </span>
                    ) : (
                      <span className="rv-muted">{copy.unassigned}</span>
                    )}
                  </td>
                  <td>
                    <VisitStatus state={visit.state} copy={copy} />
                    {visit.late ? (
                      <span className="rv-late-label">
                        <Clock3 size={12} aria-hidden="true" />
                        {copy.late}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${copy.inspect}: ${copy.people[visit.person]}`}
                      onClick={(event) => onInspect(visit, event)}
                    >
                      <ChevronRight size={17} className="rv-directional" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {matching.length === 0 ? (
          <div className="rv-empty" role="status">
            <Search size={24} aria-hidden="true" />
            <h3>{copy.emptyTitle}</h3>
            <p>{copy.emptyHint}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setState('all');
              }}
            >
              {copy.reset}
            </Button>
          </div>
        ) : null}
        <div className="rv-table-footer" aria-live="polite">
          {copy.showing}
          <span className="rv-numeric">
            {matching.length} / {previewVisits.length}
          </span>
        </div>
      </section>
    </>
  );
}

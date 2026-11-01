import { CalendarDays, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { previewVisits, type PreviewCopy } from '../../../../lib/design-preview';
import { VisitStatus } from './status';

export function SurfaceExamples({ copy }: { copy: PreviewCopy }) {
  return (
    <div className="rv-surface-examples">
      {[
        { token: 'canvas', label: copy.canvas },
        { token: 'sidebar', label: copy.examples.sidebar },
        { token: 'elevated', label: copy.examples.elevated },
      ].map(({ token, label }) => (
        <div className={`rv-surface-example rv-surface-example-${token}`} key={token}>
          <strong>{label}</strong>
          <p>{copy.examples.secondaryText}</p>
          <bdi dir="ltr">VIS-1042 · 09:30</bdi>
        </div>
      ))}
    </div>
  );
}

// Explicit specimens share the live state rules; only this board forces hover/focus.
export function StateExamples({ copy }: { copy: PreviewCopy }) {
  const [section, setSection] = useState('overview');
  const [selected, setSelected] = useState<string[]>(['VIS-1044']);
  const states = [
    { id: 'default', label: copy.examples.default },
    { id: 'hover', label: copy.examples.hover },
    { id: 'focus', label: copy.examples.focus },
  ];
  return (
    <section className="rv-board-section">
      <div className="rv-board-label">
        <h2>{copy.examples.title}</h2>
        <p>{copy.examples.hint}</p>
      </div>
      <div className="rv-state-examples">
        <div className="rv-action-comparison">
          {states.map((state) => (
            <div key={state.id}>
              <h3>{state.label}</h3>
              <span className="rv-button rv-button-primary" data-preview-state={state.id}>
                {copy.primaryAction}
              </span>
              <span className="rv-button rv-button-secondary" data-preview-state={state.id}>
                {copy.secondaryAction}
              </span>
            </div>
          ))}
        </div>
        <div>
          <h3 className="rv-example-label">{copy.examples.selection}</h3>
          <div className="rv-selection-example" role="group" aria-label={copy.examples.selection}>
            {[
              { id: 'overview', label: copy.overview, icon: LayoutDashboard },
              { id: 'visits', label: copy.visits, icon: CalendarDays },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={section === id}
                onClick={() => setSection(id)}
              >
                <Icon size={17} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <p className="rv-example-hint">{copy.examples.selectionHint}</p>
        </div>
        <div>
          <h3 className="rv-example-label">{copy.examples.rows}</h3>
          <div
            className="rv-table-scroll"
            role="region"
            aria-label={copy.examples.rows}
            tabIndex={0}
          >
            <table className="rv-table rv-example-table">
              <caption className="rv-sr-only">{copy.examples.rowsHint}</caption>
              <thead>
                <tr>
                  <th scope="col">{copy.person}</th>
                  <th scope="col">{copy.examples.appearance}</th>
                  <th scope="col">{copy.state}</th>
                </tr>
              </thead>
              <tbody>
                {previewVisits.slice(0, 3).map((visit, index) => (
                  <tr key={visit.id} data-preview-state={index === 1 ? 'hover' : undefined}>
                    <td>
                      <label className="rv-row-selection">
                        <input
                          type="checkbox"
                          checked={selected.includes(visit.id)}
                          aria-label={`${copy.examples.selectRecord}: ${copy.people[visit.person]}`}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelected((current) =>
                              checked
                                ? [...current, visit.id]
                                : current.filter((id) => id !== visit.id),
                            );
                          }}
                        />
                        <span>
                          {copy.people[visit.person]}
                          <bdi className="rv-cell-meta" dir="ltr">
                            {visit.id}
                          </bdi>
                        </span>
                      </label>
                    </td>
                    <td className="rv-muted">
                      {selected.includes(visit.id)
                        ? copy.examples.selected
                        : index === 1
                          ? copy.examples.hover
                          : copy.examples.default}
                    </td>
                    <td>
                      <VisitStatus state={visit.state} copy={copy} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rv-example-hint">{copy.examples.rowsHint}</p>
        </div>
      </div>
    </section>
  );
}

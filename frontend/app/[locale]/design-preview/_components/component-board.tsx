import {
  ArrowUpRight,
  Check,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import {
  previewVisits,
  type PreviewCopy,
  type PreviewTheme,
  type PreviewVisitState,
} from '../../../../lib/design-preview';
import { Button } from '../../../../components/ui/button';
import { Field, Input, Textarea, CheckboxField } from '../../../../components/ui/field';
import { Stepper } from '../../../../components/ui/stepper';
import { Feedback } from '../../../../components/ui/feedback';
import { PortalShell } from '../../../../components/layout/portal-shell';
import { VisitStatus } from './status';
import { Select as PreviewSelect } from '../../../../components/ui/select';
import type { OnInspect } from './workspace';
import { StateExamples, SurfaceExamples } from './state-examples';

export function ComponentBoard({
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
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState(copy.emailExample);
  const [reminders, setReminders] = useState(true);
  const [retried, setRetried] = useState(false);
  const [service, setService] = useState('');
  const invalidEmail = email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const states: PreviewVisitState[] = [
    'PLANNED',
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ];
  return (
    <>
      <div className="rv-page-heading rv-board-heading">
        <div>
          <h1>{copy.boardTitle}</h1>
          <p>{copy.boardIntro}</p>
        </div>
      </div>
      <section className="rv-board-section">
        <div className="rv-board-label">
          <h2>{copy.foundation}</h2>
          <p>{copy.foundationHint}</p>
        </div>
        <div className="rv-foundations">
          <div className="rv-swatches">
            {[
              { name: copy.primary, token: 'primary', hex: '#243B70' },
              { name: copy.accent, token: 'accent', hex: '#7485CF' },
              { name: copy.canvas, token: 'canvas', hex: theme === 'dark' ? '#161719' : '#F8F9FD' },
              { name: copy.ink, token: 'ink', hex: theme === 'dark' ? '#ECEEF2' : '#202A40' },
            ].map((swatch) => (
              <div key={swatch.token}>
                <div className={`rv-swatch rv-swatch-${swatch.token}`} />
                <strong>{swatch.name}</strong>
                <bdi dir="ltr">{swatch.hex}</bdi>
              </div>
            ))}
          </div>
          <SurfaceExamples copy={copy} />
          <div className="rv-type-specimen">
            <h3>{copy.typeTitle}</h3>
            <p className="rv-type-large">{copy.typeSample}</p>
            <p lang="ar" dir="rtl" className="rv-type-arabic">
              {copy.arabicSample}
            </p>
            <p>{copy.typeBody}</p>
            <bdi dir="ltr" className="rv-type-numbers">
              09:30 &nbsp; 128 &nbsp; 2,450.00
            </bdi>
          </div>
        </div>
      </section>
      <section className="rv-board-section">
        <div className="rv-board-label">
          <h2>{copy.controls}</h2>
          <p>{copy.controlsHint}</p>
        </div>
        <div>
          <div className="rv-button-specimens">
            <Button onClick={() => setFeedback(copy.buttonDemo)}>
              <Plus size={16} aria-hidden="true" />
              {copy.primaryAction}
            </Button>
            <Button variant="secondary" onClick={() => setFeedback(copy.buttonDemo)}>
              {copy.secondaryAction}
            </Button>
            <Button variant="ghost" onClick={() => setFeedback(copy.buttonDemo)}>
              {copy.ghostAction}
              <ArrowUpRight size={15} className="rv-directional" aria-hidden="true" />
            </Button>
            <Button variant="danger" onClick={() => setFeedback(copy.buttonDemo)}>
              {copy.dangerAction}
            </Button>
            <Button disabled variant="secondary">
              {copy.disabledAction}
            </Button>
            <Button disabled aria-busy="true">
              <LoaderCircle className="rv-spin" aria-hidden="true" size={16} />
              {copy.loadingAction}
            </Button>
          </div>
          <p className="rv-demo-feedback" role="status">
            {feedback || copy.boundary}
          </p>
        </div>
      </section>
      <StateExamples copy={copy} />
      <section className="rv-board-section">
        <div className="rv-board-label">
          <h2>{copy.fields}</h2>
          <p>{copy.fieldsHint}</p>
        </div>
        <div className="rv-fields-grid">
          <Field id="agency-name" label={copy.nameLabel} help={copy.nameHelp}>
            <Input
              id="agency-name"
              name="example-agency-name"
              autoComplete="off"
              className="rv-input"
              placeholder={copy.namePlaceholder}
              aria-describedby="agency-name-help"
            />
          </Field>
          <Field
            id="contact-email"
            label={copy.emailLabel}
            error={invalidEmail ? copy.emailError : undefined}
          >
            <Input
              id="contact-email"
              name="example-contact-email"
              autoComplete="off"
              spellCheck={false}
              type="email"
              dir="ltr"
              className="rv-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={invalidEmail}
              aria-describedby={invalidEmail ? 'contact-email-error' : undefined}
            />
          </Field>
          <Field id="sample-service" label={copy.selectLabel}>
            <PreviewSelect
              id="sample-service"
              name="example-service"
              label={copy.selectLabel}
              placeholder={copy.selectPlaceholder}
              value={service}
              onValueChange={setService}
              theme={theme}
              dir={dir}
              options={Object.entries(copy.services).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field id="sample-note" label={copy.notesLabel}>
            <Textarea
              id="sample-note"
              name="example-note"
              autoComplete="off"
              className="rv-input"
              placeholder={copy.notesPlaceholder}
              rows={2}
            />
          </Field>
          <Field id="disabled-service" label={copy.disabledSelectLabel}>
            <PreviewSelect
              id="disabled-service"
              name="disabled-example-service"
              label={copy.disabledSelectLabel}
              value="home"
              onValueChange={() => {}}
              disabled
              theme={theme}
              dir={dir}
              options={Object.entries(copy.services).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field id="disabled-field" label={copy.disabledField}>
            <Input
              id="disabled-field"
              name="disabled-example-field"
              className="rv-input"
              defaultValue={copy.agency}
              disabled
            />
          </Field>
          <label className="rv-toggle-row">
            <input
              type="checkbox"
              role="switch"
              checked={reminders}
              onChange={(event) => setReminders(event.target.checked)}
            />
            <span>
              <strong>{copy.switchLabel}</strong>
              <small>{copy.switchHint}</small>
            </span>
          </label>
        </div>
      </section>
      <section className="rv-board-section">
        <div className="rv-board-label">
          <h2>{copy.statuses}</h2>
          <p>{copy.statusesHint}</p>
        </div>
        <div className="rv-status-specimens">
          {states.map((state) => (
            <VisitStatus key={state} state={state} copy={copy} />
          ))}
        </div>
      </section>
      <section className="rv-board-section">
        <div className="rv-board-label">
          <h2>{copy.intake.title}</h2>
          <p>{copy.intake.hint}</p>
        </div>
        <div>
          <PortalShell
            presentation="embedded"
            theme={theme}
            dir={dir}
            header={<h3>{copy.agency}</h3>}
          >
            <Stepper steps={copy.intake.steps} current={1} label={copy.intake.title} />
            <CheckboxField id="board-consent" label={copy.intake.consent} required />
          </PortalShell>
        </div>
      </section>
      <section className="rv-board-section">
        <div className="rv-board-label">
          <h2>{copy.feedback}</h2>
          <p>{copy.feedbackHint}</p>
        </div>
        <div className="rv-feedback-grid">
          <Feedback tone={retried ? 'success' : 'error'}>
            <div>
              {retried ? (
                <Check size={19} aria-hidden="true" />
              ) : (
                <TriangleAlert size={19} aria-hidden="true" />
              )}
              <h3>{retried ? copy.completed : copy.errorTitle}</h3>
            </div>
            <p role={retried ? 'status' : undefined}>{retried ? copy.retried : copy.errorHint}</p>
            {!retried ? (
              <Button variant="secondary" onClick={() => setRetried(true)}>
                {copy.retry}
              </Button>
            ) : null}
          </Feedback>
          <Feedback>
            <div>
              <LockKeyhole size={19} aria-hidden="true" />
              <h3>{copy.restricted}</h3>
            </div>
            <p>{copy.restrictedHint}</p>
          </Feedback>
          <Feedback className="rv-empty-example">
            <Inbox size={25} aria-hidden="true" />
            <h3>{copy.emptyTitle}</h3>
            <p>{copy.emptyExampleHint}</p>
          </Feedback>
          <Feedback>
            <h3>{copy.loadingTitle}</h3>
            <div className="rv-skeleton-list" aria-label={copy.loadingLabel} role="img">
              {[1, 2, 3].map((item) => (
                <div key={item}>
                  <span />
                  <i />
                  <i />
                </div>
              ))}
            </div>
          </Feedback>
        </div>
      </section>
      <section className="rv-board-section">
        <div className="rv-board-label">
          <h2>{copy.detailExample}</h2>
          <p>{copy.detailExampleHint}</p>
        </div>
        <div>
          <Button
            variant="secondary"
            onClick={(event) => {
              const visit = previewVisits[0];
              if (visit) onInspect(visit, event);
            }}
          >
            {copy.openPanel}
            <ArrowUpRight size={16} className="rv-directional" aria-hidden="true" />
          </Button>
        </div>
      </section>
    </>
  );
}

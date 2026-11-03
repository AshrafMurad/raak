'use client';

import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { StatusBadge } from '../../../components/ui/status-badge';
import { carePlanCopy, formatPlanDateTime } from '../copy';
import type { CarePlanDetail, CarePlanVersion, GenerationPreview } from '../contracts';
import {
  canActivatePlanVersion,
  carePlanStatusTone,
  isClinicalApprovalApplicable,
} from '../policies';

export function PlanVersionPanel({
  locale,
  plan,
  version,
  preview,
  pending,
  onSelectVersion,
  onApprove,
  onPreview,
  onActivate,
}: {
  locale: Locale;
  plan: CarePlanDetail;
  version: CarePlanVersion | undefined;
  preview: GenerationPreview | null;
  pending: boolean;
  onSelectVersion(version: number): void;
  onApprove(version: number): void;
  onPreview(version: number): void;
  onActivate(version: number): void;
}) {
  const c = carePlanCopy(locale);
  return (
    <section>
      <h3>{c.versionHistory}</h3>
      <div className="raak-scheduling-list-row">
        {plan.versions.map((item) => (
          <Button
            key={item.id}
            variant={item.version === version?.version ? 'primary' : 'secondary'}
            onClick={() => onSelectVersion(item.version)}
          >
            {c.version} {item.version} · {c.states[item.status]}
          </Button>
        ))}
      </div>
      {version ? (
        <div className="raak-card">
          <div className="raak-scheduling-list-row">
            <StatusBadge tone={carePlanStatusTone(version.status)}>
              {c.states[version.status]}
            </StatusBadge>
            <bdi>
              {version.validFrom} – {version.validUntil}
            </bdi>
            <bdi>
              {version.localStartTime} · {version.durationMin} {c.minutes}
            </bdi>
            <bdi>{version.timezoneSnapshot}</bdi>
          </div>
          {version.approvedAt ? (
            <p>
              {c.approval}: {formatPlanDateTime(version.approvedAt, locale)}
            </p>
          ) : null}
          <div className="raak-actions">
            {isClinicalApprovalApplicable(plan, version) ? (
              <Button disabled={pending} onClick={() => onApprove(version.version)}>
                {c.approveExact}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => onPreview(version.version)}
            >
              {c.preview}
            </Button>
            {canActivatePlanVersion(plan, version, true) ? (
              <Button
                disabled={
                  pending ||
                  !canActivatePlanVersion(plan, version, preview?.version === version.version)
                }
                onClick={() => onActivate(version.version)}
              >
                {c.activate}
              </Button>
            ) : null}
          </div>
          <p className="raak-scheduling-meta">{c.approvalHint}</p>
        </div>
      ) : null}
      {preview && preview.version === version?.version ? (
        <GenerationPreviewPanel
          locale={locale}
          preview={preview}
          timezone={version?.timezoneSnapshot}
        />
      ) : null}
    </section>
  );
}

function GenerationPreviewPanel({
  locale,
  preview,
  timezone,
}: {
  locale: Locale;
  preview: GenerationPreview;
  timezone?: string;
}) {
  const c = carePlanCopy(locale);
  return (
    <section className="raak-card">
      <h3>{c.preview}</h3>
      <p>{c.previewHint}</p>
      <div className="raak-scheduling-metrics">
        <div className="raak-scheduling-metric">
          <strong>{preview.occurrenceCount}</strong>
          <span>{c.occurrences}</span>
        </div>
        <div className="raak-scheduling-metric">
          <strong>{preview.spanDays}</strong>
          <span>{c.spanDays}</span>
        </div>
        <div className="raak-scheduling-metric">
          <strong>{preview.wouldCancelCount}</strong>
          <span>{c.wouldCancel}</span>
        </div>
      </div>
      <p>{c.scheduledKept}</p>
      <div className="rv-table-scroll" tabIndex={0}>
        <table className="rv-table raak-scheduling-table">
          <thead>
            <tr>
              <th>{c.validFrom}</th>
              <th>{c.scheduledWindow}</th>
            </tr>
          </thead>
          <tbody>
            {preview.occurrences.map((item) => (
              <tr key={item.localDate}>
                <td>{item.localDate}</td>
                <td>{formatPlanDateTime(item.startUtc, locale, timezone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { StatusBadge } from '../../../components/ui/status-badge';

export function PlanSummary({
  statusLabel,
  tone,
  currentVersion,
  plannedVisits,
  scheduledVisits,
  labels,
}: {
  statusLabel: string;
  tone: 'scheduled' | 'completed' | 'cancelled' | 'in_progress' | 'planned';
  currentVersion: number;
  plannedVisits: number;
  scheduledVisits: number;
  labels: { version: string; plannedVisits: string; scheduledVisits: string };
}) {
  return (
    <>
      <div className="raak-scheduling-list-row">
        <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
      </div>
      <div className="raak-scheduling-metrics">
        <div className="raak-scheduling-metric">
          <strong>{currentVersion}</strong>
          <span>{labels.version}</span>
        </div>
        <div className="raak-scheduling-metric">
          <strong>{plannedVisits}</strong>
          <span>{labels.plannedVisits}</span>
        </div>
        <div className="raak-scheduling-metric">
          <strong>{scheduledVisits}</strong>
          <span>{labels.scheduledVisits}</span>
        </div>
      </div>
    </>
  );
}

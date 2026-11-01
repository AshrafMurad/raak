import { Check, Circle, CircleDashed, CircleDot, X } from 'lucide-react';
import type { PreviewCopy, PreviewVisitState } from '../../../../lib/design-preview';
import { StatusBadge } from '../../../../components/ui/status-badge';

const tones = {
  PLANNED: 'planned',
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

const markers = {
  PLANNED: CircleDashed,
  SCHEDULED: Circle,
  IN_PROGRESS: CircleDot,
  COMPLETED: Check,
  CANCELLED: X,
};

export function VisitStatus({ state, copy }: { state: PreviewVisitState; copy: PreviewCopy }) {
  const Marker = markers[state];
  return (
    <StatusBadge tone={tones[state]}>
      <Marker aria-hidden="true" size={13} strokeWidth={1.8} />
      {copy.statusesMap[state]}
    </StatusBadge>
  );
}

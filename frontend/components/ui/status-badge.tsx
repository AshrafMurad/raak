import type { ReactNode } from 'react';
export function StatusBadge({
  tone = 'planned',
  children,
}: {
  tone?: 'planned' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  children: ReactNode;
}) {
  return <span className={`rv-status rv-status-${tone}`}>{children}</span>;
}

import type { ReactNode } from 'react';
import { formatStatusLabel, getStatusTone } from './status-label.js';

export type StatusTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export interface StatusBadgeProps {
  children?: ReactNode;
  className?: string;
  status?: string | null;
  tone?: StatusTone;
  withDot?: boolean;
}

export function StatusBadge({
  children,
  className,
  status,
  tone,
  withDot = true,
}: StatusBadgeProps) {
  const resolvedTone = tone ?? (status ? getStatusTone(status) : 'neutral');
  const label = children ?? (status ? formatStatusLabel(status) : null);
  const classes = ['ui-status', `ui-status--${resolvedTone}`, className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {withDot && <span aria-hidden="true" className="ui-status__dot" />}
      {label}
    </span>
  );
}

import type { ReactNode } from 'react';

export type StatusTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

interface StatusBadgeProps {
  children: ReactNode;
  className?: string;
  tone?: StatusTone;
}

export function StatusBadge({ children, className, tone = 'neutral' }: StatusBadgeProps) {
  const classes = ['ui-status', `ui-status--${tone}`, className].filter(Boolean).join(' ');

  return <span className={classes}>{children}</span>;
}

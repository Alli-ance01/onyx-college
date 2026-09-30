import type { ReactNode } from 'react';

import { Button } from './button.js';

interface EmptyStateProps {
  action?: ReactNode;
  description: string;
  icon?: ReactNode;
  title: string;
}

export function EmptyState({ action, description, icon, title }: EmptyStateProps) {
  return (
    <section className="ui-state ui-state--empty" role="status">
      {icon === undefined ? (
        <span aria-hidden="true" className="ui-state__icon">
          —
        </span>
      ) : (
        <span aria-hidden="true" className="ui-state__icon">
          {icon}
        </span>
      )}
      <h2>{title}</h2>
      <p>{description}</p>
      {action === undefined ? null : <div className="ui-state__action">{action}</div>}
    </section>
  );
}

interface ErrorStateProps {
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
}

export function ErrorState({
  description = 'We could not load this information. Please try again.',
  onRetry,
  retryLabel = 'Try again',
  title = 'Something went wrong',
}: ErrorStateProps) {
  return (
    <section aria-live="polite" className="ui-state ui-state--error" role="alert">
      <span aria-hidden="true" className="ui-state__icon">
        !
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry === undefined ? null : (
        <div className="ui-state__action">
          <Button onClick={onRetry} variant="secondary">
            {retryLabel}
          </Button>
        </div>
      )}
    </section>
  );
}

interface LoadingStateProps {
  label?: string;
  rows?: number;
  variant?: 'block' | 'table';
}

export function LoadingState({
  label = 'Loading information',
  rows = 4,
  variant = 'block',
}: LoadingStateProps) {
  return (
    <div aria-busy="true" aria-live="polite" className={`ui-loading ui-loading--${variant}`}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span aria-hidden="true" className="ui-skeleton" key={index} />
      ))}
    </div>
  );
}

import type { HTMLAttributes, ReactNode } from 'react';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  description?: string;
  title?: string;
}

export function Panel({ children, className, description, title, ...props }: PanelProps) {
  return (
    <section className={['ui-panel', className].filter(Boolean).join(' ')} {...props}>
      {title === undefined && description === undefined ? null : (
        <header className="ui-panel__header">
          {title === undefined ? null : <h2>{title}</h2>}
          {description === undefined ? null : <p>{description}</p>}
        </header>
      )}
      <div className="ui-panel__body">{children}</div>
    </section>
  );
}

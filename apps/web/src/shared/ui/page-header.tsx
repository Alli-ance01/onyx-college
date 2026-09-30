import type { ReactNode } from 'react';

interface PageHeaderProps {
  actions?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}

export function PageHeader({ actions, description, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow === undefined ? null : <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description === undefined ? null : <p>{description}</p>}
      </div>
      {actions === undefined ? null : <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

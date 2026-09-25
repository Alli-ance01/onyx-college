import { Link } from 'react-router';

interface FoundationPageProps {
  description: string;
  eyebrow: string;
  title: string;
  variant?: 'portal' | 'public';
}

export function FoundationPage({
  description,
  eyebrow,
  title,
  variant = 'public',
}: FoundationPageProps) {
  return (
    <main id="workspace" className={variant === 'portal' ? 'portal-content' : 'public-content'}>
      <section className="surface foundation-panel" aria-labelledby="foundation-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="foundation-title">{title}</h1>
        <p className="foundation-panel__summary">{description}</p>
        <div className="foundation-status" role="status">
          <span className="status-dot" aria-hidden="true" />
          Foundation ready for vertical feature slices
        </div>
        {variant === 'public' ? (
          <div className="foundation-actions">
            <Link className="button-link" to="/student">
              Preview portal shell
            </Link>
            <a className="text-link" href="/api/v1/health/live">
              API liveness endpoint
            </a>
          </div>
        ) : null}
      </section>
    </main>
  );
}

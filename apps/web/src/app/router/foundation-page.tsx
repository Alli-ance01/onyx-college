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
  if (variant === 'portal') {
    return (
      <main className="portal-content product-page">
        <section className="surface foundation-panel" aria-labelledby="foundation-title">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="foundation-title">{title}</h1>
          <p className="foundation-panel__summary">{description}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-content public-home" id="workspace">
      <section className="school-hero" aria-labelledby="foundation-title">
        <div className="school-hero__copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="foundation-title">{title}</h1>
          <p className="school-hero__summary">{description}</p>
          <div className="school-hero__actions">
            <Link className="button-link" to="/auth/login">
              Sign in to the portal
            </Link>
            <Link className="text-link" to="/student-signup">
              New student? Start an application
            </Link>
          </div>
        </div>
        <aside className="school-hero__notice" aria-label="Portal information">
          <p className="eyebrow">Portal access</p>
          <h2>Everything in one secure place.</h2>
          <p>
            Students, teachers, and administrators use the portal for school records, communication,
            results, and everyday work.
          </p>
        </aside>
      </section>

      <section className="school-links" aria-labelledby="school-links-title">
        <div>
          <p className="eyebrow">Quick links</p>
          <h2 id="school-links-title">Choose the right starting point</h2>
        </div>
        <div className="school-links__grid">
          <Link className="school-link-card" to="/auth/login">
            <span className="school-link-card__number">01</span>
            <span>
              <strong>Existing users</strong>
              <small>Sign in to your student, teacher, or administrator workspace.</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link className="school-link-card" to="/student-signup">
            <span className="school-link-card__number">02</span>
            <span>
              <strong>Student application</strong>
              <small>Create an applicant account and complete your registration.</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="school-information" aria-label="School portal information">
        <div>
          <strong>Need help signing in?</strong>
          <span>Use the credentials issued by the school or contact the school office.</span>
        </div>
        <a href="/api/v1/health/live">System status</a>
      </section>
    </main>
  );
}

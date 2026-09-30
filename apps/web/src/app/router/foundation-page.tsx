import { Link } from 'react-router';

interface FoundationPageProps {
  description: string;
  eyebrow: string;
  title: string;
  variant?: 'portal' | 'public';
}

const pathways = [
  {
    eyebrow: 'For students',
    title: 'Start your application',
    description: 'Create your applicant account, complete your profile, and keep your next step in view.',
    action: 'Apply to Onyx',
    to: '/student-signup',
    tone: 'ochre',
  },
  {
    eyebrow: 'For the school community',
    title: 'Enter your workspace',
    description: 'Students, teachers, and administrators can sign in to the tools and records they use every day.',
    action: 'Sign in securely',
    to: '/auth/login',
    tone: 'ink',
  },
] as const;

export function FoundationPage({
  description,
  eyebrow,
  title,
  variant = 'public',
}: FoundationPageProps) {
  if (variant === 'portal') {
    return (
      <main id="workspace" className="portal-content">
        <section className="surface foundation-panel" aria-labelledby="foundation-title">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="foundation-title">{title}</h1>
          <p className="foundation-panel__summary">{description}</p>
          <div className="foundation-status" role="status">
            <span className="status-dot" aria-hidden="true" />
            Foundation ready for vertical feature slices
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="workspace" className="public-content public-home">
      <section className="foundation-hero" aria-labelledby="foundation-title">
        <div className="foundation-hero__copy">
          <div className="foundation-hero__signal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">{eyebrow} · One connected school day</p>
          <h1 id="foundation-title">A clearer way to move through <em>school life.</em></h1>
          <p className="foundation-panel__summary">{description}</p>
          <div className="foundation-actions">
            <Link className="button-link button-link--arrow" to="/student-signup">
              Begin an application <span aria-hidden="true">↗</span>
            </Link>
            <Link className="text-link text-link--quiet" to="/auth/login">
              I already have access
            </Link>
          </div>
          <div className="foundation-proof" role="status">
            <span className="status-dot" aria-hidden="true" />
            <span><strong>One secure home</strong> for students, teachers, and school leaders.</span>
          </div>
        </div>
        <aside className="foundation-hero__aside" aria-label="Onyx College at a glance">
          <div className="hero-note">
            <span className="hero-note__number">01</span>
            <p>Know what matters now</p>
            <span className="hero-note__rule" aria-hidden="true" />
            <small>Applications, results, announcements, and the people behind them.</small>
          </div>
          <div className="hero-aside__stamp" aria-hidden="true">
            <span>ONYX</span>
            <strong>COLLEGE</strong>
            <small>Est. for the next chapter</small>
          </div>
        </aside>
      </section>

      <section className="pathway-section" aria-labelledby="pathway-heading">
        <div className="section-intro">
          <p className="eyebrow">Choose your path</p>
          <h2 id="pathway-heading">Start where you are.</h2>
          <p>Simple entry points, thoughtful details, and no dead ends.</p>
        </div>
        <div className="pathway-grid">
          {pathways.map((pathway, index) => (
            <article className={`pathway-card pathway-card--${pathway.tone}`} key={pathway.title}>
              <span className="pathway-card__index">0{index + 1}</span>
              <p className="eyebrow">{pathway.eyebrow}</p>
              <h3>{pathway.title}</h3>
              <p>{pathway.description}</p>
              <Link className="pathway-card__link" to={pathway.to}>
                {pathway.action} <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-footer-note">
        <p className="eyebrow">Built for a full school day</p>
        <p>From first application to final result, Onyx keeps the work connected, private, and ready when you are.</p>
        <a className="text-link" href="/api/v1/health/live">Check system status ↗</a>
      </section>
    </main>
  );
}

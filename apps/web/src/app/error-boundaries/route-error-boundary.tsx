import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function RouteErrorBoundary() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="fatal-error" aria-labelledby="route-error-title">
      <div className="fatal-error__layout">
        <div className="fatal-error__signal" aria-hidden="true">
          <span>O</span>
          <i />
        </div>
        <p className="eyebrow">Onyx College / Navigation</p>
        <h1 id="route-error-title">
          {isNotFound ? 'This page took a wrong turn.' : 'This page needs a moment.'}
        </h1>
        <p className="fatal-error__description">
          {isNotFound
            ? 'The address does not match a page in this workspace. Nothing is lost — use a safe starting point below.'
            : 'We could not load this page safely. Return to a known workspace and try again from there.'}
        </p>
        <div className="fatal-error__actions">
          <Link className="button-link button-link--arrow" to="/">
            Return to Onyx home <span aria-hidden="true">↗</span>
          </Link>
          <a className="text-link" href="/api/v1/health/live">
            Check system status
          </a>
        </div>
        <p className="fatal-error__code" aria-hidden="true">
          {isNotFound ? '404 / NOT FOUND' : 'UNAVAILABLE / RETRY'}
        </p>
      </div>
    </main>
  );
}

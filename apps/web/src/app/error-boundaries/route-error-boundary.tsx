import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function RouteErrorBoundary() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="fatal-error" aria-labelledby="route-error-title">
      <div className="surface fatal-error__panel">
        <p className="eyebrow">Onyx College Portal</p>
        <h1 id="route-error-title">{isNotFound ? 'Page not found' : 'This page is unavailable'}</h1>
        <p>
          {isNotFound
            ? 'The requested page does not exist.'
            : 'The page could not be loaded safely. Please try again.'}
        </p>
        <Link className="button-link" to="/">
          Return to foundation home
        </Link>
      </div>
    </main>
  );
}

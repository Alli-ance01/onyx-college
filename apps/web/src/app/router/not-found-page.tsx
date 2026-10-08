import { Link } from 'react-router';
import { Icon } from '../../shared/ui/icon.js';

export function NotFoundPage({ home = '/' }: { home?: string }) {
  return (
    <main className="portal-content not-found-page">
      <Icon name="book" width="36" height="36" />
      <p className="eyebrow">Page not found · 404</p>
      <h1>Let’s find your way back.</h1>
      <p>This address does not match a page. Check the link, or return to your starting point.</p>
      <Link className="button-link" to={home}>
        {home === '/' ? 'Return to Onyx home' : 'Return to overview'}
      </Link>
    </main>
  );
}

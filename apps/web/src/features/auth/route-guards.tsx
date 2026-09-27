import type { PortalExperience } from '@onyx/contracts';
import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';

function portalPath(portal: PortalExperience): string {
  return portal === 'ADMIN'
    ? '/admin'
    : portal === 'TEACHER'
      ? '/teacher'
      : portal === 'STUDENT'
        ? '/student'
        : '/onboarding';
}

export function RequireAuthentication({ portal }: { portal?: PortalExperience }) {
  const auth = useAuthSession();
  const location = useLocation();

  if (auth.status === 'checking') {
    return (
      <main className="route-status" role="status">
        Checking your secure session…
      </main>
    );
  }
  if (auth.status !== 'authenticated') {
    return <Navigate replace state={{ from: location.pathname }} to="/auth/login" />;
  }
  if (auth.principal.mustChangePassword) {
    return <Navigate replace to="/auth/change-password" />;
  }
  if (portal !== undefined && auth.principal.portal !== portal) {
    return <Navigate replace to={portalPath(auth.principal.portal)} />;
  }
  return <Outlet />;
}

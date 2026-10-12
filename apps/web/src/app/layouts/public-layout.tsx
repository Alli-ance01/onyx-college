import { ConnectionStatus } from '../../shared/ui/connection-status.js';
import { useEffect } from 'react';
import { Brand } from '../../shared/ui/brand.js';
import { NavLink, Outlet, useLocation } from 'react-router';
import { SignOutButton } from '../../features/auth/sign-out-button.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';

export function PublicLayout() {
  const auth = useAuthSession();
  const isApplicant = auth.status === 'authenticated' && auth.principal.portal === 'ONBOARDING';
  const { pathname } = useLocation();
  useEffect(() => {
    const title =
      pathname === '/'
        ? 'We trust in excellence'
        : pathname === '/auth/login'
          ? 'Sign in'
          : pathname === '/student-signup'
            ? 'Student application'
            : pathname === '/auth/change-password'
              ? 'Account security'
              : pathname.startsWith('/onboarding')
                ? 'Your application'
                : pathname === '/teacher-setup'
                  ? 'Teacher account setup'
                  : 'Page not found';
    document.title = `${title} · Onyx College`;
  }, [pathname]);
  return (
    <div className="public-shell">
      <header className="public-header">
        <Brand />
        <nav aria-label="Public navigation" className="public-nav">
          <NavLink end to="/">
            Home
          </NavLink>
          <NavLink to={isApplicant ? '/onboarding' : '/student-signup'}>
            {isApplicant ? 'Your application' : 'Student application'}
          </NavLink>
          {isApplicant ? (
            <SignOutButton />
          ) : (
            <NavLink className="public-nav__cta" to="/auth/login">
              Sign in
            </NavLink>
          )}
        </nav>
      </header>
      <ConnectionStatus />
      <Outlet />
      <footer className="public-footer">
        <Brand />
        <p>School life, connected.</p>
        <small>© {new Date().getFullYear()} Onyx College</small>
      </footer>
    </div>
  );
}

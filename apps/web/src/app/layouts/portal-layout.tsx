import { Link, NavLink, Outlet } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';

interface PortalLayoutProps {
  portalName: 'Admin Portal' | 'Student Portal' | 'Teacher Portal';
}

export function PortalLayout({ portalName }: PortalLayoutProps) {
  const auth = useAuthSession();
  const links =
    portalName === 'Student Portal'
      ? [
          { label: 'Dashboard', to: '/student/dashboard' },
          { label: 'Profile', to: '/student/profile' },
        ]
      : portalName === 'Admin Portal'
        ? [
            { label: 'Dashboard', to: '/admin' },
            { label: 'Registration review', to: '/admin/students/registrations' },
            { label: 'Student directory', to: '/admin/students' },
            { label: 'Profile corrections', to: '/admin/students/corrections' },
            { label: 'Academic setup', to: '/admin/academics/setup' },
          ]
        : [{ label: 'Dashboard', to: '/teacher' }];
  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <Link className="brand brand--inverse" to="/" aria-label="Onyx College Portal home">
          <span className="brand__mark" aria-hidden="true">
            O
          </span>
          <span>
            <strong>Onyx College</strong>
            <small>{portalName}</small>
          </span>
        </Link>
        <nav aria-label={`${portalName} navigation`}>
          {links.map((link) => (
            <NavLink
              className={({ isActive }) =>
                `portal-nav-item${isActive ? ' portal-nav-item--active' : ''}`
              }
              end={link.to === '/admin' || link.to === '/teacher'}
              key={link.to}
              to={link.to}
            >
              {link.label}
            </NavLink>
          ))}
          <span className="portal-nav-section">Coming next</span>
          {['Assignments', 'Announcements', 'Results'].map((label) => (
            <span className="portal-nav-item portal-nav-item--disabled" key={label}>
              {label}
            </span>
          ))}
        </nav>
      </aside>
      <div className="portal-main">
        <header className="portal-header">
          <span className="portal-header__context">Signed in as {auth.principal?.displayName}</span>
          <div className="portal-header__actions">
            <Link to="/auth/change-password">Change password</Link>
            <button className="text-button" onClick={() => void auth.logout()} type="button">
              Sign out
            </button>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

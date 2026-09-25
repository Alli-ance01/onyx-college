import { Link, Outlet } from 'react-router';

interface PortalLayoutProps {
  portalName: 'Admin Portal' | 'Student Portal' | 'Teacher Portal';
}

export function PortalLayout({ portalName }: PortalLayoutProps) {
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
        <nav aria-label={`${portalName} foundation navigation`}>
          <a className="portal-nav-item portal-nav-item--active" href="#workspace">
            Foundation
          </a>
        </nav>
      </aside>
      <div className="portal-main">
        <header className="portal-header">
          <span className="portal-header__context">Application shell preview</span>
          <Link to="/">Switch experience</Link>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

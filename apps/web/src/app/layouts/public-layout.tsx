import { NavLink, Outlet } from 'react-router';

export function PublicLayout() {
  return (
    <div className="public-shell">
      <div className="public-utility-bar">
        <div className="public-utility-bar__inner">
          <span>ONYX COLLEGE · SCHOOL INFORMATION PORTAL</span>
          <span className="public-utility-bar__status"><i aria-hidden="true" /> Services operational</span>
        </div>
      </div>
      <header className="public-header">
        <NavLink className="brand" to="/" aria-label="Onyx College Portal home">
          <span className="brand__mark" aria-hidden="true">O</span>
          <span>
            <strong>Onyx College</strong>
            <small>School information portal</small>
          </span>
        </NavLink>
        <nav aria-label="Public navigation" className="public-nav">
          <NavLink end to="/">Home</NavLink>
          <NavLink to="/student-signup">Student application</NavLink>
          <NavLink className="public-nav__cta" to="/auth/login">Sign in <span aria-hidden="true">↗</span></NavLink>
        </nav>
      </header>
      <Outlet />
      <footer className="public-footer">
        <div>
          <span className="brand__mark" aria-hidden="true">O</span>
          <strong>Onyx College</strong>
        </div>
        <p>One secure home for the school community.</p>
        <small>© {new Date().getFullYear()} Onyx College</small>
      </footer>
    </div>
  );
}

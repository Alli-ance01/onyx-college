import { NavLink, Outlet } from 'react-router';

export function PublicLayout() {
  return (
    <div className="public-shell">
      <header className="public-header">
        <NavLink className="brand" to="/" aria-label="Onyx College Portal home">
          <span className="brand__mark" aria-hidden="true">
            O
          </span>
          <span>
            <strong>Onyx College</strong>
            <small>School information portal</small>
          </span>
        </NavLink>
        <nav aria-label="Public navigation" className="public-nav">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/student-signup">Student application</NavLink>
          <NavLink to="/auth/login">Sign in</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

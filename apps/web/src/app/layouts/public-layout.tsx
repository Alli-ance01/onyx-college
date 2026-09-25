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
            <small>Portal foundation</small>
          </span>
        </NavLink>
        <nav aria-label="Foundation previews" className="public-nav">
          <NavLink to="/auth">Public/Auth</NavLink>
          <NavLink to="/student">Student</NavLink>
          <NavLink to="/teacher">Teacher</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

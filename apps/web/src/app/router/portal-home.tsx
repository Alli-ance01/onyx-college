import { useAuthSession } from '../../lib/auth/use-auth-session.js';

export function PortalHome() {
  const { principal } = useAuthSession();
  return (
    <main className="portal-content" id="workspace">
      <section className="foundation-panel surface">
        <p className="eyebrow">Authenticated workspace</p>
        <h1>Welcome, {principal?.displayName}</h1>
        <p className="foundation-panel__summary">
          Your secure portal shell is ready. Product dashboards and workflows are intentionally
          outside this authentication slice.
        </p>
      </section>
    </main>
  );
}

import { LoadingState } from '../../shared/ui/async-state.js';
export function RouteLoading() {
  return (
    <main className="portal-content">
      <LoadingState label="Opening your page" rows={5} />
    </main>
  );
}

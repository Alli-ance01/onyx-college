import type { RegistrationDto, SuccessEnvelope } from '@onyx/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { ErrorState, Panel } from '../../shared/ui/index.js';
export function IntakeQueue() {
  const auth = useAuthSession();
  const allowed = auth.principal?.permissions.includes('students.approve_registration') === true;
  const query = useQuery({
    queryKey: ['admin-registrations', 'dashboard'],
    enabled: allowed,
    queryFn: async () => {
      const responses = await Promise.all(
        ['SUBMITTED', 'UNDER_REVIEW'].map((status) =>
          auth.apiClient.request<SuccessEnvelope<RegistrationDto[]>>(
            `/student-registrations?filter[status]=${status}`,
          ),
        ),
      );
      const unique = new Map<string, RegistrationDto>();
      for (const response of responses) {
        for (const item of response.data) {
          if (item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW') {
            unique.set(item.id, item);
          }
        }
      }
      return Array.from(unique.values()).sort((a, b) =>
        (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''),
      );
    },
  });
  if (!allowed) return null;
  return (
    <Panel
      className="admin-dashboard__applications-panel"
      title="Student applications"
      description="Oldest submissions first, with each record ready for a decision."
    >
      {query.isPending ? (
        <p className="admin-dashboard__queue-state" role="status">
          Loading applications…
        </p>
      ) : query.isError ? (
        <ErrorState title="Application queue unavailable" onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="admin-dashboard__queue-state" role="status">
          You’re all caught up. No applications are waiting for review.
        </p>
      ) : (
        <>
          <p className="admin-dashboard__queue-count" aria-live="polite">
            <strong>{query.data.length}</strong>{' '}
            {query.data.length === 1 ? 'application is' : 'applications are'} waiting for review.
          </p>
          <ul className="admin-dashboard__applicant-list">
            {query.data.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link to={`/admin/students/registrations/${item.id}`}>
                  <strong>
                    {item.data.personal.firstName} {item.data.personal.surname}
                  </strong>
                  <span>
                    {item.data.academic.requestedClassLevelCode} ·{' '}
                    {item.status.replaceAll('_', ' ')}
                    {item.submittedAt === undefined
                      ? ''
                      : ` · Submitted ${new Date(item.submittedAt).toLocaleDateString('en-NG')}`}
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
          {query.data.length > 5 ? (
            <p className="admin-dashboard__queue-note">
              Showing the oldest 5 of {query.data.length} applications.
            </p>
          ) : null}
        </>
      )}
      <Link className="admin-dashboard__inline-link" to="/admin/students/registrations">
        View all applications <span aria-hidden="true">→</span>
      </Link>
    </Panel>
  );
}

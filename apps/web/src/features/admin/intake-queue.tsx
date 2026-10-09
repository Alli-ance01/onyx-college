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
            `/student-registrations?status=${status}`,
          ),
        ),
      );
      return responses
        .flatMap((response) => response.data)
        .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
    },
  });
  if (!allowed) return null;
  return (
    <Panel
      title="Applications needing a decision"
      description="Oldest submitted applications first. Open a record to review its documents and placement."
    >
      {query.isPending ? (
        <p role="status">Loading applications…</p>
      ) : query.isError ? (
        <ErrorState title="Application queue unavailable" onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p>No applications are waiting for review.</p>
      ) : (
        <ul className="record-list">
          {query.data.slice(0, 5).map((item) => (
            <li key={item.id}>
              <Link to={`/admin/students/registrations/${item.id}`}>
                {item.data.personal.firstName} {item.data.personal.surname}
              </Link>
              <small>
                {item.data.academic.requestedClassLevelCode} · {item.status.replaceAll('_', ' ')}
                {item.submittedAt === undefined
                  ? ''
                  : ` · Submitted ${new Date(item.submittedAt).toLocaleDateString('en-NG')}`}
              </small>
            </li>
          ))}
        </ul>
      )}
      <Link to="/admin/students/registrations">Open registration review</Link>
    </Panel>
  );
}

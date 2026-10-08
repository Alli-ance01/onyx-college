import type {
  AcademicSetupDto,
  CursorPaginationMeta,
  ProfileCorrectionRequestDto,
  RegistrationDto,
  StudentDirectoryItemDto,
  StudentProfileDto,
  SuccessEnvelope,
} from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';

import { ApiClientError } from '../../lib/api/api-client.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { DataTable, ErrorState } from '../../shared/ui/index.js';
import { DocumentViewButton } from '../student-onboarding/document-view-button.js';

const registrationFilters = [
  'ALL',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'REJECTED',
  'APPROVED',
  'DUPLICATE_REVIEW',
] as const;

export function AdminRegistrationQueuePage() {
  const auth = useAuthSession();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'SUBMITTED';
  const q = params.get('q') ?? '';
  const query = useQuery({
    queryKey: ['admin-registrations', status, q],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (status === 'DUPLICATE_REVIEW') search.set('filter[duplicateReview]', 'true');
      else if (status !== 'ALL') search.set('filter[status]', status);
      if (q !== '') search.set('q', q);
      return (
        await auth.apiClient.request<SuccessEnvelope<RegistrationDto[]>>(
          `/student-registrations?${search.toString()}`,
        )
      ).data;
    },
  });
  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Students · Admissions</p>
          <h1>Registration review</h1>
          <p>
            Review submitted applications, corrections, decisions, and possible duplicate cases.
          </p>
        </div>
      </header>
      <div className="toolbar surface">
        <label className="search-field">
          Search applicants
          <input
            defaultValue={q}
            onKeyDown={(event) => {
              if (event.key === 'Enter')
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('q', event.currentTarget.value);
                  return next;
                });
            }}
            placeholder="Name"
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setParams({ status: event.target.value });
            }}
          >
            {registrationFilters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {query.isError ? (
        <ErrorState title="Registration queue unavailable" onRetry={() => void query.refetch()} />
      ) : null}
      <div className="filter-tabs">
        {registrationFilters.map((item) => (
          <button
            className={status === item ? 'active' : ''}
            key={item}
            onClick={() => {
              setParams({ status: item });
            }}
          >
            {item.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      <div className="table-wrap surface">
        <table>
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Requested placement</th>
              <th>Status</th>
              <th>Duplicate review</th>
              <th>Submitted</th>
              <th>
                <span className="visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {query.data?.map((registration) => (
              <tr key={registration.id}>
                <td data-label="Applicant">
                  <strong>
                    {registration.data.personal.firstName} {registration.data.personal.surname}
                  </strong>
                  <small>{registration.data.guardian.phone}</small>
                </td>
                <td data-label="Requested placement">
                  {registration.data.academic.requestedClassLevelCode ?? '—'}{' '}
                  {registration.data.academic.requestedTrackCode ?? ''}
                </td>
                <td data-label="Status">
                  <span className="status-badge">{registration.status.replaceAll('_', ' ')}</span>
                </td>
                <td data-label="Duplicate review">
                  {registration.duplicateReview.requiresReview ? (
                    <span className="warning-text">Review required</span>
                  ) : (
                    'Clear'
                  )}
                </td>
                <td data-label="Submitted">
                  {registration.submittedAt === undefined
                    ? 'Not submitted'
                    : new Date(registration.submittedAt).toLocaleDateString()}
                </td>
                <td data-label="">
                  <Link to={`/admin/students/registrations/${registration.id}`}>Open review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.isLoading ? (
          <p className="table-state">Loading registrations…</p>
        ) : query.data?.length === 0 ? (
          <p className="table-state">No registrations match this view.</p>
        ) : null}
      </div>
    </main>
  );
}

export function AdminRegistrationReviewPage() {
  const { registrationId = '' } = useParams();
  const auth = useAuthSession();
  const client = useQueryClient();
  const [note, setNote] = useState('');
  const [fields, setFields] = useState('personal.surname');
  const [classLevelId, setClassLevelId] = useState('');
  const [trackId, setTrackId] = useState('');
  const query = useQuery({
    queryKey: ['admin-registration', registrationId],
    queryFn: async () =>
      (
        await auth.apiClient.request<SuccessEnvelope<RegistrationDto>>(
          `/student-registrations/${registrationId}`,
        )
      ).data,
  });
  const academic = useQuery({
    queryKey: ['academic-setup'],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<AcademicSetupDto>>('/academic-setup')).data,
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['admin-registration', registrationId] });
    await client.invalidateQueries({ queryKey: ['admin-registrations'] });
  };
  const command = useMutation({
    mutationFn: async ({
      body,
      path,
      headers,
    }: {
      body?: unknown;
      headers?: HeadersInit;
      path: string;
    }) =>
      auth.apiClient.request(`/student-registrations/${registrationId}/${path}`, {
        ...(body === undefined ? {} : { body }),
        ...(headers === undefined ? {} : { headers }),
        method: 'POST',
      }),
    onSuccess: refresh,
  });
  const documentReview = useMutation({
    mutationFn: async ({
      documentId,
      status,
    }: {
      documentId: string;
      status: 'REJECTED' | 'VERIFIED';
    }) =>
      auth.apiClient.request(`/student-documents/${documentId}/review`, {
        body: { note: status === 'REJECTED' ? note : undefined, status },
        method: 'POST',
      }),
    onSuccess: refresh,
  });
  if (query.isLoading)
    return <main className="portal-content route-status">Loading registration…</main>;
  if (query.data === undefined)
    return (
      <main className="portal-content">
        <div className="form-alert form-alert--error">Registration unavailable.</div>
      </main>
    );
  const registration = query.data;
  const actionError = command.error ?? documentReview.error;
  const senior =
    academic.data?.classLevels.find(({ id }) => id === classLevelId)?.stage === 'SENIOR';
  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <Link className="back-link" to="/admin/students/registrations">
            ← Registration queue
          </Link>
          <p className="eyebrow">Application review</p>
          <h1>
            {registration.data.personal.firstName} {registration.data.personal.surname}
          </h1>
          <p>Application {registration.id}</p>
        </div>
        <span className="status-badge">{registration.status.replaceAll('_', ' ')}</span>
      </header>
      {registration.duplicateReview.requiresReview ? (
        <div className="form-alert">
          <strong>Possible duplicate:</strong> a strong deterministic candidate match requires an
          explicit resolution before approval.
        </div>
      ) : null}
      <div className="review-layout">
        <div className="review-sections">
          <ReviewSection title="Personal information" entries={registration.data.personal} />
          <ReviewSection title="Contact information" entries={registration.data.contact} />
          <ReviewSection title="Guardian" entries={registration.data.guardian} />
          <ReviewSection title="Requested placement" entries={registration.data.academic} />
          {auth.principal?.permissions.includes('students.read_sensitive') ? (
            <ReviewSection title="Medical / emergency" entries={registration.data.medical} />
          ) : null}
          <section className="review-section surface">
            <h2>Documents</h2>
            {registration.documents.length === 0 ? (
              <p className="empty-copy">No documents uploaded.</p>
            ) : (
              registration.documents.map((document) => (
                <div className="document-row" key={document.id}>
                  <div>
                    <strong>{document.displayName}</strong>
                    <span>
                      {document.reviewStatus.replaceAll('_', ' ')} ·{' '}
                      {(document.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  {auth.principal?.permissions.some((permission) =>
                    ['documents.read', 'documents.review'].includes(permission),
                  ) ? (
                    <DocumentViewButton documentId={document.id} />
                  ) : null}
                  {auth.principal?.permissions.includes('documents.review') ? (
                    <div className="row-actions">
                      <button
                        className="text-button"
                        onClick={() => {
                          documentReview.mutate({ documentId: document.id, status: 'VERIFIED' });
                        }}
                      >
                        Verify
                      </button>
                      <button
                        className="text-button text-button--danger"
                        onClick={() => {
                          documentReview.mutate({ documentId: document.id, status: 'REJECTED' });
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </section>
          <section className="review-section surface">
            <h2>Submission history</h2>
            <div className="timeline">
              {registration.reviewHistory.map((event, index) => (
                <div key={`${event.at}-${String(index)}`}>
                  <strong>{event.action.replaceAll('_', ' ')}</strong>
                  <time>{new Date(event.at).toLocaleString()}</time>
                  {event.note === undefined ? null : <p>{event.note}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="decision-panel surface">
          <h2>Review actions</h2>
          {command.isError || documentReview.isError ? (
            <div className="form-alert form-alert--error">
              {actionError instanceof ApiClientError ? actionError.message : 'Action failed.'}
            </div>
          ) : null}
          {registration.status === 'SUBMITTED' ? (
            <button
              className="primary-button"
              onClick={() => {
                command.mutate({ path: 'start-review' });
              }}
            >
              Begin review
            </button>
          ) : null}
          {registration.status === 'REJECTED' ? (
            <>
              <label>
                Reopen reason
                <textarea
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                />
              </label>
              <button
                className="primary-button"
                onClick={() => {
                  command.mutate({ body: { note }, path: 'reopen' });
                }}
              >
                Reopen registration
              </button>
            </>
          ) : null}
          {registration.status === 'UNDER_REVIEW' ? (
            <>
              <label>
                Decision note
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                />
              </label>
              <label>
                Fields requiring correction
                <input
                  value={fields}
                  onChange={(event) => {
                    setFields(event.target.value);
                  }}
                />
                <small>Comma-separated field paths</small>
              </label>
              <button
                className="secondary-button"
                onClick={() => {
                  command.mutate({
                    body: {
                      allowedCorrectionFields: fields
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                      note,
                    },
                    path: 'request-changes',
                  });
                }}
              >
                Request changes
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  command.mutate({ body: { note }, path: 'reject' });
                }}
              >
                Reject registration
              </button>
              {registration.duplicateReview.requiresReview &&
              registration.duplicateReview.resolution === undefined ? (
                <div className="form-grid">
                  {[
                    ['CONFIRMED_DISTINCT', 'Confirm distinct applicant', 'secondary-button'],
                    ['ORIGINAL_REOPENED', 'Reopen rejected original', 'secondary-button'],
                    ['DUPLICATE_REJECTED', 'Reject duplicate attempt', 'danger-button'],
                  ].map(([resolution, label, className]) => (
                    <button
                      className={className}
                      key={resolution}
                      onClick={() => {
                        command.mutate({
                          body: { reason: note, resolution },
                          path: 'resolve-duplicate',
                        });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <hr />
              <h3>Authoritative placement</h3>
              {academic.data?.activeSession === undefined ? (
                <p className="warning-text">Set up an active academic session before approval.</p>
              ) : (
                <p>{academic.data.activeSession.label}</p>
              )}
              <label>
                Class level
                <select
                  value={classLevelId}
                  onChange={(event) => {
                    setClassLevelId(event.target.value);
                    setTrackId('');
                  }}
                >
                  <option value="">Select</option>
                  {academic.data?.classLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </select>
              </label>
              {senior ? (
                <label>
                  Senior track
                  <select
                    value={trackId}
                    onChange={(event) => {
                      setTrackId(event.target.value);
                    }}
                  >
                    <option value="">Select</option>
                    {academic.data?.tracks.map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                className="primary-button"
                disabled={
                  academic.data?.activeSession === undefined ||
                  classLevelId === '' ||
                  (senior && trackId === '')
                }
                onClick={() => {
                  command.mutate({
                    body: {
                      academicSessionId: academic.data?.activeSession?.id,
                      classLevelId,
                      ...(senior ? { trackId } : {}),
                    },
                    headers: { 'Idempotency-Key': crypto.randomUUID() },
                    path: 'approve',
                  });
                }}
              >
                Approve and create student
              </button>
            </>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function ReviewSection({ entries, title }: { entries: Record<string, unknown>; title: string }) {
  return (
    <section className="review-section surface">
      <h2>{title}</h2>
      <dl className="definition-grid">
        {Object.entries(entries)
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll(/([A-Z])/gu, ' $1')}</dt>
              <dd>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

export function AdminAcademicSetupPage() {
  const auth = useAuthSession();
  const client = useQueryClient();
  const [label, setLabel] = useState('');
  const [ordinal, setOrdinal] = useState(1);
  const query = useQuery({
    queryKey: ['academic-setup'],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<AcademicSetupDto>>('/academic-setup')).data,
  });
  const activate = useMutation({
    mutationFn: async () =>
      auth.apiClient.request('/academic-setup/activate-initial-session', {
        body: { activeTermOrdinal: ordinal, label },
        method: 'POST',
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['academic-setup'] }),
  });
  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Academic structure</p>
          <h1>Initial academic setup</h1>
          <p>Persisted class levels and tracks support authoritative student placement.</p>
        </div>
      </header>
      <section className="settings-panel surface">
        {query.data?.activeSession === undefined ? (
          <>
            <h2>Activate the first academic session</h2>
            <div className="form-grid form-grid--two">
              <label>
                Session label
                <input
                  placeholder="2026/2027"
                  value={label}
                  onChange={(event) => {
                    setLabel(event.target.value);
                  }}
                />
              </label>
              <label>
                Active term
                <select
                  value={ordinal}
                  onChange={(event) => {
                    setOrdinal(Number(event.target.value));
                  }}
                >
                  <option value={1}>First Term</option>
                  <option value={2}>Second Term</option>
                  <option value={3}>Third Term</option>
                </select>
              </label>
            </div>
            {activate.isError ? (
              <div className="form-alert form-alert--error">Unable to activate this session.</div>
            ) : null}
            <button
              className="primary-button"
              disabled={label.length !== 9 || activate.isPending}
              onClick={() => {
                activate.mutate();
              }}
            >
              Activate academic session
            </button>
          </>
        ) : (
          <>
            <span className="status-badge status-badge--success">Active</span>
            <h2>{query.data.activeSession.label}</h2>
            <p>{query.data.activeTerm?.name ?? 'No active term'}</p>
          </>
        )}
        <hr />
        <h3>Class levels</h3>
        <p>{query.data?.classLevels.map(({ name }) => name).join(' · ')}</p>
        <h3>Senior tracks</h3>
        <p>{query.data?.tracks.map(({ name }) => name).join(' · ')}</p>
      </section>
    </main>
  );
}

export function AdminStudentDirectoryPage() {
  const auth = useAuthSession();
  const { pathname } = useLocation();
  const fixedStatus = pathname.endsWith('/graduated')
    ? 'GRADUATED'
    : pathname.endsWith('/archived')
      ? 'ARCHIVED'
      : undefined;
  const [filters, setFilters] = useSearchParams();
  const q = filters.get('q') ?? '';
  const sessionId = filters.get('session') ?? '';
  const classLevelId = filters.get('class') ?? '';
  const trackId = filters.get('track') ?? '';
  const gender = filters.get('gender') ?? '';
  const selectedStatus = filters.get('status') ?? '';
  const status = fixedStatus ?? selectedStatus;
  const cursor = filters.get('cursor') ?? '';
  const activeFilterCount = [sessionId, classLevelId, trackId, gender, selectedStatus].filter(
    Boolean,
  ).length;
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);
  const updateFilter = (key: string, value: string) => {
    setFilters(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (key !== 'cursor') next.delete('cursor');
        if (value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: key === 'q' },
    );
  };
  const academic = useQuery({
    queryKey: ['academic-setup'],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<AcademicSetupDto>>('/academic-setup')).data,
  });
  const query = useQuery({
    queryKey: ['admin-students', q, sessionId, classLevelId, trackId, gender, status, cursor],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (q !== '') search.set('q', q);
      if (sessionId !== '') search.set('filter[sessionId]', sessionId);
      if (classLevelId !== '') search.set('filter[classLevelId]', classLevelId);
      if (trackId !== '') search.set('filter[trackId]', trackId);
      if (gender !== '') search.set('filter[gender]', gender);
      if (status !== '') search.set('filter[status]', status);
      if (cursor !== '') search.set('cursor', cursor);
      return auth.apiClient.request<
        SuccessEnvelope<StudentDirectoryItemDto[], CursorPaginationMeta>
      >('/students?' + search.toString());
    },
  });
  const students = query.data?.data ?? [];
  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Students</p>
          <h1>
            {fixedStatus === 'GRADUATED'
              ? 'Graduated students'
              : fixedStatus === 'ARCHIVED'
                ? 'Archived students'
                : 'Student directory'}
          </h1>
          <p>Find student records, view profiles, and review academic placements.</p>
        </div>
      </header>
      <div className="directory-toolbar surface">
        <label className="search-field">
          Search
          <input
            value={q}
            onChange={(event) => {
              updateFilter('q', event.target.value);
            }}
            placeholder="Name or Student ID"
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="directory-filters"
          onClick={() => {
            setFiltersOpen(!filtersOpen);
          }}
        >
          Filters{activeFilterCount > 0 ? ` (${String(activeFilterCount)})` : ''}
        </button>
        {q !== '' || activeFilterCount > 0 ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setFilters({});
            }}
          >
            Clear filters
          </button>
        ) : null}
        <div className="directory-filters" id="directory-filters" hidden={!filtersOpen}>
          <label>
            Academic session
            <select
              value={sessionId}
              onChange={(event) => {
                updateFilter('session', event.target.value);
              }}
            >
              <option value="">All available</option>
              {academic.data?.activeSession === undefined ? null : (
                <option value={academic.data.activeSession.id}>
                  {academic.data.activeSession.label}
                </option>
              )}
            </select>
          </label>
          <label>
            Class
            <select
              value={classLevelId}
              onChange={(event) => {
                updateFilter('class', event.target.value);
              }}
            >
              <option value="">All classes</option>
              {academic.data?.classLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Track
            <select
              value={trackId}
              onChange={(event) => {
                updateFilter('track', event.target.value);
              }}
            >
              <option value="">All tracks</option>
              {academic.data?.tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Gender
            <select
              value={gender}
              onChange={(event) => {
                updateFilter('gender', event.target.value);
              }}
            >
              <option value="">All</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={status}
              disabled={fixedStatus !== undefined}
              onChange={(event) => {
                updateFilter('status', event.target.value);
              }}
            >
              <option value="">All</option>
              {['ACTIVE', 'WITHDRAWN', 'TRANSFERRED', 'GRADUATED', 'ARCHIVED'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {query.isError ? (
        <ErrorState title="Student directory unavailable" onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          caption="Student directory"
          loading={query.isPending}
          rows={students}
          getRowKey={(student) => student.id}
          emptyTitle="No students match this view"
          emptyDescription="Try another search or filter. Approved students appear here after registration review."
          columns={[
            {
              id: 'student',
              header: 'Student',
              render: (student) => <strong>{student.name}</strong>,
            },
            { id: 'identifier', header: 'Student ID', render: (student) => student.studentId },
            { id: 'gender', header: 'Gender', render: (student) => student.gender },
            { id: 'class', header: 'Class', render: (student) => student.classLevel ?? '—' },
            { id: 'track', header: 'Track', render: (student) => student.track ?? '—' },
            { id: 'status', header: 'Status', render: (student) => student.lifecycleStatus },
            {
              id: 'action',
              header: 'Profile',
              render: (student) => <Link to={`/admin/students/${student.id}`}>View profile</Link>,
            },
          ]}
        />
      )}
      {cursor !== '' || query.data?.meta?.hasMore === true ? (
        <div className="pagination-actions">
          {cursor === '' ? null : (
            <button
              className="secondary-button"
              onClick={() => {
                updateFilter('cursor', '');
              }}
            >
              First page
            </button>
          )}
          {query.data?.meta?.nextCursor === undefined ? null : (
            <button
              className="secondary-button"
              onClick={() => {
                updateFilter('cursor', query.data?.meta?.nextCursor ?? '');
              }}
            >
              Next page
            </button>
          )}
        </div>
      ) : null}
    </main>
  );
}

export function AdminStudentProfilePage() {
  const { studentId = '' } = useParams();
  const auth = useAuthSession();
  const query = useQuery({
    queryKey: ['admin-student', studentId],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<StudentProfileDto>>(`/students/${studentId}`))
        .data,
  });
  if (query.isError)
    return (
      <main className="portal-content">
        <ErrorState title="Student profile unavailable" onRetry={() => void query.refetch()} />
      </main>
    );
  if (query.data === undefined)
    return <main className="portal-content route-status">Loading student profile…</main>;
  const student = query.data;
  const canReadDocuments =
    auth.principal?.permissions.some((permission) =>
      ['documents.read', 'documents.review'].includes(permission),
    ) === true;
  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <Link className="back-link" to="/admin/students">
            ← Student directory
          </Link>
          <p className="eyebrow">Student profile</p>
          <h1>{student.studentName}</h1>
          <p>
            {student.studentId} · {student.lifecycleStatus}
          </p>
        </div>
      </header>
      <div className="admin-profile-grid">
        <ReviewSection title="Biodata" entries={student.biodata} />
        <section className="review-section surface">
          <h2>Guardians</h2>
          {student.guardians.map((guardian) => (
            <p key={guardian.phone}>
              <strong>{guardian.fullName}</strong>
              <br />
              {guardian.relationship} · {guardian.phone}
            </p>
          ))}
        </section>
        <section className="review-section surface">
          <h2>Academic history</h2>
          {student.academicHistory.map((item) => (
            <p key={item.id}>
              <strong>{item.session.label}</strong>
              <br />
              {item.classLevel.name}
              {item.track === undefined ? '' : ` · ${item.track.name}`} · {item.status}
            </p>
          ))}
        </section>
        <section className="review-section surface">
          <h2>Documents</h2>
          {student.documents.map((item) => (
            <p key={item.id}>
              <strong>{item.displayName}</strong>
              <br />
              {item.reviewStatus.replaceAll('_', ' ')}
              <br />
              {canReadDocuments ? <DocumentViewButton documentId={item.id} /> : null}
            </p>
          ))}
        </section>
        {student.medical === undefined ? null : (
          <ReviewSection title="Restricted medical / emergency" entries={student.medical} />
        )}
        <section className="review-section surface">
          <h2>Correction requests</h2>
          {student.correctionRequests.length === 0 ? (
            <p>None</p>
          ) : (
            student.correctionRequests.map((item) => (
              <p key={item.id}>
                <strong>{item.field}</strong>
                <br />
                {item.status} · {item.requestedValue}
              </p>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

export function AdminCorrectionQueuePage() {
  const auth = useAuthSession();
  const client = useQueryClient();
  const [reason, setReason] = useState('Reviewed against the submitted profile information.');
  const query = useQuery({
    queryKey: ['profile-corrections'],
    queryFn: async () =>
      (
        await auth.apiClient.request<SuccessEnvelope<ProfileCorrectionRequestDto[]>>(
          '/profile-correction-requests',
        )
      ).data,
  });
  const decide = useMutation({
    mutationFn: async ({ action, id }: { action: 'approve' | 'reject'; id: string }) =>
      auth.apiClient.request(`/profile-correction-requests/${id}/${action}`, {
        body: { reason },
        method: 'POST',
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['profile-corrections'] }),
  });
  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Students · Corrections</p>
          <h1>Profile correction requests</h1>
          <p>
            Approved corrections update authoritative biodata and retain before/after audit history.
          </p>
        </div>
      </header>
      <label className="surface inline-review-note">
        Review reason
        <textarea
          rows={2}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </label>
      <div className="table-wrap surface">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Requested value</th>
              <th>Reason</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {query.data?.map((item) => (
              <tr key={item.id}>
                <td>{item.field}</td>
                <td>{item.requestedValue}</td>
                <td>{item.reason}</td>
                <td>{item.status}</td>
                <td>
                  {item.status === 'SUBMITTED' ? (
                    <div className="row-actions">
                      <button
                        className="text-button"
                        onClick={() => {
                          decide.mutate({ action: 'approve', id: item.id });
                        }}
                      >
                        Approve
                      </button>
                      <button
                        className="text-button text-button--danger"
                        onClick={() => {
                          decide.mutate({ action: 'reject', id: item.id });
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

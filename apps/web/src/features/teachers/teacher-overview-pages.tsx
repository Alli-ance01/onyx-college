import type {
  ClassTeacherAssignmentDto,
  EnrollmentDto,
  TeachingAssignmentDto,
} from '@onyx/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import { teacherApi, teacherQueryKeys } from './teacher-api.js';

function assignmentLabel(assignment: ClassTeacherAssignmentDto | TeachingAssignmentDto): string {
  return `${assignment.classLevel.name}${assignment.track === undefined ? '' : ` / ${assignment.track.name}`}`;
}

function useTeacherFoundation() {
  const auth = useAuthSession();
  const profile = useQuery({
    queryFn: () => teacherApi.profile(auth.apiClient),
    queryKey: teacherQueryKeys.profile,
  });
  const assignments = useQuery({
    enabled: profile.data?.teacher.status === 'ACTIVE',
    queryFn: () => teacherApi.academicAssignments(auth.apiClient),
    queryKey: teacherQueryKeys.teachingAssignments,
  });
  return { assignments, auth, profile };
}

function ApprovalNotice({ status }: { status: string }) {
  return (
    <Panel className="approval-notice" title="Staff approval required">
      <p>
        Your account setup is complete, but academic access stays restricted until an authorized
        administrator approves your teacher profile. Current status: <strong>{status}</strong>.
      </p>
    </Panel>
  );
}

export function TeacherDashboardPage() {
  const { assignments, auth, profile } = useTeacherFoundation();
  const work = useQuery({
    enabled: profile.data?.teacher.status === 'ACTIVE',
    queryFn: () => teacherApi.assignments(auth.apiClient),
    queryKey: teacherQueryKeys.assignments,
  });
  const notices = useQuery({
    enabled: profile.data?.teacher.status === 'ACTIVE',
    queryFn: () => teacherApi.announcements(auth.apiClient),
    queryKey: teacherQueryKeys.announcements,
  });

  if (profile.isPending) return <LoadingState label="Loading teacher dashboard" rows={5} />;
  if (profile.isError)
    return (
      <ErrorState onRetry={() => void profile.refetch()} title="Teacher profile unavailable" />
    );
  if (profile.data.teacher.status !== 'ACTIVE') {
    return (
      <main className="portal-content product-page">
        <PageHeader eyebrow="Teacher Portal" title={`Welcome, ${profile.data.teacher.firstName}`} />
        <ApprovalNotice status={profile.data.teacher.status} />
      </main>
    );
  }
  if (assignments.isPending || work.isPending || notices.isPending) {
    return <LoadingState label="Loading teacher dashboard" rows={5} />;
  }
  if (assignments.isError || work.isError || notices.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void Promise.all([assignments.refetch(), work.refetch(), notices.refetch()]);
        }}
        title="Teacher dashboard unavailable"
      />
    );
  }
  const active = assignments.data.filter((item) => item.status === 'ACTIVE');
  const subjects = new Set(
    active.filter((item) => item.type === 'TEACHING').map((item) => item.subject.id),
  ).size;
  const classes = new Set(active.map((item) => `${item.classLevel.id}:${item.track?.id ?? ''}`))
    .size;

  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Your current academic scope and the work that needs attention."
        eyebrow="Teacher Portal"
        title={`Welcome, ${profile.data.teacher.firstName}`}
      />
      <div className="metric-grid">
        <Panel title="Active classes">
          <strong className="metric-value">{classes}</strong>
        </Panel>
        <Panel title="Assigned subjects">
          <strong className="metric-value">{subjects}</strong>
        </Panel>
        <Panel title="Draft assignments">
          <strong className="metric-value">
            {work.data.filter((item) => item.status === 'DRAFT').length}
          </strong>
        </Panel>
        <Panel title="Current announcements">
          <strong className="metric-value">
            {notices.data.filter((item) => item.status === 'PUBLISHED').length}
          </strong>
        </Panel>
      </div>
      <div className="content-grid content-grid--two">
        <Panel
          title="Academic assignments"
          description="Only these assignments confer academic authority."
        >
          {active.length === 0 ? (
            <EmptyState
              title="No active assignment"
              description="An administrator has not assigned an academic scope yet."
            />
          ) : (
            <ul className="record-list">
              {active.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <strong>{item.type === 'TEACHING' ? item.subject.name : 'Class Teacher'}</strong>
                  <span>
                    {assignmentLabel(item)} / {item.academicSession.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/teacher/classes">View academic scope</Link>
        </Panel>
        <Panel title="Quick actions">
          <div className="action-list">
            <Link className="ui-button ui-button--primary" to="/teacher/assignments">
              Create assignment
            </Link>
            <Link className="ui-button ui-button--secondary" to="/teacher/results">
              Enter results
            </Link>
            <Link className="ui-button ui-button--secondary" to="/teacher/announcements">
              Post announcement
            </Link>
          </div>
        </Panel>
      </div>
    </main>
  );
}

function AssignmentScopePage({ mode }: { mode: 'classes' | 'subjects' }) {
  const { assignments, profile } = useTeacherFoundation();
  if (profile.isPending || assignments.isPending) return <LoadingState rows={5} />;
  if (profile.isError || assignments.isError)
    return <ErrorState title="Academic scope unavailable" />;
  const active = assignments.data.filter((item) => item.status === 'ACTIVE');
  const rows = mode === 'subjects' ? active.filter((item) => item.type === 'TEACHING') : active;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="This scope is assigned by an administrator and enforced by the server."
        eyebrow="Academic authority"
        title={mode === 'classes' ? 'My classes' : 'My subjects'}
      />
      <DataTable
        caption="Active academic assignments"
        columns={[
          { header: 'Class', id: 'class', render: (row) => assignmentLabel(row) },
          {
            header: 'Subject / responsibility',
            id: 'subject',
            render: (row) => (row.type === 'TEACHING' ? row.subject.name : 'Class Teacher'),
          },
          { header: 'Session', id: 'session', render: (row) => row.academicSession.label },
          {
            header: 'Status',
            id: 'status',
            render: (row) => <StatusBadge tone="success">{row.status}</StatusBadge>,
          },
        ]}
        getRowKey={(row) => row.id}
        rows={rows}
      />
    </main>
  );
}

export function TeacherClassesPage() {
  return <AssignmentScopePage mode="classes" />;
}
export function TeacherSubjectsPage() {
  return <AssignmentScopePage mode="subjects" />;
}

export function TeacherStudentsPage() {
  const auth = useAuthSession();
  const roster = useQuery({
    queryFn: () => teacherApi.roster(auth.apiClient),
    queryKey: teacherQueryKeys.roster,
  });
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Students within your active class or subject assignments."
        eyebrow="Authorized roster"
        title="Students"
      />
      {roster.isError ? (
        <ErrorState onRetry={() => void roster.refetch()} title="Student roster unavailable" />
      ) : null}
      <DataTable<EnrollmentDto>
        caption="Authorized student roster"
        loading={roster.isPending}
        columns={[
          {
            header: 'Student',
            id: 'student',
            render: (row) => (
              <>
                <strong>{row.student.name}</strong>
                <small className="table-secondary">{row.student.studentId}</small>
              </>
            ),
          },
          {
            header: 'Class',
            id: 'class',
            render: (row) =>
              `${row.classLevel.name}${row.track === undefined ? '' : ` / ${row.track.name}`}`,
          },
          { header: 'Session', id: 'session', render: (row) => row.academicSession.label },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {row.status}
              </StatusBadge>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        rows={roster.data ?? []}
      />
    </main>
  );
}

export function TeacherProfilePage() {
  const { profile } = useTeacherFoundation();
  if (profile.isPending) return <LoadingState rows={4} />;
  if (profile.isError)
    return (
      <ErrorState onRetry={() => void profile.refetch()} title="Teacher profile unavailable" />
    );
  const { teacher, registration } = profile.data;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Your school-controlled staff profile and approval status."
        eyebrow="Staff profile"
        title={`${teacher.firstName} ${teacher.lastName}`}
      />
      <div className="content-grid content-grid--two">
        <Panel title="Profile">
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge tone={teacher.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {teacher.status}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Staff ID</dt>
              <dd>{teacher.staffId ?? 'Not assigned'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{teacher.email ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{teacher.phone ?? 'Not provided'}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Registration details">
          <dl className="detail-list">
            <div>
              <dt>Registration</dt>
              <dd>{registration.status}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{registration.data.address ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Qualifications</dt>
              <dd>{registration.data.qualifications ?? 'Not provided'}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </main>
  );
}

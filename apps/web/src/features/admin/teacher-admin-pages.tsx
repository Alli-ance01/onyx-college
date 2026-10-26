import type { TeacherDto, TeacherInvitationDto, TeacherRegistrationDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { resolveErrorMessage } from '../../shared/error-messages.js';
import { formText } from '../../shared/forms/form-data.js';
import {
  Button,
  DataTable,
  FormField,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import { adminApi, adminQueryKeys } from './admin-api.js';

function errorMessage(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return resolveErrorMessage(error, {
    action: 'complete teacher administration',
    entity: 'teacher',
  });
}

function useTeachers() {
  const auth = useAuthSession();
  const query = useQuery({
    queryFn: () => adminApi.teachers(auth.apiClient),
    queryKey: [...adminQueryKeys.teachers, 'directory'],
  });
  return { auth, query };
}

export function AdminTeachersPage() {
  const { auth, query } = useTeachers();
  const cache = useQueryClient();
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.createTeacher>[1]) =>
      adminApi.createTeacher(auth.apiClient, input),
    onSuccess: async () => cache.invalidateQueries({ queryKey: adminQueryKeys.teachers }),
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = formText(form, 'email');
    const phone = formText(form, 'phone');
    create.mutate({
      firstName: formText(form, 'firstName'),
      lastName: formText(form, 'lastName'),
      username: formText(form, 'username'),
      ...(email === '' ? {} : { email }),
      ...(phone === '' ? {} : { phone }),
    });
    event.currentTarget.reset();
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Approved, pending, suspended, and archived teaching staff."
        eyebrow="Staff administration"
        title="Teachers"
      />
      <Panel
        description="A one-time temporary password is shown only after creation and must be delivered securely."
        title="Create staff account"
      >
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="staff-first" label="First name">
              <input name="firstName" required />
            </FormField>
            <FormField controlId="staff-last" label="Surname">
              <input name="lastName" required />
            </FormField>
            <FormField controlId="staff-username" label="Username">
              <input name="username" required />
            </FormField>
            <FormField controlId="staff-email" label="Email" optional>
              <input name="email" type="email" />
            </FormField>
            <FormField controlId="staff-phone" label="Phone" optional>
              <input name="phone" />
            </FormField>
          </div>
          {errorMessage(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{errorMessage(create.error)}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Create staff account
          </Button>
        </form>
        {create.data === undefined ? null : (
          <div className="credential-reveal" role="status">
            <strong>Copy this temporary credential now</strong>
            <code>
              {create.data.username} / {create.data.temporaryPassword}
            </code>
            <p>It will not be displayed again. The teacher must change it at first login.</p>
          </div>
        )}
      </Panel>
      <DataTable<TeacherDto>
        caption="Teacher directory"
        columns={[
          {
            header: 'Teacher',
            id: 'teacher',
            render: (row) => (
              <>
                <strong>
                  {row.firstName} {row.lastName}
                </strong>
                <small className="table-secondary">
                  {row.email ?? row.phone ?? 'No contact recorded'}
                </small>
              </>
            ),
          },
          { header: 'Staff ID', id: 'staffId', render: (row) => row.staffId ?? 'Pending' },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge
                tone={
                  row.status === 'ACTIVE'
                    ? 'success'
                    : row.status === 'PENDING_APPROVAL'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {row.status}
              </StatusBadge>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        error={query.isError}
        onRetry={() => void query.refetch()}
        loading={query.isPending}
        rows={query.data ?? []}
      />
    </main>
  );
}

export function AdminTeacherInvitationsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const invitations = useQuery({
    queryFn: () => adminApi.teacherInvitations(auth.apiClient),
    queryKey: [...adminQueryKeys.teachers, 'invitations'],
  });
  const invite = useMutation({
    mutationFn: (input: { email: string; invitedName: string }) =>
      adminApi.inviteTeacher(auth.apiClient, input),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: [...adminQueryKeys.teachers, 'invitations'] }),
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    invite.mutate({
      email: formText(form, 'email'),
      invitedName: formText(form, 'invitedName'),
    });
    event.currentTarget.reset();
  }
  const setupLink =
    invite.data === undefined
      ? undefined
      : `${window.location.origin}/teacher-setup?token=${encodeURIComponent(invite.data.setupToken)}`;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Issue private, time-limited staff setup links. There is no public teacher signup."
        eyebrow="Staff onboarding"
        title="Teacher invitations"
      />
      <Panel title="Create invitation">
        <form className="inline-form" onSubmit={submit}>
          <FormField controlId="invite-name" label="Teacher name">
            <input name="invitedName" required />
          </FormField>
          <FormField controlId="invite-email" label="Email">
            <input name="email" required type="email" />
          </FormField>
          <Button loading={invite.isPending} type="submit">
            Create invitation
          </Button>
        </form>
        {errorMessage(invite.error) === undefined ? null : (
          <p className="form-alert form-alert--error">{errorMessage(invite.error)}</p>
        )}
        {setupLink === undefined ? null : (
          <div className="credential-reveal">
            <strong>Copy this private link now</strong>
            <code>{setupLink}</code>
            <Button
              onClick={() => void navigator.clipboard.writeText(setupLink)}
              variant="secondary"
            >
              Copy link
            </Button>
          </div>
        )}
      </Panel>
      <DataTable<TeacherInvitationDto>
        caption="Teacher invitations"
        columns={[
          {
            header: 'Recipient',
            id: 'recipient',
            render: (row) => (
              <>
                <strong>{row.invitedName}</strong>
                <small className="table-secondary">{row.email}</small>
              </>
            ),
          },
          {
            header: 'Expires',
            id: 'expires',
            render: (row) => new Date(row.expiresAt).toLocaleDateString('en-NG'),
          },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge
                tone={
                  row.status === 'PENDING'
                    ? 'warning'
                    : row.status === 'ACCEPTED'
                      ? 'success'
                      : 'neutral'
                }
              >
                {row.status}
              </StatusBadge>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        error={invitations.isError}
        onRetry={() => void invitations.refetch()}
        loading={invitations.isPending}
        rows={invitations.data ?? []}
      />
    </main>
  );
}

export function AdminTeacherApprovalsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const registrations = useQuery({
    queryFn: () => adminApi.teacherRegistrations(auth.apiClient),
    queryKey: [...adminQueryKeys.teachers, 'registrations'],
  });
  const [selected, setSelected] = useState<TeacherRegistrationDto>();
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      selected === undefined
        ? Promise.reject(new Error('No registration selected.'))
        : adminApi.decideTeacher(auth.apiClient, selected.id, action, note),
    onSuccess: async () => {
      setSelected(undefined);
      setNote('');
      await cache.invalidateQueries({ queryKey: adminQueryKeys.teachers });
    },
  });
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Review staff profiles before activating Teacher Portal eligibility."
        eyebrow="Approval queue"
        title="Pending teachers"
      />
      {selected === undefined ? null : (
        <Panel
          title={`${selected.data.firstName} ${selected.data.lastName}`}
          description={`Registration status: ${selected.status}`}
        >
          <dl className="detail-list">
            <div>
              <dt>Phone</dt>
              <dd>{selected.data.phone ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{selected.data.address ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Qualifications</dt>
              <dd>{selected.data.qualifications ?? 'Not provided'}</dd>
            </div>
          </dl>
          <FormField controlId="teacher-decision-note" label="Decision note">
            <textarea
              minLength={5}
              onChange={(event) => {
                setNote(event.target.value);
              }}
              rows={3}
              value={note}
            />
          </FormField>
          {errorMessage(decide.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{errorMessage(decide.error)}</p>
          )}
          <div className="form-actions">
            <Button
              disabled={note.trim().length < 5}
              loading={decide.isPending}
              onClick={() => {
                decide.mutate('approve');
              }}
            >
              Approve
            </Button>
            <Button
              disabled={note.trim().length < 5}
              loading={decide.isPending}
              onClick={() => {
                decide.mutate('reject');
              }}
              variant="danger"
            >
              Reject
            </Button>
            <Button
              onClick={() => {
                setSelected(undefined);
              }}
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </Panel>
      )}
      <DataTable<TeacherRegistrationDto>
        caption="Teacher registration queue"
        columns={[
          {
            header: 'Teacher',
            id: 'teacher',
            render: (row) => (
              <strong>
                {row.data.firstName} {row.data.lastName}
              </strong>
            ),
          },
          { header: 'Phone', id: 'phone', render: (row) => row.data.phone ?? 'Not provided' },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge
                tone={
                  row.status === 'SUBMITTED' || row.status === 'UNDER_REVIEW'
                    ? 'warning'
                    : 'neutral'
                }
              >
                {row.status}
              </StatusBadge>
            ),
          },
          {
            header: '',
            id: 'action',
            align: 'end',
            render: (row) =>
              ['SUBMITTED', 'UNDER_REVIEW'].includes(row.status) ? (
                <Button
                  onClick={() => {
                    setSelected(row);
                  }}
                  variant="secondary"
                >
                  Review
                </Button>
              ) : null,
          },
        ]}
        getRowKey={(row) => row.id}
        error={registrations.isError}
        onRetry={() => void registrations.refetch()}
        loading={registrations.isPending}
        rows={registrations.data ?? []}
      />
    </main>
  );
}

export function AdminTeachingAssignmentsPage() {
  const { auth, query: teachers } = useTeachers();
  const cache = useQueryClient();
  const sessions = useQuery({
    queryFn: () => adminApi.sessions(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'sessions'],
  });
  const classes = useQuery({
    queryFn: () => adminApi.classLevels(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'classes'],
  });
  const tracks = useQuery({
    queryFn: () => adminApi.tracks(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'tracks'],
  });
  const subjects = useQuery({
    queryFn: () => adminApi.subjects(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'subjects'],
  });
  const assignments = useQuery({
    queryFn: () => adminApi.teachingAssignments(auth.apiClient),
    queryKey: [...adminQueryKeys.teachers, 'assignments'],
  });
  const [type, setType] = useState<'CLASS_TEACHER' | 'TEACHING'>('TEACHING');
  const [classId, setClassId] = useState('');
  const selectedClass = classes.data?.find((item) => item.id === classId);
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.assignTeacher>[1]) =>
      adminApi.assignTeacher(auth.apiClient, input),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: [...adminQueryKeys.teachers, 'assignments'] }),
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subjectId = formText(form, 'subjectId');
    const trackId = formText(form, 'trackId');
    create.mutate({
      academicSessionId: formText(form, 'academicSessionId'),
      classLevelId: classId,
      teacherId: formText(form, 'teacherId'),
      type,
      ...(subjectId === '' ? {} : { subjectId }),
      ...(trackId === '' ? {} : { trackId }),
    });
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Choose which classes and subjects each teacher is responsible for this session."
        eyebrow="Scoped authorization"
        title="Teaching assignments"
      />
      <Panel title="Create assignment">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="ta-type" label="Assignment type">
              <select
                onChange={(event) => {
                  setType(event.target.value as typeof type);
                }}
                value={type}
              >
                <option value="TEACHING">Subject teacher</option>
                <option value="CLASS_TEACHER">Class teacher</option>
              </select>
            </FormField>
            <FormField controlId="ta-teacher" label="Teacher">
              <select defaultValue="" name="teacherId" required>
                <option disabled value="">
                  Select active teacher
                </option>
                {teachers.data
                  ?.filter((item) => item.status === 'ACTIVE')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.firstName} {item.lastName}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField controlId="ta-session" label="Session">
              <select defaultValue="" name="academicSessionId" required>
                <option disabled value="">
                  Select session
                </option>
                {sessions.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField controlId="ta-class" label="Class">
              <select
                onChange={(event) => {
                  setClassId(event.target.value);
                }}
                required
                value={classId}
              >
                <option disabled value="">
                  Select class
                </option>
                {classes.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormField>
            {selectedClass?.stage === 'SENIOR' ? (
              <FormField controlId="ta-track" label="Track">
                <select defaultValue="" name="trackId" required>
                  <option disabled value="">
                    Select track
                  </option>
                  {tracks.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {type === 'TEACHING' ? (
              <FormField controlId="ta-subject" label="Subject">
                <select defaultValue="" name="subjectId" required>
                  <option disabled value="">
                    Select subject
                  </option>
                  {subjects.data
                    ?.filter((item) => item.status === 'ACTIVE')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </FormField>
            ) : null}
          </div>
          {errorMessage(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{errorMessage(create.error)}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Assign teacher
          </Button>
        </form>
      </Panel>
      <DataTable
        caption="Academic assignments"
        columns={[
          { header: 'Teacher', id: 'teacher', render: (row) => row.teacher.name },
          {
            header: 'Responsibility',
            id: 'responsibility',
            render: (row) => (row.type === 'TEACHING' ? row.subject.name : 'Class Teacher'),
          },
          {
            header: 'Scope',
            id: 'scope',
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
        error={assignments.isError}
        onRetry={() => void assignments.refetch()}
        loading={assignments.isPending}
        rows={assignments.data ?? []}
      />
    </main>
  );
}

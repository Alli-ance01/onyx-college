import { IntakeQueue } from './intake-queue.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { resolveErrorMessage } from '../../shared/error-messages.js';
import { formText } from '../../shared/forms/form-data.js';
import {
  Button,
  ErrorState,
  DataTable,
  FormField,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import {
  adminApi,
  adminQueryKeys,
  type AuditLogSummary,
  type PermissionSummary,
  type RoleSummary,
  type UserAccessSummary,
} from './admin-api.js';

function errorMessage(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return resolveErrorMessage(error, {
    action: 'complete administrative action',
    entity: 'system record',
  });
}

export function AdminDashboardPage() {
  const auth = useAuthSession();
  const permissions = new Set(auth.principal?.permissions ?? []);
  const canManageSessions = permissions.has('sessions.manage');
  const canApproveStudents = permissions.has('students.approve_registration');
  const canReadTeachers = permissions.has('teachers.read');
  const canApproveTeachers = permissions.has('teachers.approve');
  const canReviewResults = permissions.has('results.review');
  const canApproveResults = permissions.has('results.approve');
  const canPublishResults = permissions.has('results.publish');
  const canReadAllResults = permissions.has('results.read_all');
  const canSeeResults =
    canReviewResults || canApproveResults || canPublishResults || canReadAllResults;
  const sessions = useQuery({
    enabled: canManageSessions,
    queryFn: () => adminApi.sessions(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'dashboard'],
  });
  const teacherRegistrations = useQuery({
    enabled: canApproveTeachers,
    queryFn: () => adminApi.teacherRegistrations(auth.apiClient),
    queryKey: [...adminQueryKeys.teachers, 'registrations', 'dashboard'],
  });
  const batches = useQuery({
    enabled: canSeeResults,
    queryFn: () => adminApi.resultBatches(auth.apiClient),
    queryKey: [...adminQueryKeys.resultBatches, 'dashboard'],
  });
  const activeSession = sessions.data?.find((item) => item.status === 'ACTIVE');
  const activeTerm = activeSession?.terms.find((item) => item.status === 'ACTIVE');
  const pendingTeacherApprovals = teacherRegistrations.data?.filter((item) =>
    ['SUBMITTED', 'UNDER_REVIEW'].includes(item.status),
  ).length;
  const resultAttention = batches.data?.filter((item) => {
    if (canReadAllResults) return ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(item.status);
    if (item.status === 'SUBMITTED') return canReviewResults;
    if (item.status === 'UNDER_REVIEW') return canReviewResults || canApproveResults;
    return item.status === 'APPROVED' && canPublishResults;
  }).length;
  const resultsHref = canReviewResults
    ? '/admin/results/review'
    : canApproveResults
      ? '/admin/results/approval'
      : canPublishResults
        ? '/admin/results/publishing'
        : '/admin/results';
  const resultsActionLabel = canReviewResults
    ? 'Review results'
    : canApproveResults
      ? 'Approve results'
      : canPublishResults
        ? 'Publish results'
        : 'Open result overview';
  const primaryAction = canApproveStudents
    ? { label: 'Review applications', to: '/admin/students/registrations' }
    : canApproveTeachers
      ? { label: 'Review teacher approvals', to: '/admin/teachers/approvals' }
      : canSeeResults
        ? { label: resultsActionLabel, to: resultsHref }
        : canManageSessions
          ? { label: 'Manage academic sessions', to: '/admin/academics/sessions' }
          : undefined;
  const hasReviewQueues = canApproveStudents || canApproveTeachers || canSeeResults;
  const hasQuickAccess =
    permissions.has('students.read') ||
    canReadTeachers ||
    canManageSessions ||
    permissions.has('classes.manage') ||
    permissions.has('subjects.manage') ||
    permissions.has('subject_offerings.manage') ||
    permissions.has('settings.manage');
  const overviewHasError = sessions.isError || teacherRegistrations.isError || batches.isError;

  return (
    <main className="portal-content product-page admin-dashboard">
      <PageHeader
        actions={
          primaryAction === undefined ? undefined : (
            <Link className="admin-dashboard__primary-action" to={primaryAction.to}>
              {primaryAction.label} <span aria-hidden="true">→</span>
            </Link>
          )
        }
        description="Your daily workspace for approvals, academic setup, and school operations."
        eyebrow="Administration"
        title="School overview"
      />
      {overviewHasError ? (
        <ErrorState
          title="Some dashboard information is unavailable"
          onRetry={() => {
            if (sessions.isError) void sessions.refetch();
            if (teacherRegistrations.isError) void teacherRegistrations.refetch();
            if (batches.isError) void batches.refetch();
          }}
        />
      ) : null}
      <section
        className="admin-dashboard__top-grid"
        aria-label="Academic context and daily priorities"
      >
        <Panel
          className="admin-dashboard__context-panel"
          description={
            canManageSessions
              ? 'The active session and term used across school operations.'
              : 'The academic office manages the current session and term.'
          }
          title="Academic context"
        >
          {canManageSessions ? (
            <>
              <dl className="admin-dashboard__context-values" aria-busy={sessions.isPending}>
                <div>
                  <dt>Current session</dt>
                  <dd>
                    {sessions.isPending
                      ? 'Loading…'
                      : sessions.isError
                        ? 'Unavailable'
                        : (activeSession?.label ?? 'No active session')}
                  </dd>
                </div>
                <div>
                  <dt>Current term</dt>
                  <dd>
                    {sessions.isPending
                      ? 'Loading…'
                      : sessions.isError
                        ? 'Unavailable'
                        : (activeTerm?.name ?? 'No active term')}
                  </dd>
                </div>
              </dl>
              <Link className="admin-dashboard__inline-link" to="/admin/academics/sessions">
                Manage academic sessions <span aria-hidden="true">→</span>
              </Link>
            </>
          ) : (
            <p className="admin-dashboard__context-note">
              You can continue with the queues and records available to your account.
            </p>
          )}
        </Panel>
        <Panel
          className="admin-dashboard__orientation-panel"
          description="Start with decisions that are waiting, then use the links below to reach the records you manage."
          title="A clear place to start"
        >
          <p>
            {hasReviewQueues
              ? 'Queue counts update from the records your permissions allow you to review.'
              : 'No review queues are assigned to this account. Your available workspace links are below.'}
          </p>
        </Panel>
      </section>

      <section className="admin-dashboard__section" aria-labelledby="admin-attention-title">
        <div className="admin-dashboard__section-heading">
          <div>
            <p className="eyebrow">Daily focus</p>
            <h2 id="admin-attention-title">Needs your attention</h2>
          </div>
          <p>Live items awaiting a decision in the queues available to you.</p>
        </div>
        {hasReviewQueues ? (
          <div
            className={
              canApproveStudents && (canApproveTeachers || canSeeResults)
                ? 'admin-dashboard__attention-grid'
                : 'admin-dashboard__attention-grid admin-dashboard__attention-grid--single'
            }
          >
            {canApproveStudents ? <IntakeQueue /> : null}
            {canApproveTeachers || canSeeResults ? (
              <div className="admin-dashboard__review-stack">
                {canApproveTeachers ? (
                  <Link className="admin-dashboard__review-card" to="/admin/teachers/approvals">
                    <span className="admin-dashboard__review-label">Teacher approvals</span>
                    <strong aria-live="polite">
                      {teacherRegistrations.isPending
                        ? 'Loading…'
                        : teacherRegistrations.isError
                          ? 'Unavailable'
                          : (pendingTeacherApprovals ?? 0)}
                    </strong>
                    <span className="admin-dashboard__review-description">
                      {teacherRegistrations.isPending
                        ? 'Checking the teacher-registration queue.'
                        : teacherRegistrations.isError
                          ? 'The approval queue could not be loaded.'
                          : pendingTeacherApprovals === 0
                            ? 'No teacher registrations are waiting for a decision.'
                            : `${String(pendingTeacherApprovals ?? 0)} teacher registration${pendingTeacherApprovals === 1 ? '' : 's'} waiting for a decision.`}
                    </span>
                    <span className="admin-dashboard__review-link">
                      Open teacher approvals <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                ) : null}
                {canSeeResults ? (
                  <Link className="admin-dashboard__review-card" to={resultsHref}>
                    <span className="admin-dashboard__review-label">Results needing action</span>
                    <strong aria-live="polite">
                      {batches.isPending
                        ? 'Loading…'
                        : batches.isError
                          ? 'Unavailable'
                          : (resultAttention ?? 0)}
                    </strong>
                    <span className="admin-dashboard__review-description">
                      {batches.isPending
                        ? 'Checking the result workflow.'
                        : batches.isError
                          ? 'The result queue could not be loaded.'
                          : resultAttention === 0
                            ? 'No result batches are waiting in your review workflow.'
                            : `${String(resultAttention ?? 0)} result batch${resultAttention === 1 ? '' : 'es'} in a status you can act on.`}
                    </span>
                    <span className="admin-dashboard__review-link">
                      {resultsActionLabel} <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="admin-dashboard__quiet-state" role="status">
            No review queues are assigned to this account. Use the links below to open the areas
            available to you.
          </p>
        )}
      </section>

      <section className="admin-dashboard__section" aria-labelledby="admin-quick-access-title">
        <div className="admin-dashboard__section-heading">
          <div>
            <p className="eyebrow">Shortcuts</p>
            <h2 id="admin-quick-access-title">Explore your workspace</h2>
          </div>
          <p>Go directly to records and settings you are allowed to manage.</p>
        </div>
        {hasQuickAccess ? (
          <div className="admin-dashboard__quick-links">
            {permissions.has('students.read') ? (
              <Link className="admin-dashboard__quick-link" to="/admin/students">
                <strong>Student directory</strong>
                <span>Find student profiles and academic history.</span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {canReadTeachers ? (
              <Link className="admin-dashboard__quick-link" to="/admin/teachers">
                <strong>Teacher directory</strong>
                <span>Open staff profiles and assignment records.</span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {canManageSessions ? (
              <Link className="admin-dashboard__quick-link" to="/admin/academics/sessions">
                <strong>Academic sessions</strong>
                <span>Review sessions, terms, and their active status.</span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {permissions.has('classes.manage') ? (
              <Link className="admin-dashboard__quick-link" to="/admin/academics/classes">
                <strong>Class levels</strong>
                <span>Manage the school’s class structure.</span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {permissions.has('subjects.manage') ? (
              <Link className="admin-dashboard__quick-link" to="/admin/academics/subjects">
                <strong>Subjects</strong>
                <span>Maintain the subject catalogue.</span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {permissions.has('subject_offerings.manage') ? (
              <Link className="admin-dashboard__quick-link" to="/admin/academics/subject-offerings">
                <strong>Subject offerings</strong>
                <span>Set subjects available for each class and session.</span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {permissions.has('settings.manage') ? (
              <Link className="admin-dashboard__quick-link" to="/admin/settings">
                <strong>School settings</strong>
                <span>Update school identity and operational preferences.</span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="admin-dashboard__quiet-state">
            No quick links are available to this account. Use the navigation menu to continue.
          </p>
        )}
      </section>
    </main>
  );
}

export function AdminAdministratorsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const users = useQuery({
    queryFn: () => adminApi.users(auth.apiClient),
    queryKey: adminQueryKeys.users,
  });
  const roles = useQuery({
    queryFn: () => adminApi.roles(auth.apiClient),
    queryKey: adminQueryKeys.roles,
  });
  const [selected, setSelected] = useState<UserAccessSummary>();
  const [reason, setReason] = useState('');
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.createAdministrator>[1]) =>
      adminApi.createAdministrator(auth.apiClient, input),
    onSuccess: async () => cache.invalidateQueries({ queryKey: adminQueryKeys.users }),
  });
  const state = useMutation({
    mutationFn: (action: 'reactivate' | 'suspend') =>
      selected === undefined
        ? Promise.reject(new Error('No user selected.'))
        : adminApi.setUserState(auth.apiClient, selected.id, action, {
            expectedVersion: selected.version,
            reason,
          }),
    onSuccess: async () => {
      setSelected(undefined);
      setReason('');
      await cache.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = formText(form, 'email');
    const phone = formText(form, 'phone');
    create.mutate({
      roleCodes: form.getAll('roleCodes').map(String),
      username: formText(form, 'username'),
      ...(email === '' ? {} : { email }),
      ...(phone === '' ? {} : { phone }),
    });
    event.currentTarget.reset();
  }
  const administrativeRoles =
    roles.data?.filter((item) => ['SCHOOL_ADMIN', 'PRINCIPAL'].includes(item.code)) ?? [];
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Create and manage administrative accounts while preserving protected SUPER_ADMIN invariants."
        eyebrow="Users and access"
        title="Administrators"
      />
      <Panel title="Create administrator">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="admin-username" label="Username">
              <input name="username" required />
            </FormField>
            <FormField controlId="admin-email" label="Email" optional>
              <input name="email" type="email" />
            </FormField>
            <FormField controlId="admin-phone" label="Phone" optional>
              <input name="phone" />
            </FormField>
          </div>
          <fieldset className="checkbox-group">
            <legend>Administrative role</legend>
            {administrativeRoles.map((role) => (
              <label key={role.id}>
                <input name="roleCodes" type="checkbox" value={role.code} /> {role.displayName}
              </label>
            ))}
          </fieldset>
          {errorMessage(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{errorMessage(create.error)}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Create administrator
          </Button>
        </form>
        {create.data === undefined ? null : (
          <div className="credential-reveal">
            <strong>Copy this temporary credential now</strong>
            <code>
              {create.data.user.username} / {create.data.temporaryPassword}
            </code>
            <p>The user must change it at first login.</p>
          </div>
        )}
      </Panel>
      {selected === undefined ? null : (
        <Panel title={`Account action: ${selected.username}`}>
          <FormField controlId="account-action-reason" label="Reason">
            <textarea
              minLength={5}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              rows={2}
              value={reason}
            />
          </FormField>
          <div className="form-actions">
            {selected.accountStatus === 'ACTIVE' ? (
              <Button
                disabled={reason.trim().length < 5}
                loading={state.isPending}
                onClick={() => {
                  state.mutate('suspend');
                }}
                variant="danger"
              >
                Suspend account
              </Button>
            ) : selected.accountStatus === 'SUSPENDED' ? (
              <Button
                disabled={reason.trim().length < 5}
                loading={state.isPending}
                onClick={() => {
                  state.mutate('reactivate');
                }}
              >
                Reactivate account
              </Button>
            ) : null}
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
      <DataTable<UserAccessSummary>
        caption="Administrator accounts"
        columns={[
          {
            header: 'Account',
            id: 'account',
            render: (row) => (
              <>
                <strong>{row.username}</strong>
                <small className="table-secondary">
                  {row.email ?? row.phone ?? 'No contact recorded'}
                </small>
              </>
            ),
          },
          {
            header: 'Roles',
            id: 'roles',
            render: (row) => row.roles.map((role) => role.displayName).join(', '),
          },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge
                tone={
                  row.accountStatus === 'ACTIVE'
                    ? 'success'
                    : row.accountStatus === 'SUSPENDED'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {row.accountStatus}
              </StatusBadge>
            ),
          },
          {
            header: '',
            id: 'action',
            align: 'end',
            render: (row) => (
              <Button
                onClick={() => {
                  setSelected(row);
                }}
                variant="secondary"
              >
                Manage
              </Button>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        error={users.isError}
        onRetry={() => void users.refetch()}
        loading={users.isPending}
        rows={users.data?.items ?? []}
      />
    </main>
  );
}

export function AdminRolesPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const roles = useQuery({
    queryFn: () => adminApi.roles(auth.apiClient),
    queryKey: adminQueryKeys.roles,
  });
  const permissions = useQuery({
    queryFn: () => adminApi.permissions(auth.apiClient),
    queryKey: [...adminQueryKeys.roles, 'permissions'],
  });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.createRole>[1]) =>
      adminApi.createRole(auth.apiClient, input),
    onSuccess: async () => cache.invalidateQueries({ queryKey: adminQueryKeys.roles }),
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      code: formText(form, 'code'),
      description: formText(form, 'description'),
      displayName: formText(form, 'displayName'),
      permissionCodes: form.getAll('permissionCodes').map(String),
    });
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Manage the permissions included in each staff role."
        eyebrow="Users and access"
        title="Roles"
      />
      <Panel title="Create custom role">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="role-code" label="Code">
              <input name="code" required />
            </FormField>
            <FormField controlId="role-name" label="Display name">
              <input name="displayName" required />
            </FormField>
          </div>
          <FormField controlId="role-description" label="Description">
            <textarea minLength={5} name="description" required rows={2} />
          </FormField>
          <fieldset className="permission-picker">
            <legend>Permissions</legend>
            {permissions.data?.map((permission) => (
              <label key={permission.id}>
                <input name="permissionCodes" type="checkbox" value={permission.code} />
                <span>
                  <strong>{permission.code}</strong>
                  <small>{permission.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {errorMessage(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{errorMessage(create.error)}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Create role
          </Button>
        </form>
      </Panel>
      <DataTable<RoleSummary>
        caption="Roles"
        columns={[
          {
            header: 'Role',
            id: 'role',
            render: (row) => (
              <>
                <strong>{row.displayName}</strong>
                <small className="table-secondary">{row.code}</small>
              </>
            ),
          },
          { header: 'Permissions', id: 'permissions', render: (row) => row.permissions.length },
          {
            header: 'Protection',
            id: 'protection',
            render: (row) =>
              row.protected ? <StatusBadge tone="warning">Protected</StatusBadge> : 'Custom',
          },
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
        error={roles.isError}
        onRetry={() => void roles.refetch()}
        loading={roles.isPending}
        rows={roles.data ?? []}
      />
    </main>
  );
}

export function AdminPermissionsPage() {
  const auth = useAuthSession();
  const query = useQuery({
    queryFn: () => adminApi.permissions(auth.apiClient),
    queryKey: [...adminQueryKeys.roles, 'permissions'],
  });
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Canonical capabilities initialized by the access catalogue."
        eyebrow="Users and access"
        title="Permissions"
      />
      <DataTable<PermissionSummary>
        caption="Permission catalogue"
        columns={[
          {
            header: 'Permission',
            id: 'permission',
            render: (row) => (
              <>
                <strong>{row.code}</strong>
                <small className="table-secondary">{row.description}</small>
              </>
            ),
          },
          { header: 'Domain', id: 'domain', render: (row) => row.domain },
          {
            header: 'Sensitivity',
            id: 'sensitivity',
            render: (row) => (
              <StatusBadge
                tone={
                  row.sensitivity === 'PRIVILEGED'
                    ? 'danger'
                    : row.sensitivity === 'SENSITIVE'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {row.sensitivity}
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

export function AdminAuditPage() {
  const auth = useAuthSession();
  const query = useQuery({
    queryFn: () => adminApi.audit(auth.apiClient),
    queryKey: adminQueryKeys.audit,
  });
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Append-only security, administrative, and academic mutation history."
        eyebrow="Accountability"
        title="Audit logs"
      />
      <DataTable<AuditLogSummary>
        caption="Audit events"
        columns={[
          {
            header: 'Action',
            id: 'action',
            render: (row) => (
              <>
                <strong>{row.action}</strong>
                <small className="table-secondary">
                  {row.targetType} / {row.targetId}
                </small>
              </>
            ),
          },
          { header: 'Actor', id: 'actor', render: (row) => row.actorUserId ?? row.actorType },
          {
            header: 'Outcome',
            id: 'outcome',
            render: (row) => (
              <StatusBadge
                tone={
                  row.outcome === 'SUCCESS'
                    ? 'success'
                    : row.outcome === 'DENIED'
                      ? 'warning'
                      : 'danger'
                }
              >
                {row.outcome}
              </StatusBadge>
            ),
          },
          {
            header: 'When',
            id: 'when',
            render: (row) => new Date(row.occurredAt).toLocaleString('en-NG'),
          },
          { header: 'Reason', id: 'reason', render: (row) => row.reason ?? '—' },
        ]}
        getRowKey={(row) => row.id}
        error={query.isError}
        onRetry={() => void query.refetch()}
        loading={query.isPending}
        rows={query.data?.items ?? []}
      />
    </main>
  );
}

export function AdminSchoolSettingsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryFn: () => adminApi.settings(auth.apiClient),
    queryKey: adminQueryKeys.settings,
  });
  const update = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.updateIdentity>[1]) =>
      adminApi.updateIdentity(auth.apiClient, input),
    onSuccess: async () => cache.invalidateQueries({ queryKey: adminQueryKeys.settings }),
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contactEmail = formText(form, 'contactEmail');
    const contactPhone = formText(form, 'contactPhone');
    const motto = formText(form, 'motto');
    const websiteUrl = formText(form, 'websiteUrl');
    update.mutate({
      expectedVersion: query.data?.version ?? 0,
      identity: {
        address: formText(form, 'address'),
        displayName: formText(form, 'displayName'),
        ...(contactEmail === '' ? {} : { contactEmail }),
        ...(contactPhone === '' ? {} : { contactPhone }),
        ...(motto === '' ? {} : { motto }),
        ...(websiteUrl === '' ? {} : { websiteUrl }),
      },
    });
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Authoritative school identity used by the portal and published report snapshots."
        eyebrow="Configuration"
        title="School settings"
      />
      <Panel title="School identity">
        <form className="form-stack" key={query.data?.version ?? 0} onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="school-name" label="School name">
              <input
                defaultValue={query.data?.schoolIdentity?.displayName ?? 'Onyx College'}
                name="displayName"
                required
              />
            </FormField>
            <FormField controlId="school-phone" label="Contact phone" optional>
              <input
                defaultValue={query.data?.schoolIdentity?.contactPhone ?? ''}
                name="contactPhone"
              />
            </FormField>
            <FormField controlId="school-email" label="Contact email" optional>
              <input
                defaultValue={query.data?.schoolIdentity?.contactEmail ?? ''}
                name="contactEmail"
                type="email"
              />
            </FormField>
            <FormField controlId="school-website" label="Website" optional>
              <input
                defaultValue={query.data?.schoolIdentity?.websiteUrl ?? ''}
                name="websiteUrl"
                type="url"
              />
            </FormField>
          </div>
          <FormField controlId="school-address" label="Address">
            <textarea
              defaultValue={query.data?.schoolIdentity?.address ?? ''}
              name="address"
              required
              rows={3}
            />
          </FormField>
          <FormField controlId="school-motto" label="Motto" optional>
            <input defaultValue={query.data?.schoolIdentity?.motto ?? ''} name="motto" />
          </FormField>
          {errorMessage(update.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{errorMessage(update.error)}</p>
          )}
          {update.isSuccess ? <p className="success-copy">School settings saved.</p> : null}
          <Button loading={update.isPending} type="submit">
            Save settings
          </Button>
        </form>
      </Panel>
    </main>
  );
}

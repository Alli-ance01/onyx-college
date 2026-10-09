import { IntakeQueue } from './intake-queue.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
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
  return error instanceof ApiClientError ? error.message : 'The operation could not be completed.';
}

export function AdminDashboardPage() {
  const auth = useAuthSession();
  const permissions = new Set(auth.principal?.permissions ?? []);
  const teachers = useQuery({
    enabled: permissions.has('teachers.read'),
    queryFn: () => adminApi.teachers(auth.apiClient),
    queryKey: [...adminQueryKeys.teachers, 'dashboard'],
  });
  const sessions = useQuery({
    enabled: permissions.has('sessions.manage'),
    queryFn: () => adminApi.sessions(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'dashboard'],
  });
  const batches = useQuery({
    enabled: permissions.has('results.read_all') || permissions.has('results.review'),
    queryFn: () => adminApi.resultBatches(auth.apiClient),
    queryKey: [...adminQueryKeys.resultBatches, 'dashboard'],
  });
  const activeSession = sessions.data?.find((item) => item.status === 'ACTIVE');
  const pendingTeachers =
    teachers.data?.filter((item) => item.status === 'PENDING_APPROVAL').length ?? '—';
  const resultAttention =
    batches.data?.filter((item) => ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(item.status))
      .length ?? '—';

  return (
    <main className="portal-content product-page admin-dashboard">
      <PageHeader
        description="A summary of the school areas that need attention today."
        eyebrow="Administration"
        title="School overview"
      />
      {teachers.isError || sessions.isError || batches.isError ? (
        <ErrorState
          title="Some overview information is unavailable"
          onRetry={() => {
            if (teachers.isError) void teachers.refetch();
            if (sessions.isError) void sessions.refetch();
            if (batches.isError) void batches.refetch();
          }}
        />
      ) : null}
      <section className="admin-context-bar" aria-label="Current academic context">
        <div>
          <span>Current academic session</span>
          <strong>
            {!permissions.has('sessions.manage')
              ? 'Managed by the academic office'
              : sessions.isPending
                ? 'Loading…'
                : sessions.isError
                  ? 'Unavailable'
                  : (activeSession?.label ?? 'No active session')}
          </strong>
        </div>
        <div>
          <span>Current term</span>
          <strong>
            {!permissions.has('sessions.manage')
              ? '—'
              : sessions.isPending
                ? 'Loading…'
                : sessions.isError
                  ? 'Unavailable'
                  : (activeSession?.terms.find((item) => item.status === 'ACTIVE')?.name ??
                    'No active term')}
          </strong>
        </div>
        <div>
          <span>Workspace</span>
          <strong>School administration</strong>
        </div>
      </section>
      <section aria-labelledby="admin-overview-title">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">At a glance</p>
            <h2 id="admin-overview-title">Today at Onyx</h2>
          </div>
        </div>
        <div className="metric-grid admin-metric-grid">
          {permissions.has('teachers.read') ? (
            <Link className="admin-metric-card" to="/admin/teachers">
              <span>Teachers</span>
              <strong>{teachers.data?.length ?? '—'}</strong>
              <small>View staff directory →</small>
            </Link>
          ) : null}
          {permissions.has('teachers.approve') && permissions.has('teachers.read') ? (
            <Link
              className="admin-metric-card admin-metric-card--attention"
              to="/admin/teachers/approvals"
            >
              <span>Pending teacher approvals</span>
              <strong>{pendingTeachers}</strong>
              <small>Review requests →</small>
            </Link>
          ) : null}
          {permissions.has('results.read_all') || permissions.has('results.review') ? (
            <Link className="admin-metric-card" to="/admin/results">
              <span>Results needing action</span>
              <strong>{resultAttention}</strong>
              <small>Open result overview →</small>
            </Link>
          ) : null}
        </div>
      </section>
      <IntakeQueue />
      <section className="admin-dashboard-grid" aria-label="Administrative work queues">
        <Panel
          className="admin-queue-panel"
          description="Open the next queue that needs a decision or review."
          title="Work queues"
        >
          <div className="admin-queue-list">
            {permissions.has('students.approve_registration') ? (
              <Link to="/admin/students/registrations">
                <span>
                  <strong>Registration review</strong>
                  <small>Review student applications and decisions</small>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {permissions.has('teachers.approve') ? (
              <Link to="/admin/teachers/approvals">
                <span>
                  <strong>Teacher approvals</strong>
                  <small>Approve or reject pending staff registrations</small>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {permissions.has('results.review') ? (
              <Link to="/admin/results/review">
                <span>
                  <strong>Result review</strong>
                  <small>Review submitted academic results</small>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {!permissions.has('students.approve_registration') &&
            !permissions.has('teachers.approve') &&
            !permissions.has('results.review') ? (
              <p className="muted">There are no review queues assigned to this account.</p>
            ) : null}
          </div>
        </Panel>
        <Panel
          className="admin-queue-panel"
          description="Common administration tasks for this workspace."
          title="Shortcuts"
        >
          <div className="admin-shortcut-list">
            {permissions.has('students.read') ? (
              <Link to="/admin/students">Student directory</Link>
            ) : null}
            {permissions.has('teachers.read') ? (
              <Link to="/admin/teachers">Teacher directory</Link>
            ) : null}
            {permissions.has('sessions.manage') ? (
              <Link to="/admin/academics/sessions">Academic sessions</Link>
            ) : null}
            {permissions.has('settings.manage') ? (
              <Link to="/admin/settings">School settings</Link>
            ) : null}
          </div>
        </Panel>
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

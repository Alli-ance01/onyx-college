import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { formText } from '../../shared/forms/form-data.js';
import {
  Button,
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
    teachers.data?.filter((item) => item.status === 'PENDING_APPROVAL').length ?? 0;
  const resultAttention =
    batches.data?.filter((item) => ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(item.status))
      .length ?? 0;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Live operational context and permission-relevant queues."
        eyebrow="Admin Portal"
        title="School operations"
      />
      <div className="metric-grid">
        <Panel title="Academic session">
          <strong className="metric-value metric-value--text">
            {activeSession?.label ?? 'Not active'}
          </strong>
        </Panel>
        {permissions.has('teachers.read') ? (
          <Panel title="Teachers">
            <strong className="metric-value">{teachers.data?.length ?? 0}</strong>
          </Panel>
        ) : null}
        {permissions.has('teachers.approve') ? (
          <Panel title="Pending teachers">
            <strong className="metric-value">{pendingTeachers}</strong>
          </Panel>
        ) : null}
        {permissions.has('results.read_all') || permissions.has('results.review') ? (
          <Panel title="Results needing action">
            <strong className="metric-value">{resultAttention}</strong>
          </Panel>
        ) : null}
      </div>
      <div className="content-grid content-grid--two">
        <Panel title="Action queues">
          <div className="action-list">
            {permissions.has('students.approve_registration') ? (
              <Link className="ui-button ui-button--secondary" to="/admin/students/registrations">
                Registration review
              </Link>
            ) : null}
            {permissions.has('teachers.approve') ? (
              <Link className="ui-button ui-button--secondary" to="/admin/teachers/approvals">
                Teacher approvals
              </Link>
            ) : null}
            {permissions.has('results.review') ? (
              <Link className="ui-button ui-button--secondary" to="/admin/results/review">
                Result review
              </Link>
            ) : null}
          </div>
        </Panel>
        <Panel title="System status">
          <dl className="detail-list">
            <div>
              <dt>Current term</dt>
              <dd>
                {activeSession?.terms.find((item) => item.status === 'ACTIVE')?.name ??
                  'Not active'}
              </dd>
            </div>
            <div>
              <dt>Access role</dt>
              <dd>{auth.principal?.roles.join(', ')}</dd>
            </div>
          </dl>
        </Panel>
      </div>
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
        description="Role defaults group permissions, but never replace ownership, resource-state, or academic-scope checks."
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

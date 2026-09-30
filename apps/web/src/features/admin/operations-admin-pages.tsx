import type { AnnouncementDto, AssignmentDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyntheticEvent } from 'react';

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
import { adminApi, adminQueryKeys } from './admin-api.js';

function format(value: string): string {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function AdminAssignmentsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryFn: () => adminApi.assignments(auth.apiClient),
    queryKey: adminQueryKeys.assignments,
  });
  const archive = useMutation({
    mutationFn: (id: string) => adminApi.archiveAssignment(auth.apiClient, id),
    onSuccess: async () => cache.invalidateQueries({ queryKey: adminQueryKeys.assignments }),
  });
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="School-wide oversight of assignments created within authorized teaching scopes."
        eyebrow="Academic operations"
        title="Assignments"
      />
      <DataTable<AssignmentDto>
        caption="All assignments"
        columns={[
          {
            header: 'Assignment',
            id: 'assignment',
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <small className="table-secondary">
                  {row.subject.name} / {row.teacher.name}
                </small>
              </>
            ),
          },
          {
            header: 'Audience',
            id: 'audience',
            render: (row) =>
              `${row.classLevel.name}${row.track === undefined ? '' : ` / ${row.track.name}`}`,
          },
          { header: 'Due', id: 'due', render: (row) => format(row.dueAt) },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge
                tone={
                  row.status === 'PUBLISHED'
                    ? 'success'
                    : row.status === 'DRAFT'
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
              row.status === 'ARCHIVED' ? null : (
                <Button
                  disabled={archive.isPending}
                  onClick={() => {
                    archive.mutate(row.id);
                  }}
                  variant="danger"
                >
                  Archive
                </Button>
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

export function AdminAnnouncementsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryFn: () => adminApi.announcements(auth.apiClient),
    queryKey: adminQueryKeys.announcements,
  });
  const refresh = async () => cache.invalidateQueries({ queryKey: adminQueryKeys.announcements });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.createAnnouncement>[1]) =>
      adminApi.createAnnouncement(auth.apiClient, input),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: (id: string) => adminApi.publishAnnouncement(auth.apiClient, id),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => adminApi.withdrawAnnouncement(auth.apiClient, id),
    onSuccess: refresh,
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiresAt = formText(form, 'expiresAt');
    create.mutate({
      audience: { type: formText(form, 'audienceType') || 'SCHOOL' },
      body: formText(form, 'body'),
      title: formText(form, 'title'),
      ...(expiresAt === '' ? {} : { expiresAt: new Date(expiresAt).toISOString() }),
    });
    event.currentTarget.reset();
  }
  const error = create.error instanceof ApiClientError ? create.error.message : undefined;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Publish official notices to the whole school or broad portal audiences."
        eyebrow="Communication"
        title="Announcements"
      />
      <Panel title="Create announcement">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="admin-announcement-audience" label="Audience">
              <select defaultValue="SCHOOL" name="audienceType">
                <option value="SCHOOL">Entire school</option>
                <option value="STUDENTS">All students</option>
                <option value="TEACHERS">All teachers</option>
                <option value="JUNIOR_SCHOOL">Junior school</option>
                <option value="SENIOR_SCHOOL">Senior school</option>
              </select>
            </FormField>
            <FormField controlId="admin-announcement-expiry" label="Expires" optional>
              <input name="expiresAt" type="datetime-local" />
            </FormField>
          </div>
          <FormField controlId="admin-announcement-title" label="Title">
            <input name="title" required />
          </FormField>
          <FormField controlId="admin-announcement-body" label="Message">
            <textarea maxLength={20000} name="body" required rows={5} />
          </FormField>
          {error === undefined ? null : <p className="form-alert form-alert--error">{error}</p>}
          <Button loading={create.isPending} type="submit">
            Save draft
          </Button>
        </form>
      </Panel>
      <DataTable<AnnouncementDto>
        caption="Announcements"
        columns={[
          {
            header: 'Announcement',
            id: 'announcement',
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <small className="table-secondary">{row.author.name}</small>
              </>
            ),
          },
          { header: 'Audience', id: 'audience', render: (row) => row.audience.label },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge
                tone={
                  row.status === 'PUBLISHED'
                    ? 'success'
                    : row.status === 'DRAFT'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {row.status}
              </StatusBadge>
            ),
          },
          {
            header: 'Actions',
            id: 'actions',
            render: (row) => (
              <div className="table-actions">
                {row.status === 'DRAFT' ? (
                  <Button
                    disabled={publish.isPending}
                    onClick={() => {
                      publish.mutate(row.id);
                    }}
                  >
                    Publish
                  </Button>
                ) : null}
                {row.status === 'PUBLISHED' ? (
                  <Button
                    disabled={withdraw.isPending}
                    onClick={() => {
                      withdraw.mutate(row.id);
                    }}
                    variant="danger"
                  >
                    Withdraw
                  </Button>
                ) : null}
              </div>
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

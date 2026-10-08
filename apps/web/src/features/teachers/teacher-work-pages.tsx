import type { AnnouncementDto, AssignmentDto, TeachingAssignmentDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SyntheticEvent } from 'react';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { formText } from '../../shared/forms/form-data.js';
import {
  Button,
  DataTable,
  ErrorState,
  FormField,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import { teacherApi, teacherQueryKeys } from './teacher-api.js';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function mutationError(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return error instanceof ApiClientError ? error.message : 'The request could not be completed.';
}

function assignmentScopeLabel(assignment: TeachingAssignmentDto): string {
  return `${assignment.subject.name} / ${assignment.classLevel.name}${assignment.track === undefined ? '' : ` / ${assignment.track.name}`} / ${assignment.academicSession.label}`;
}

export function TeacherAssignmentsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const scopes = useQuery({
    queryFn: () => teacherApi.academicAssignments(auth.apiClient),
    queryKey: teacherQueryKeys.teachingAssignments,
  });
  const query = useQuery({
    queryFn: () => teacherApi.assignments(auth.apiClient),
    queryKey: teacherQueryKeys.assignments,
  });
  const refresh = async () => cache.invalidateQueries({ queryKey: teacherQueryKeys.assignments });
  const create = useMutation({
    mutationFn: (input: {
      dueAt: string;
      instructions: string;
      teachingAssignmentId: string;
      title: string;
    }) => teacherApi.createAssignment(auth.apiClient, input),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: (id: string) => teacherApi.publishAssignment(auth.apiClient, id),
    onSuccess: refresh,
  });
  const archive = useMutation({
    mutationFn: (id: string) => teacherApi.archiveAssignment(auth.apiClient, id),
    onSuccess: refresh,
  });
  const teachingScopes = (scopes.data ?? []).filter(
    (item): item is TeachingAssignmentDto => item.type === 'TEACHING' && item.status === 'ACTIVE',
  );

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dueAt = new Date(formText(form, 'dueAt'));
    create.mutate({
      dueAt: dueAt.toISOString(),
      instructions: formText(form, 'instructions'),
      teachingAssignmentId: formText(form, 'teachingAssignmentId'),
      title: formText(form, 'title'),
    });
    event.currentTarget.reset();
  }

  async function upload(assignment: AssignmentDto, file: File) {
    setUploadProgress((current) => ({ ...current, [assignment.id]: 0 }));
    try {
      await teacherApi.uploadAssignmentAttachment(
        auth.apiClient,
        assignment.id,
        file,
        (percent) => {
          setUploadProgress((current) => ({ ...current, [assignment.id]: percent }));
        },
      );
      await refresh();
    } finally {
      setUploadProgress((current) => {
        return Object.fromEntries(
          Object.entries(current).filter(([assignmentId]) => assignmentId !== assignment.id),
        );
      });
    }
  }

  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Create, attach files, and publish work only within an active teaching assignment."
        eyebrow="Teaching"
        title="Assignments"
      />
      <Panel
        title="Create assignment"
        description="Students can view and download published work; submission is not part of V1."
      >
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="assignment-scope" label="Class and subject">
              <select name="teachingAssignmentId" required defaultValue="">
                <option disabled value="">
                  Select an assigned scope
                </option>
                {teachingScopes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {assignmentScopeLabel(item)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField controlId="assignment-due" label="Due date and time">
              <input name="dueAt" required type="datetime-local" />
            </FormField>
          </div>
          <FormField controlId="assignment-title" label="Title">
            <input name="title" required minLength={2} maxLength={200} />
          </FormField>
          <FormField controlId="assignment-instructions" label="Instructions">
            <textarea name="instructions" required rows={5} maxLength={20000} />
          </FormField>
          {mutationError(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error" role="alert">
              {mutationError(create.error)}
            </p>
          )}
          <Button
            disabled={teachingScopes.length === 0}
            loading={create.isPending}
            loadingLabel="Creating"
            type="submit"
          >
            Save draft
          </Button>
        </form>
      </Panel>
      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} title="Assignments unavailable" />
      ) : null}
      <DataTable<AssignmentDto>
        caption="Teacher assignments"
        loading={query.isPending}
        columns={[
          {
            header: 'Assignment',
            id: 'assignment',
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <small className="table-secondary">
                  {row.subject.name} / {row.classLevel.name}
                  {row.track === undefined ? '' : ` / ${row.track.name}`}
                </small>
              </>
            ),
          },
          { header: 'Due', id: 'due', render: (row) => formatDateTime(row.dueAt) },
          { header: 'Files', id: 'files', render: (row) => row.attachments.length },
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
                  <>
                    <label className="ui-button ui-button--ghost file-button">
                      {uploadProgress[row.id] === undefined
                        ? 'Add file'
                        : String(uploadProgress[row.id]) + '%'}
                      <input
                        accept="image/jpeg,image/png,application/pdf"
                        disabled={uploadProgress[row.id] !== undefined}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file !== undefined) void upload(row, file);
                        }}
                        type="file"
                      />
                    </label>
                    <Button
                      disabled={publish.isPending}
                      onClick={() => {
                        publish.mutate(row.id);
                      }}
                    >
                      Publish
                    </Button>
                  </>
                ) : null}
                {row.status !== 'ARCHIVED' ? (
                  <Button
                    disabled={archive.isPending}
                    onClick={() => {
                      archive.mutate(row.id);
                    }}
                    variant="ghost"
                  >
                    Archive
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        rows={query.data ?? []}
      />
    </main>
  );
}

export function TeacherAnnouncementsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const scopes = useQuery({
    queryFn: () => teacherApi.academicAssignments(auth.apiClient),
    queryKey: teacherQueryKeys.teachingAssignments,
  });
  const query = useQuery({
    queryFn: () => teacherApi.announcements(auth.apiClient),
    queryKey: teacherQueryKeys.announcements,
  });
  const refresh = async () => cache.invalidateQueries({ queryKey: teacherQueryKeys.announcements });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof teacherApi.createAnnouncement>[1]) =>
      teacherApi.createAnnouncement(auth.apiClient, input),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: (id: string) => teacherApi.publishAnnouncement(auth.apiClient, id),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => teacherApi.withdrawAnnouncement(auth.apiClient, id),
    onSuccess: refresh,
  });
  const activeScopes = useMemo(
    () => (scopes.data ?? []).filter((item) => item.status === 'ACTIVE'),
    [scopes.data],
  );

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const scopeId = formText(form, 'scopeId');
    const scope = activeScopes.find((item) => item.id === scopeId);
    if (scope === undefined) return;
    const expiresValue = formText(form, 'expiresAt');
    create.mutate({
      audience: {
        classLevelId: scope.classLevel.id,
        type: scope.track === undefined ? ('CLASS' as const) : ('CLASS_TRACK' as const),
        ...(scope.track === undefined ? {} : { trackId: scope.track.id }),
      },
      body: formText(form, 'body'),
      title: formText(form, 'title'),
      ...(expiresValue === '' ? {} : { expiresAt: new Date(expiresValue).toISOString() }),
    });
    event.currentTarget.reset();
  }

  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Share updates with the classes you teach."
        eyebrow="Communication"
        title="Announcements"
      />
      <Panel title="Create announcement">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="announcement-scope" label="Audience">
              <select name="scopeId" required defaultValue="">
                <option disabled value="">
                  Select assigned class
                </option>
                {activeScopes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.classLevel.name}
                    {item.track === undefined ? '' : ` / ${item.track.name}`}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField controlId="announcement-expiry" label="Expires" optional>
              <input name="expiresAt" type="datetime-local" />
            </FormField>
          </div>
          <FormField controlId="announcement-title" label="Title">
            <input name="title" required minLength={2} maxLength={200} />
          </FormField>
          <FormField controlId="announcement-body" label="Message">
            <textarea name="body" required rows={5} maxLength={20000} />
          </FormField>
          {mutationError(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error" role="alert">
              {mutationError(create.error)}
            </p>
          )}
          <Button disabled={activeScopes.length === 0} loading={create.isPending} type="submit">
            Save draft
          </Button>
        </form>
      </Panel>
      <DataTable<AnnouncementDto>
        caption="Teacher announcements"
        loading={query.isPending}
        columns={[
          {
            header: 'Announcement',
            id: 'announcement',
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <small className="table-secondary">{row.audience.label}</small>
              </>
            ),
          },
          { header: 'Created', id: 'created', render: (row) => formatDateTime(row.createdAt) },
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
        rows={query.data ?? []}
      />
    </main>
  );
}

import type { SubjectDto, SubjectOfferingDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

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

function message(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return error instanceof ApiClientError ? error.message : 'The operation could not be completed.';
}

export function AdminSubjectsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const subjects = useQuery({
    queryFn: () => adminApi.subjects(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'subjects'],
  });
  const create = useMutation({
    mutationFn: (input: { code: string; description?: string; name: string }) =>
      adminApi.createSubject(auth.apiClient, input),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: [...adminQueryKeys.academic, 'subjects'] }),
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = formText(form, 'description');
    create.mutate({
      code: formText(form, 'code'),
      name: formText(form, 'name'),
      ...(description === '' ? {} : { description }),
    });
    event.currentTarget.reset();
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Manage the authoritative subject catalogue independently from class offerings."
        eyebrow="Curriculum"
        title="Subjects"
      />
      <Panel title="Add subject">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="subject-code" label="Code">
              <input maxLength={20} name="code" required />
            </FormField>
            <FormField controlId="subject-name" label="Name">
              <input name="name" required />
            </FormField>
          </div>
          <FormField controlId="subject-description" label="Description" optional>
            <textarea name="description" rows={2} />
          </FormField>
          {message(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{message(create.error)}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Add subject
          </Button>
        </form>
      </Panel>
      <DataTable<SubjectDto>
        caption="Subject catalogue"
        columns={[
          { header: 'Code', id: 'code', render: (row) => <strong>{row.code}</strong> },
          {
            header: 'Subject',
            id: 'name',
            render: (row) => (
              <>
                <strong>{row.name}</strong>
                <small className="table-secondary">{row.description ?? 'No description'}</small>
              </>
            ),
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
        error={subjects.isError}
        onRetry={() => void subjects.refetch()}
        loading={subjects.isPending}
        rows={subjects.data ?? []}
      />
    </main>
  );
}

export function AdminSubjectOfferingsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [selectedClass, setSelectedClass] = useState('');
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
  const offerings = useQuery({
    queryFn: () => adminApi.offerings(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'offerings'],
  });
  const classLevel = classes.data?.find((item) => item.id === selectedClass);
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.createOffering>[1]) =>
      adminApi.createOffering(auth.apiClient, input),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: [...adminQueryKeys.academic, 'offerings'] }),
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const trackId = formText(form, 'trackId');
    create.mutate({
      academicSessionId: formText(form, 'academicSessionId'),
      classification: formText(form, 'classification') as 'OPTIONAL' | 'REQUIRED',
      classLevelId: selectedClass,
      subjectId: formText(form, 'subjectId'),
      ...(trackId === '' ? {} : { trackId }),
    });
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Define required and optional curriculum for each class and senior track."
        eyebrow="Curriculum"
        title="Subject offerings"
      />
      <Panel title="Create offering">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="offering-session" label="Session">
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
            <FormField controlId="offering-class" label="Class">
              <select
                onChange={(event) => {
                  setSelectedClass(event.target.value);
                }}
                required
                value={selectedClass}
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
            {classLevel?.stage === 'SENIOR' ? (
              <FormField controlId="offering-track" label="Senior track">
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
            <FormField controlId="offering-subject" label="Subject">
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
            <FormField controlId="offering-classification" label="Classification">
              <select defaultValue="REQUIRED" name="classification" required>
                <option value="REQUIRED">Required</option>
                <option value="OPTIONAL">Optional</option>
              </select>
            </FormField>
          </div>
          {message(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{message(create.error)}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Create offering
          </Button>
        </form>
      </Panel>
      <DataTable<SubjectOfferingDto>
        caption="Subject offerings"
        columns={[
          {
            header: 'Subject',
            id: 'subject',
            render: (row) => (
              <>
                <strong>{row.subject.name}</strong>
                <small className="table-secondary">{row.subject.code}</small>
              </>
            ),
          },
          {
            header: 'Placement',
            id: 'placement',
            render: (row) =>
              `${row.classLevel.name}${row.track === undefined ? '' : ` / ${row.track.name}`}`,
          },
          { header: 'Session', id: 'session', render: (row) => row.academicSession.label },
          {
            header: 'Type',
            id: 'type',
            render: (row) => (
              <StatusBadge tone={row.classification === 'REQUIRED' ? 'info' : 'neutral'}>
                {row.classification}
              </StatusBadge>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        error={offerings.isError}
        onRetry={() => void offerings.refetch()}
        loading={offerings.isPending}
        rows={offerings.data ?? []}
      />
    </main>
  );
}

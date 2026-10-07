import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyntheticEvent } from 'react';

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
import { adminApi, adminQueryKeys } from './admin-api.js';

function errorMessage(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return error instanceof ApiClientError ? error.message : 'The operation could not be completed.';
}

export function AdminSessionsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const sessions = useQuery({
    queryFn: () => adminApi.sessions(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'sessions'],
  });
  const refresh = async () => cache.invalidateQueries({ queryKey: adminQueryKeys.academic });
  const create = useMutation({
    mutationFn: (label: string) => adminApi.createSession(auth.apiClient, label),
    onSuccess: refresh,
  });
  const activate = useMutation({
    mutationFn: ({ sessionId, termId }: { sessionId: string; termId: string }) =>
      adminApi.activateSession(auth.apiClient, sessionId, termId),
    onSuccess: refresh,
  });

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    create.mutate(formText(new FormData(form), 'label'), {
      onSuccess: () => {
        form.reset();
      },
    });
  }

  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Create school years and explicitly activate exactly one session and one term."
        eyebrow="Academic structure"
        title="Sessions and terms"
      />
      <Panel
        description="The label must use YYYY/YYYY. Three standard terms are created with the session."
        title="Create academic session"
      >
        <form className="inline-form" onSubmit={submit}>
          <FormField controlId="session-label" label="Session label">
            <input
              id="session-label"
              name="label"
              pattern="\d{4}/\d{4}"
              placeholder="2026/2027"
              required
              disabled={create.isPending}
            />
          </FormField>
          <Button loading={create.isPending} loadingLabel="Creating session…" type="submit">
            Create session
          </Button>
        </form>
        {errorMessage(create.error) === undefined ? null : (
          <p className="form-alert form-alert--error" role="alert">
            {errorMessage(create.error)}
          </p>
        )}
        {create.isSuccess ? (
          <p className="form-alert" role="status">
            Session {create.data.label} created with three terms.
          </p>
        ) : null}
      </Panel>
      {sessions.isError ? (
        <ErrorState onRetry={() => void sessions.refetch()} title="Sessions unavailable" />
      ) : null}
      {activate.isError ? (
        <p className="form-alert form-alert--error" role="alert">
          {errorMessage(activate.error)}
        </p>
      ) : null}
      <div className="admin-card-list">
        {sessions.data?.map((session) => (
          <Panel description={`Status: ${session.status}`} key={session.id} title={session.label}>
            <div className="term-list">
              {session.terms.map((term) => (
                <div className="term-row" key={term.id}>
                  <span>
                    <strong>{term.name}</strong>
                    <small>{term.status}</small>
                  </span>
                  {session.status === 'ACTIVE' && term.status === 'ACTIVE' ? (
                    <StatusBadge tone="success">Current</StatusBadge>
                  ) : (
                    <Button
                      disabled={activate.isPending}
                      onClick={() => {
                        activate.mutate({ sessionId: session.id, termId: term.id });
                      }}
                      variant="secondary"
                    >
                      Activate context
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </main>
  );
}

export function AdminReferenceStructurePage({ view }: { view: 'classes' | 'tracks' }) {
  const auth = useAuthSession();
  const classes = useQuery({
    queryFn: () => adminApi.classLevels(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'classes'],
  });
  const tracks = useQuery({
    queryFn: () => adminApi.tracks(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'tracks'],
  });
  const isClasses = view === 'classes';
  const rows = isClasses ? (classes.data ?? []) : (tracks.data ?? []);

  return (
    <main className="portal-content product-page">
      <PageHeader
        description={
          isClasses
            ? 'Canonical junior and senior levels used by enrollment and academic scope.'
            : 'Senior-school tracks used for SS1 to SS3 placement.'
        }
        eyebrow="Academic structure"
        title={isClasses ? 'Classes' : 'Senior tracks'}
      />
      <Panel
        description="These canonical V1 records are persisted during academic setup."
        title="Configured records"
      >
        <DataTable
          caption={isClasses ? 'Class levels' : 'Senior tracks'}
          columns={[
            { header: 'Code', id: 'code', render: (row) => row.code },
            { header: 'Name', id: 'name', render: (row) => row.name },
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
          loading={isClasses ? classes.isPending : tracks.isPending}
          rows={rows}
        />
      </Panel>
    </main>
  );
}

import type { ResultBatchDto, TeachingAssignmentDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { resolveErrorMessage } from '../../shared/error-messages.js';
import { useUnsavedChanges } from '../../shared/hooks/use-unsaved-changes.js';
import { formText } from '../../shared/forms/form-data.js';
import {
  Button,
  DataTable,
  ErrorState,
  FormField,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import { ResultLedger } from './result-ledger.js';
import { teacherApi, teacherQueryKeys } from './teacher-api.js';

function errorMessage(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return resolveErrorMessage(error, { action: 'process results', entity: 'result' });
}

function canEdit(status: ResultBatchDto['status']): boolean {
  return status === 'DRAFT' || status === 'RETURNED_FOR_CORRECTION';
}

export function TeacherResultsPage() {
  const auth = useAuthSession();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const assignments = useQuery({
    queryFn: () => teacherApi.academicAssignments(auth.apiClient),
    queryKey: teacherQueryKeys.teachingAssignments,
  });
  const sessions = useQuery({
    queryFn: () => teacherApi.sessions(auth.apiClient),
    queryKey: teacherQueryKeys.sessions,
  });
  const assessments = useQuery({
    queryFn: () => teacherApi.assessmentSchemes(auth.apiClient),
    queryKey: [...teacherQueryKeys.schemes, 'assessment'],
  });
  const grading = useQuery({
    queryFn: () => teacherApi.gradingSchemes(auth.apiClient),
    queryKey: [...teacherQueryKeys.schemes, 'grading'],
  });
  const batches = useQuery({
    queryFn: () => teacherApi.resultBatches(auth.apiClient),
    queryKey: teacherQueryKeys.batches,
  });
  const activeSession = sessions.data?.find((item) => item.status === 'ACTIVE');
  const activeAssignments = (assignments.data ?? []).filter(
    (item): item is TeachingAssignmentDto => item.type === 'TEACHING' && item.status === 'ACTIVE',
  );
  const create = useMutation({
    mutationFn: (input: Parameters<typeof teacherApi.createResultBatch>[1]) =>
      teacherApi.createResultBatch(auth.apiClient, input),
    onSuccess: async ({ id }) => {
      await cache.invalidateQueries({ queryKey: teacherQueryKeys.batches });
      void navigate(`/teacher/results/${id}`);
    },
  });

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      assessmentSchemeId: formText(form, 'assessmentSchemeId'),
      gradingSchemeId: formText(form, 'gradingSchemeId'),
      teachingAssignmentId: formText(form, 'teachingAssignmentId'),
      termId: formText(form, 'termId'),
    });
  }

  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Enter complete subject results, submit them for independent review, and track publication."
        eyebrow="Academic records"
        title="Results"
      />
      <Panel
        title="Start a result batch"
        description="Active assessment and grading schemes are controlled by school administration."
      >
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="result-assignment" label="Assigned subject and class">
              <select name="teachingAssignmentId" required defaultValue="">
                <option disabled value="">
                  Select a teaching assignment
                </option>
                {activeAssignments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.subject.name} / {item.classLevel.name}
                    {item.track === undefined ? '' : ` / ${item.track.name}`}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField controlId="result-term" label="Term">
              <select name="termId" required defaultValue="">
                <option disabled value="">
                  Select term
                </option>
                {activeSession?.terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                    {term.status === 'ACTIVE' ? ' (active)' : ''}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField controlId="result-assessment" label="Assessment scheme">
              <select name="assessmentSchemeId" required defaultValue="">
                <option disabled value="">
                  Select scheme
                </option>
                {assessments.data
                  ?.filter((item) => item.status === 'ACTIVE')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.totalMaximum})
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField controlId="result-grading" label="Grading scheme">
              <select name="gradingSchemeId" required defaultValue="">
                <option disabled value="">
                  Select scheme
                </option>
                {grading.data
                  ?.filter((item) => item.status === 'ACTIVE')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </FormField>
          </div>
          {errorMessage(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error" role="alert">
              {errorMessage(create.error)}
            </p>
          )}
          <Button
            disabled={activeAssignments.length === 0 || activeSession === undefined}
            loading={create.isPending}
            loadingLabel="Creating batch"
            type="submit"
          >
            Create result batch
          </Button>
        </form>
      </Panel>
      <DataTable<ResultBatchDto>
        caption="Result batches"
        loading={batches.isPending}
        columns={[
          {
            header: 'Subject',
            id: 'subject',
            render: (row) => (
              <>
                <strong>{row.subject.name}</strong>
                <small className="table-secondary">
                  {row.classLevel.name}
                  {row.track === undefined ? '' : ` / ${row.track.name}`}
                </small>
              </>
            ),
          },
          {
            header: 'Period',
            id: 'period',
            render: (row) => `${row.term.name} / ${row.academicSession.label}`,
          },
          { header: 'Entries', id: 'entries', render: (row) => row.entries.length },
          {
            header: 'Status',
            id: 'status',
            render: (row) => <StatusBadge status={row.status} />,
          },
          {
            header: '',
            id: 'open',
            align: 'end',
            render: (row) => (
              <Link to={`/teacher/results/${row.id}`}>
                {canEdit(row.status) ? 'Enter scores' : 'View batch'}
              </Link>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        rows={batches.data ?? []}
      />
    </main>
  );
}

// ResultEntryEditor removed — replaced by ResultLedger component in result-ledger.tsx

export function TeacherResultBatchPage() {
  const { batchId = '' } = useParams();
  const [anyDirty, setAnyDirty] = useState(false);
  const handleAnyDirty = useCallback((dirty: boolean) => {
    setAnyDirty(dirty);
  }, []);
  useUnsavedChanges(anyDirty);
  const auth = useAuthSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryFn: () => teacherApi.resultBatch(auth.apiClient, batchId),
    queryKey: teacherQueryKeys.resultBatch(batchId),
    enabled: batchId !== '' && !anyDirty,
  });
  const submit = useMutation({
    mutationFn: () => teacherApi.submitResultBatch(auth.apiClient, batchId),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: teacherQueryKeys.resultBatch(batchId) }),
  });
  if (query.isPending) return <LoadingState label="Loading result batch" rows={8} />;
  if (query.isError)
    return <ErrorState onRetry={() => void query.refetch()} title="Result batch unavailable" />;
  const batch = query.data;
  return (
    <main className="portal-content product-page">
      <PageHeader
        actions={
          canEdit(batch.status) ? (
            <Button
              disabled={anyDirty}
              loading={submit.isPending}
              onClick={() => {
                submit.mutate();
              }}
            >
              Submit for review
            </Button>
          ) : null
        }
        description={`${batch.classLevel.name}${batch.track === undefined ? '' : ` / ${batch.track.name}`} / ${batch.term.name} / ${batch.academicSession.label}`}
        eyebrow="Result batch"
        title={batch.subject.name}
      />
      <Panel>
        <div className="batch-summary">
          <StatusBadge status={batch.status} />
          <span>{batch.entries.length} students</span>
          <span>{batch.assessmentScheme.name}</span>
          <span>{batch.gradingScheme.name}</span>
        </div>
        {batch.transitionNote === undefined ? null : (
          <p className="form-alert form-alert--warning">Review note: {batch.transitionNote}</p>
        )}
        {errorMessage(submit.error) === undefined ? null : (
          <p className="form-alert form-alert--error" role="alert">
            {errorMessage(submit.error)}
          </p>
        )}
      </Panel>
      {anyDirty ? (
        <p aria-live="polite" className="form-alert">
          Scores are autosaving. Wait for all rows to finish before submitting for review.
        </p>
      ) : null}
      <ResultLedger batch={batch} onAnyDirty={handleAnyDirty} />
    </main>
  );
}

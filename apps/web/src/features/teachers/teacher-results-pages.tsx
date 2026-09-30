import type {
  ResultBatchDto,
  ResultComponentDto,
  ResultEntryDto,
  TeachingAssignmentDto,
} from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
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
import { teacherApi, teacherQueryKeys } from './teacher-api.js';

function errorMessage(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return error instanceof ApiClientError ? error.message : 'The request could not be completed.';
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
            render: (row) => (
              <StatusBadge
                tone={
                  row.status === 'PUBLISHED'
                    ? 'success'
                    : row.status === 'RETURNED_FOR_CORRECTION'
                      ? 'danger'
                      : row.status === 'DRAFT'
                        ? 'warning'
                        : 'info'
                }
              >
                {row.status}
              </StatusBadge>
            ),
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

interface EntryDraft {
  components: ResultComponentDto[];
  exempt: boolean;
}

function ResultEntryEditor({ batch, entry }: { batch: ResultBatchDto; entry: ResultEntryDto }) {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const editable = canEdit(batch.status);
  const [draft, setDraft] = useState<EntryDraft>({
    components: [...entry.components],
    exempt: entry.exempt,
  });
  const [correctionReason, setCorrectionReason] = useState('');
  const save = useMutation({
    mutationFn: () => teacherApi.saveResultEntry(auth.apiClient, entry.id, draft),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: teacherQueryKeys.resultBatch(batch.id) }),
  });
  const correction = useMutation({
    mutationFn: () =>
      teacherApi.requestResultCorrection(auth.apiClient, entry.id, {
        ...draft,
        reason: correctionReason,
      }),
    onSuccess: () => {
      setCorrectionReason('');
    },
  });

  function setComponent(key: string, update: ResultComponentDto) {
    setDraft((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.key === key ? update : component,
      ),
    }));
  }

  return (
    <article className="result-entry-card">
      <header>
        <div>
          <strong>{entry.student.name}</strong>
          <small>{entry.student.studentId}</small>
        </div>
        {entry.exempt ? (
          <StatusBadge tone="neutral">EXEMPT</StatusBadge>
        ) : entry.total === undefined ? null : (
          <span>
            {entry.total} / {entry.grade}
          </span>
        )}
      </header>
      <label className="checkbox-field">
        <input
          checked={draft.exempt}
          disabled={!editable && batch.status !== 'PUBLISHED'}
          onChange={(event) => {
            setDraft((current) => ({ ...current, exempt: event.target.checked }));
          }}
          type="checkbox"
        />{' '}
        Exempt from this subject
      </label>
      <div className="result-component-grid">
        {batch.assessmentScheme.components.map((component) => {
          const value = draft.components.find((item) => item.key === component.key) ?? {
            key: component.key,
            state: 'SCORED' as const,
            score: '',
          };
          return (
            <div className="result-component" key={component.key}>
              <label htmlFor={`${entry.id}-${component.key}`}>
                {component.label} <small>/ {component.maximum}</small>
              </label>
              <input
                disabled={
                  draft.exempt ||
                  (!editable && batch.status !== 'PUBLISHED') ||
                  value.state === 'ABSENT'
                }
                id={`${entry.id}-${component.key}`}
                inputMode="decimal"
                max={component.maximum}
                min="0"
                onChange={(event) => {
                  setComponent(component.key, {
                    key: component.key,
                    score: event.target.value,
                    state: 'SCORED',
                  });
                }}
                step="0.01"
                type="number"
                value={value.score ?? ''}
              />
              <label className="checkbox-field">
                <input
                  checked={value.state === 'ABSENT'}
                  disabled={draft.exempt || (!editable && batch.status !== 'PUBLISHED')}
                  onChange={(event) => {
                    setComponent(
                      component.key,
                      event.target.checked
                        ? { key: component.key, state: 'ABSENT' }
                        : { key: component.key, score: '', state: 'SCORED' },
                    );
                  }}
                  type="checkbox"
                />{' '}
                Absent
              </label>
            </div>
          );
        })}
      </div>
      {editable ? (
        <div className="entry-actions">
          <Button
            loading={save.isPending}
            onClick={() => {
              save.mutate();
            }}
            variant="secondary"
          >
            Save entry
          </Button>
          {errorMessage(save.error) === undefined ? null : (
            <span className="field-error">{errorMessage(save.error)}</span>
          )}
        </div>
      ) : null}
      {batch.status === 'PUBLISHED' ? (
        <div className="correction-request-inline">
          <FormField controlId={`${entry.id}-reason`} label="Published-result correction reason">
            <textarea
              onChange={(event) => {
                setCorrectionReason(event.target.value);
              }}
              rows={2}
              value={correctionReason}
            />
          </FormField>
          <Button
            disabled={correctionReason.trim().length < 5}
            loading={correction.isPending}
            onClick={() => {
              correction.mutate();
            }}
            variant="secondary"
          >
            Request correction
          </Button>
          {correction.isSuccess ? (
            <span className="success-copy">Correction request submitted.</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function TeacherResultBatchPage() {
  const { batchId = '' } = useParams();
  const auth = useAuthSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryFn: () => teacherApi.resultBatch(auth.apiClient, batchId),
    queryKey: teacherQueryKeys.resultBatch(batchId),
    enabled: batchId !== '',
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
          <StatusBadge
            tone={
              batch.status === 'PUBLISHED'
                ? 'success'
                : batch.status === 'RETURNED_FOR_CORRECTION'
                  ? 'danger'
                  : 'info'
            }
          >
            {batch.status}
          </StatusBadge>
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
      <div className="result-entry-list">
        {batch.entries.length === 0 ? (
          <Panel>
            <p>No eligible enrolled students were found for this subject.</p>
          </Panel>
        ) : (
          batch.entries.map((entry) => {
            const snapshotKey =
              entry.id +
              ':' +
              String(entry.exempt) +
              ':' +
              entry.components
                .map(
                  (component) =>
                    component.key + ':' + component.state + ':' + (component.score ?? ''),
                )
                .join('|');
            return <ResultEntryEditor batch={batch} entry={entry} key={snapshotKey} />;
          })
        )}
      </div>
    </main>
  );
}

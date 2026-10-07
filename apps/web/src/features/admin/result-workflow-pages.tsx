import type { ResultBatchDto, ResultCorrectionRequestDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
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
import { adminApi, adminQueryKeys } from './admin-api.js';

export type ResultQueueMode = 'all' | 'approval' | 'publishing' | 'review' | 'submitted';

function statusesFor(mode: ResultQueueMode): readonly ResultBatchDto['status'][] {
  if (mode === 'submitted') return ['SUBMITTED'];
  if (mode === 'review') return ['SUBMITTED', 'UNDER_REVIEW', 'RETURNED_FOR_CORRECTION'];
  if (mode === 'approval') return ['UNDER_REVIEW'];
  if (mode === 'publishing') return ['APPROVED'];
  return ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED_FOR_CORRECTION', 'APPROVED', 'PUBLISHED'];
}

function titleFor(mode: ResultQueueMode): string {
  if (mode === 'submitted') return 'Submitted results';
  if (mode === 'review') return 'Result review';
  if (mode === 'approval') return 'Result approval';
  if (mode === 'publishing') return 'Result publishing';
  return 'Result overview';
}

export function AdminResultQueuePage({ mode }: { mode: ResultQueueMode }) {
  const auth = useAuthSession();
  const query = useQuery({
    queryFn: () => adminApi.resultBatches(auth.apiClient),
    queryKey: adminQueryKeys.resultBatches,
  });
  const statuses = statusesFor(mode);
  const rows = useMemo(
    () => (query.data ?? []).filter((item) => statuses.includes(item.status)),
    [query.data, statuses],
  );
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Server-authorized batches with separation of duties and explicit state transitions."
        eyebrow="Sensitive academic records"
        title={titleFor(mode)}
      />
      <DataTable<ResultBatchDto>
        caption={titleFor(mode)}
        columns={[
          {
            header: 'Subject',
            id: 'subject',
            render: (row) => (
              <>
                <strong>{row.subject.name}</strong>
                <small className="table-secondary">{row.teacher.name}</small>
              </>
            ),
          },
          {
            header: 'Cohort',
            id: 'cohort',
            render: (row) =>
              `${row.classLevel.name}${row.track === undefined ? '' : ` / ${row.track.name}`}`,
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
                      : row.status === 'APPROVED'
                        ? 'info'
                        : 'warning'
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
            render: (row) => <Link to={`/admin/results/batches/${row.id}`}>Open batch</Link>,
          },
        ]}
        emptyDescription="No result batches currently need attention in this queue."
        getRowKey={(row) => row.id}
        error={query.isError}
        onRetry={() => void query.refetch()}
        loading={query.isPending}
        rows={rows}
      />
    </main>
  );
}

function transitionLabel(status: ResultBatchDto['status']): string | undefined {
  if (status === 'SUBMITTED') return 'Begin review';
  if (status === 'UNDER_REVIEW') return 'Approve batch';
  if (status === 'APPROVED') return 'Publish results';
  return undefined;
}

export function AdminResultBatchPage() {
  const { batchId = '' } = useParams();
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [note, setNote] = useState('');
  const query = useQuery({
    enabled: batchId !== '',
    queryFn: () => adminApi.resultBatch(auth.apiClient, batchId),
    queryKey: [...adminQueryKeys.resultBatches, batchId],
  });
  const transition = useMutation({
    mutationFn: ({
      action,
      requiredNote,
    }: {
      action: 'approve' | 'publish' | 'return-for-correction' | 'start-review';
      requiredNote?: string;
    }) => adminApi.transitionResultBatch(auth.apiClient, batchId, action, requiredNote),
    onSuccess: async () => {
      setNote('');
      await Promise.all([
        cache.invalidateQueries({ queryKey: [...adminQueryKeys.resultBatches, batchId] }),
        cache.invalidateQueries({ queryKey: adminQueryKeys.resultBatches }),
      ]);
    },
  });
  if (query.isPending) return <LoadingState label="Loading result batch" rows={8} />;
  if (query.isError)
    return <ErrorState onRetry={() => void query.refetch()} title="Result batch unavailable" />;
  const batch = query.data;
  const primaryAction =
    batch.status === 'SUBMITTED'
      ? 'start-review'
      : batch.status === 'UNDER_REVIEW'
        ? 'approve'
        : batch.status === 'APPROVED'
          ? 'publish'
          : undefined;
  const error = transition.error instanceof ApiClientError ? transition.error.message : undefined;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description={`${batch.classLevel.name}${batch.track === undefined ? '' : ` / ${batch.track.name}`} / ${batch.term.name} / ${batch.academicSession.label}`}
        eyebrow="Result review"
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
          <span>Teacher: {batch.teacher.name}</span>
          <span>{batch.entries.length} students</span>
          <span>{batch.assessmentScheme.name}</span>
        </div>
        {batch.transitionNote === undefined ? null : (
          <p className="form-alert form-alert--warning">Workflow note: {batch.transitionNote}</p>
        )}
        <FormField controlId="result-review-note" label="Review note" optional>
          <textarea
            onChange={(event) => {
              setNote(event.target.value);
            }}
            rows={2}
            value={note}
          />
        </FormField>
        {error === undefined ? null : <p className="form-alert form-alert--error">{error}</p>}
        <div className="form-actions">
          {primaryAction === undefined ? null : (
            <Button
              loading={transition.isPending}
              onClick={() => {
                transition.mutate({
                  action: primaryAction,
                  ...(note === '' ? {} : { requiredNote: note }),
                });
              }}
            >
              {transitionLabel(batch.status)}
            </Button>
          )}
          {batch.status === 'UNDER_REVIEW' ? (
            <Button
              disabled={note.trim().length < 5}
              loading={transition.isPending}
              onClick={() => {
                transition.mutate({ action: 'return-for-correction', requiredNote: note });
              }}
              variant="danger"
            >
              Return for correction
            </Button>
          ) : null}
        </div>
      </Panel>
      <div className="result-review-list">
        {batch.entries.map((entry) => (
          <Panel key={entry.id} title={`${entry.student.name} / ${entry.student.studentId}`}>
            <div className="batch-summary">
              {entry.exempt ? (
                <StatusBadge tone="neutral">EXEMPT</StatusBadge>
              ) : (
                <>
                  <span>Total: {entry.total ?? 'Incomplete'}</span>
                  <span>Percentage: {entry.percentage ?? 'Incomplete'}</span>
                  <span>Grade: {entry.grade ?? 'Incomplete'}</span>
                </>
              )}
            </div>
            <DataTable
              caption={`${entry.student.name} scores`}
              columns={[
                { header: 'Component', id: 'component', render: (component) => component.key },
                { header: 'State', id: 'state', render: (component) => component.state },
                {
                  header: 'Score',
                  id: 'score',
                  render: (component) =>
                    component.score ?? (component.state === 'ABSENT' ? '0 (absent)' : 'Unresolved'),
                },
              ]}
              getRowKey={(component) => component.key}
              rows={entry.components}
            />
          </Panel>
        ))}
      </div>
    </main>
  );
}

export function AdminResultCorrectionsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<ResultCorrectionRequestDto>();
  const [note, setNote] = useState('');
  const query = useQuery({
    queryFn: () => adminApi.resultCorrections(auth.apiClient),
    queryKey: adminQueryKeys.correctionRequests,
  });
  const transition = useMutation({
    mutationFn: (action: 'apply' | 'approve' | 'reject' | 'start-review') =>
      selected === undefined
        ? Promise.reject(new Error('No correction selected.'))
        : adminApi.transitionCorrection(
            auth.apiClient,
            selected.id,
            action,
            note === '' ? undefined : note,
          ),
    onSuccess: async () => {
      setSelected(undefined);
      setNote('');
      await cache.invalidateQueries({ queryKey: adminQueryKeys.correctionRequests });
    },
  });
  const error = transition.error instanceof ApiClientError ? transition.error.message : undefined;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Review and apply published-result corrections without silently changing history."
        eyebrow="Post-publication control"
        title="Result corrections"
      />
      {selected === undefined ? null : (
        <Panel description={`Current state: ${selected.status}`} title="Correction request">
          <p>
            <strong>Reason:</strong> {selected.reason}
          </p>
          <p>
            <strong>Proposed result:</strong>{' '}
            {selected.proposedComponents
              .map(
                (item) =>
                  `${item.key}: ${item.state === 'ABSENT' ? 'Absent' : (item.score ?? 'No score')}`,
              )
              .join(', ')}
          </p>
          <FormField controlId="correction-note" label="Decision note" optional>
            <textarea
              onChange={(event) => {
                setNote(event.target.value);
              }}
              rows={2}
              value={note}
            />
          </FormField>
          {error === undefined ? null : <p className="form-alert form-alert--error">{error}</p>}
          <div className="form-actions">
            {selected.status === 'SUBMITTED' ? (
              <Button
                onClick={() => {
                  transition.mutate('start-review');
                }}
              >
                Begin review
              </Button>
            ) : null}
            {selected.status === 'UNDER_REVIEW' ? (
              <>
                <Button
                  onClick={() => {
                    transition.mutate('approve');
                  }}
                >
                  Approve
                </Button>
                <Button
                  disabled={note.trim().length < 5}
                  onClick={() => {
                    transition.mutate('reject');
                  }}
                  variant="danger"
                >
                  Reject
                </Button>
              </>
            ) : null}
            {selected.status === 'APPROVED' ? (
              <Button
                onClick={() => {
                  transition.mutate('apply');
                }}
              >
                Apply approved correction
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setSelected(undefined);
              }}
              variant="ghost"
            >
              Close
            </Button>
          </div>
        </Panel>
      )}
      <DataTable<ResultCorrectionRequestDto>
        caption="Published-result correction requests"
        columns={[
          {
            header: 'Request',
            id: 'request',
            render: (row) => (
              <>
                <strong>{row.reason}</strong>
                <small className="table-secondary">Entry {row.resultEntryId}</small>
              </>
            ),
          },
          {
            header: 'Created',
            id: 'created',
            render: (row) => new Date(row.createdAt).toLocaleDateString('en-NG'),
          },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge
                tone={
                  row.status === 'APPLIED'
                    ? 'success'
                    : row.status === 'REJECTED'
                      ? 'danger'
                      : 'warning'
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
            render: (row) => (
              <Button
                onClick={() => {
                  setSelected(row);
                }}
                variant="secondary"
              >
                Review
              </Button>
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

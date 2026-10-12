import type { SubjectChangeRequestDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import {
  Button,
  DataTable,
  FormField,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import { adminApi, adminQueryKeys } from './admin-api.js';

export function AdminSubjectChangeRequestPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<SubjectChangeRequestDto>();
  const requests = useQuery({
    queryKey: [...adminQueryKeys.academic, 'subject-change-requests'],
    queryFn: () => adminApi.subjectChangeRequests(auth.apiClient),
  });
  const decide = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') => {
      if (selected === undefined) throw new Error('Select a request first.');
      return adminApi.decideSubjectChangeRequest(auth.apiClient, selected.id, {
        decision,
        decisionReason: reason,
      });
    },
    onSuccess: async () => {
      setSelected(undefined);
      setReason('');
      await cache.invalidateQueries({
        queryKey: [...adminQueryKeys.academic, 'subject-change-requests'],
      });
    },
  });
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Review student requests without changing historical enrollments. Approval creates the audited subject override."
        eyebrow="Academic operations"
        title="Subject-change requests"
      />
      <DataTable<SubjectChangeRequestDto>
        caption="Pending subject-change requests"
        columns={[
          {
            header: 'Student',
            id: 'student',
            render: (row) => (
              <>
                <strong>{row.enrollment.student.name}</strong>
                <small className="table-secondary">{row.enrollment.student.studentId}</small>
              </>
            ),
          },
          {
            header: 'Placement',
            id: 'placement',
            render: (row) =>
              `${row.enrollment.classLevel.name} / ${row.enrollment.academicSession.label}`,
          },
          {
            header: 'Subject',
            id: 'subject',
            render: (row) => (
              <>
                <strong>
                  {row.action} {row.subject.name}
                </strong>
                <small className="table-secondary">{row.subject.code}</small>
              </>
            ),
          },
          { header: 'Reason', id: 'reason', render: (row) => row.reason },
          {
            header: 'Status',
            id: 'status',
            render: (row) => <StatusBadge tone="warning">{row.status}</StatusBadge>,
          },
          {
            header: 'Action',
            id: 'action',
            render: (row) => (
              <Button
                onClick={() => {
                  setSelected(row);
                }}
                type="button"
              >
                Review
              </Button>
            ),
          },
        ]}
        emptyDescription="There are no pending subject-change requests."
        emptyTitle="Queue is clear"
        error={requests.isError}
        getRowKey={(row) => row.id}
        loading={requests.isPending}
        onRetry={() => void requests.refetch()}
        rows={requests.data ?? []}
      />
      {selected === undefined ? null : (
        <Panel
          title={`Review ${selected.action.toLowerCase()} request for ${selected.subject.name}`}
        >
          <p>{selected.reason}</p>
          <FormField controlId="subject-change-decision-reason" label="Decision reason">
            <textarea
              minLength={5}
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </FormField>
          {decide.error instanceof ApiClientError ? (
            <p className="form-alert form-alert--error">{decide.error.message}</p>
          ) : null}
          <div className="button-row">
            <Button
              disabled={reason.trim().length < 5}
              loading={decide.isPending}
              onClick={() => {
                decide.mutate('APPROVE');
              }}
              type="button"
            >
              Approve and apply
            </Button>
            <Button
              disabled={reason.trim().length < 5}
              loading={decide.isPending}
              onClick={() => {
                decide.mutate('REJECT');
              }}
              type="button"
            >
              Reject
            </Button>
          </div>
        </Panel>
      )}
    </main>
  );
}

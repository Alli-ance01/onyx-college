import type { StudentProfileDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  Button,
  FormField,
  type DataTableColumn,
} from '../../shared/ui/index.js';
import { DocumentViewButton } from '../student-onboarding/document-view-button.js';
import { studentPortalApi, studentPortalQueryKeys } from './student-portal-api.js';
import { formatDate, sentenceCase } from './student-portal-utils.js';

function useStudentProfile() {
  const auth = useAuthSession();
  return useQuery({
    queryKey: studentPortalQueryKeys.profile,
    queryFn: () => studentPortalApi.profile(auth.apiClient),
  });
}

function ProfileQueryState({ query }: { query: ReturnType<typeof useStudentProfile> }) {
  if (query.isPending) return <LoadingState label="Loading academic information" rows={4} />;
  if (query.isError)
    return <ErrorState onRetry={() => void query.refetch()} title="Information unavailable" />;
  return null;
}

export function StudentSubjectsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [reason, setReason] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [action, setAction] = useState<'ADD' | 'REMOVE'>('ADD');
  const profile = useStudentProfile();
  const currentEnrollment = profile.data?.academicHistory.find((item) => item.status === 'ACTIVE');
  const curriculum = useQuery({
    enabled: currentEnrollment !== undefined,
    queryKey:
      currentEnrollment === undefined
        ? ['student-portal', 'curriculum', 'unavailable']
        : studentPortalQueryKeys.curriculum(currentEnrollment.id),
    queryFn: () => {
      if (currentEnrollment === undefined) throw new Error('Current enrollment is unavailable.');
      return studentPortalApi.curriculum(auth.apiClient, currentEnrollment.id);
    },
  });
  const options = useQuery({
    enabled: currentEnrollment !== undefined,
    queryKey: ['student-portal', 'subject-options', currentEnrollment?.id],
    queryFn: () => {
      if (currentEnrollment === undefined) throw new Error('Current enrollment is unavailable.');
      return studentPortalApi.subjectChangeOptions(auth.apiClient, currentEnrollment.id);
    },
  });
  const requests = useQuery({
    queryKey: studentPortalQueryKeys.subjectChangeRequests,
    queryFn: () => studentPortalApi.subjectChangeRequests(auth.apiClient),
  });
  const submit = useMutation({
    mutationFn: () => {
      if (currentEnrollment === undefined) throw new Error('Current enrollment is unavailable.');
      return studentPortalApi.requestSubjectChange(auth.apiClient, currentEnrollment.id, {
        action,
        reason,
        subjectId: selectedSubject,
      });
    },
    onSuccess: async () => {
      setReason('');
      setSelectedSubject('');
      await cache.invalidateQueries({ queryKey: studentPortalQueryKeys.subjectChangeRequests });
    },
  });
  const requestable =
    options.data?.filter(
      (item) => item.classification === (action === 'ADD' ? 'OPTIONAL' : 'REQUIRED'),
    ) ?? [];

  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        description="Your official curriculum comes from the subject offerings for your placement, including any approved individual exceptions."
        eyebrow="Academic programme"
        title="My subjects"
      />
      <ProfileQueryState query={profile} />
      {profile.isSuccess && currentEnrollment === undefined ? (
        <EmptyState
          description="The school has not recorded an active enrollment for this account."
          title="No current enrollment"
        />
      ) : null}
      {curriculum.isPending && currentEnrollment !== undefined ? (
        <LoadingState label="Loading subjects" rows={5} variant="table" />
      ) : null}
      {curriculum.isError ? (
        <ErrorState onRetry={() => void curriculum.refetch()} title="Subjects unavailable" />
      ) : null}
      {curriculum.isSuccess ? (
        <DataTable
          caption="Official subjects"
          columns={[
            {
              header: 'Subject',
              id: 'subject',
              render: (row) => (
                <span className="table-primary">
                  <strong>{row.subject.name}</strong>
                  <small>{row.subject.code}</small>
                </span>
              ),
            },
            {
              header: 'Curriculum type',
              id: 'classification',
              render: (row) => (
                <StatusBadge tone={row.classification === 'REQUIRED' ? 'info' : 'neutral'}>
                  {sentenceCase(row.classification)}
                </StatusBadge>
              ),
            },
            {
              header: 'Individual handling',
              id: 'override',
              render: (row) =>
                row.overrideAction === undefined
                  ? 'Standard curriculum'
                  : `Administrator ${row.overrideAction.toLocaleLowerCase()}`,
            },
          ]}
          emptyDescription="No subjects have been configured for your current placement."
          emptyTitle="No subjects available"
          getRowKey={(row) => row.subject.id}
          rows={curriculum.data}
        />
      ) : null}
      {currentEnrollment !== undefined ? (
        <Panel title="Request a subject change">
          <p className="student-prose">
            Choose an offered subject and explain why. The school must approve requests before your
            curriculum changes.
          </p>
          <div className="form-grid form-grid--two">
            <FormField controlId="subject-change-action" label="Change">
              <select
                value={action}
                onChange={(event) => {
                  setAction(event.target.value as 'ADD' | 'REMOVE');
                  setSelectedSubject('');
                }}
              >
                <option value="ADD">Request to add an optional subject</option>
                <option value="REMOVE">Request to remove a required subject</option>
              </select>
            </FormField>
            <FormField controlId="subject-change-subject" label="Subject">
              <select
                required
                value={selectedSubject}
                onChange={(event) => {
                  setSelectedSubject(event.target.value);
                }}
              >
                <option value="">Select an offered subject</option>
                {requestable.map((item) => (
                  <option key={item.subject.id} value={item.subject.id}>
                    {item.subject.name} ({item.subject.code})
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField controlId="subject-change-reason" label="Reason">
            <textarea
              minLength={5}
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </FormField>
          {submit.error instanceof ApiClientError ? (
            <p className="form-alert form-alert--error">{submit.error.message}</p>
          ) : null}
          <Button
            disabled={selectedSubject === '' || reason.trim().length < 5}
            loading={submit.isPending}
            onClick={() => {
              submit.mutate();
            }}
            type="button"
          >
            Submit request
          </Button>
        </Panel>
      ) : null}
      {requests.isSuccess ? (
        <Panel title="Subject-change requests">
          {requests.data.length === 0 ? (
            <p className="student-prose">No subject-change requests.</p>
          ) : (
            requests.data.map((item) => (
              <p key={item.id}>
                <strong>
                  {item.action} {item.subject.name}
                </strong>{' '}
                —{' '}
                <StatusBadge
                  tone={
                    item.status === 'APPROVED'
                      ? 'success'
                      : item.status === 'REJECTED'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {item.status}
                </StatusBadge>
              </p>
            ))
          )}
        </Panel>
      ) : null}
    </main>
  );
}

type HistoryRow = StudentProfileDto['academicHistory'][number];
const historyColumns: readonly DataTableColumn<HistoryRow>[] = [
  {
    header: 'Academic session',
    id: 'session',
    render: (row) => <strong>{row.session.label}</strong>,
  },
  {
    header: 'Class',
    id: 'class',
    render: (row) => row.classLevel.name,
  },
  {
    header: 'Track',
    id: 'track',
    render: (row) => row.track?.name ?? 'Not applicable',
  },
  {
    header: 'Status',
    id: 'status',
    render: (row) => (
      <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
        {sentenceCase(row.status)}
      </StatusBadge>
    ),
  },
];

export function StudentAcademicHistoryPage() {
  const profile = useStudentProfile();
  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        description="A permanent record of your class placement across academic sessions. Previous enrollments are preserved and never overwritten."
        eyebrow="Academic record"
        title="Academic history"
      />
      <ProfileQueryState query={profile} />
      {profile.data === undefined ? null : (
        <DataTable
          caption="Academic enrollment history"
          columns={historyColumns}
          emptyDescription="No enrollment history has been recorded."
          emptyTitle="No academic history"
          getRowKey={(row) => row.id}
          rows={profile.data.academicHistory}
        />
      )}
    </main>
  );
}

export function StudentDocumentsPage() {
  const profile = useStudentProfile();
  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        description="Private documents attached to your official student record. Access is authorized by the portal before a protected file is opened."
        eyebrow="Official records"
        title="Documents"
      />
      <ProfileQueryState query={profile} />
      {profile.data?.documents.length === 0 ? (
        <EmptyState
          description="No documents are currently attached to your student profile."
          title="No documents"
        />
      ) : null}
      {profile.data === undefined || profile.data.documents.length === 0 ? null : (
        <div className="student-record-list">
          {profile.data.documents.map((document) => (
            <Panel key={document.id}>
              <div className="student-document-row">
                <div>
                  <p className="student-record-card__meta">
                    Added {formatDate(document.createdAt)} / Version {document.version}
                  </p>
                  <h2>{document.displayName}</h2>
                  <p>
                    {document.mimeType} / {(document.sizeBytes / 1024).toFixed(0)} KB
                  </p>
                  {document.reviewNote === undefined ? null : (
                    <p className="student-prose">School note: {document.reviewNote}</p>
                  )}
                </div>
                <div className="student-document-row__actions">
                  <StatusBadge
                    tone={
                      document.reviewStatus === 'VERIFIED'
                        ? 'success'
                        : document.reviewStatus === 'REJECTED'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {sentenceCase(document.reviewStatus)}
                  </StatusBadge>
                  <DocumentViewButton documentId={document.id} />
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </main>
  );
}

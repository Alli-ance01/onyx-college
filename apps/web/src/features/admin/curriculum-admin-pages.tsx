import type { EnrollmentDto, SubjectDto, SubjectOfferingDto } from '@onyx/contracts';
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
import { adminApi, adminQueryKeys } from './admin-api.js';
import { StudentEnrolledSubjectsPanel } from './student-profile-components.js';

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

export function AdminClassSubjectAssignmentPage() {
  const auth = useAuthSession();
  const sessions = useQuery({
    queryFn: () => adminApi.sessions(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'sessions'],
  });
  const classes = useQuery({
    queryFn: () => adminApi.classLevels(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'class-levels'],
  });
  const tracks = useQuery({
    queryFn: () => adminApi.tracks(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'tracks'],
  });

  const [selectedSession, setSelectedSession] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedTrack, setSelectedTrack] = useState<string>('');
  const [managingEnrollment, setManagingEnrollment] = useState<EnrollmentDto | null>(null);

  const activeSessionId =
    selectedSession !== ''
      ? selectedSession
      : (sessions.data?.find((s) => s.status === 'ACTIVE')?.id ?? sessions.data?.[0]?.id ?? '');

  const effectiveClassId = selectedClass !== '' ? selectedClass : (classes.data?.[0]?.id ?? '');

  const classLevel = classes.data?.find((item) => item.id === effectiveClassId);
  const isSenior = classLevel?.stage === 'SENIOR';

  const enrollmentsQuery = useQuery({
    enabled: activeSessionId !== '' && effectiveClassId !== '',
    queryFn: () =>
      adminApi.enrollments(auth.apiClient, {
        academicSessionId: activeSessionId,
        classLevelId: effectiveClassId,
        ...(isSenior && selectedTrack !== '' ? { trackId: selectedTrack } : {}),
      }),
    queryKey: [
      ...adminQueryKeys.academic,
      'enrollments',
      activeSessionId,
      effectiveClassId,
      isSenior ? selectedTrack : '',
    ],
  });

  const offeringsQuery = useQuery({
    enabled: activeSessionId !== '' && effectiveClassId !== '',
    queryFn: () => adminApi.offerings(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'offerings'],
  });

  const relevantOfferings =
    offeringsQuery.data?.filter(
      (offering) =>
        offering.academicSession.id === activeSessionId &&
        offering.classLevel.id === effectiveClassId &&
        (!isSenior || !selectedTrack || offering.track?.id === selectedTrack),
    ) ?? [];

  const canManage = auth.principal?.permissions.includes('enrollments.manage') === true;

  return (
    <main className="portal-content product-page">
      <PageHeader
        description="View class cohorts, assign or adjust elective subjects, and manage student curriculum exceptions."
        eyebrow="Academic Structure"
        title="Class Subject Assignments"
      />

      <Panel title="Filter class cohort">
        <div className="form-grid form-grid--three">
          <FormField controlId="filter-session" label="Academic session">
            <select
              id="filter-session"
              value={activeSessionId}
              onChange={(e) => {
                setSelectedSession(e.target.value);
              }}
            >
              {sessions.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} {item.status === 'ACTIVE' ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </FormField>

          <FormField controlId="filter-class" label="Class level">
            <select
              id="filter-class"
              value={effectiveClassId}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedTrack('');
              }}
            >
              {classes.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FormField>

          {isSenior ? (
            <FormField controlId="filter-track" label="Track">
              <select
                id="filter-track"
                value={selectedTrack}
                onChange={(e) => {
                  setSelectedTrack(e.target.value);
                }}
              >
                <option value="">All tracks</option>
                {tracks.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
        </div>
      </Panel>

      {relevantOfferings.length > 0 ? (
        <Panel title={`Configured offerings for placement (${String(relevantOfferings.length)})`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {relevantOfferings.map((offering) => (
              <span
                key={offering.id}
                style={{
                  alignItems: 'center',
                  background: 'var(--color-surface-subtle)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  fontSize: '0.85rem',
                  gap: '0.35rem',
                  padding: '0.35rem 0.65rem',
                }}
              >
                <strong>{offering.subject.name}</strong>
                <small style={{ color: 'var(--color-text-secondary)' }}>
                  ({offering.subject.code})
                </small>
                <StatusBadge tone={offering.classification === 'REQUIRED' ? 'info' : 'neutral'}>
                  {offering.classification}
                </StatusBadge>
              </span>
            ))}
          </div>
        </Panel>
      ) : null}

      <DataTable<EnrollmentDto>
        caption="Enrolled students"
        columns={[
          {
            header: 'Student ID',
            id: 'studentId',
            render: (row) => (
              <Link style={{ fontWeight: 600 }} to={`/admin/students/${row.student.id}`}>
                {row.student.studentId}
              </Link>
            ),
          },
          {
            header: 'Student name',
            id: 'name',
            render: (row) => <strong>{row.student.name}</strong>,
          },
          {
            header: 'Placement',
            id: 'placement',
            render: (row) =>
              `${row.classLevel.name}${row.track === undefined ? '' : ` / ${row.track.name}`}`,
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
          {
            header: 'Actions',
            id: 'actions',
            render: (row) => (
              <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setManagingEnrollment(row);
                  }}
                >
                  Manage subjects
                </Button>
                <Link
                  className="ui-button ui-button--secondary"
                  to={`/admin/students/${row.student.id}`}
                >
                  Profile
                </Link>
              </div>
            ),
          },
        ]}
        emptyDescription="There are no active student enrollments for this class level and session."
        emptyTitle="No enrolled students found"
        error={enrollmentsQuery.isError}
        getRowKey={(row) => row.id}
        loading={enrollmentsQuery.isPending}
        onRetry={() => void enrollmentsQuery.refetch()}
        rows={enrollmentsQuery.data ?? []}
      />

      {managingEnrollment !== null ? (
        <div
          aria-modal="true"
          role="dialog"
          style={{
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            inset: 0,
            justifyContent: 'center',
            overflowY: 'auto',
            padding: '1.5rem',
            position: 'fixed',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setManagingEnrollment(null);
            }
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface, #fff)',
              borderRadius: '8px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
              maxHeight: '90vh',
              maxWidth: '900px',
              overflowY: 'auto',
              padding: '2rem',
              width: '100%',
            }}
          >
            <div
              style={{
                alignItems: 'flex-start',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  Subject assignments: {managingEnrollment.student.name}
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
                  Student ID: <strong>{managingEnrollment.student.studentId}</strong> &bull;
                  Placement: {managingEnrollment.classLevel.name}
                  {managingEnrollment.track ? ` / ${managingEnrollment.track.name}` : ''} (
                  {managingEnrollment.academicSession.label})
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setManagingEnrollment(null);
                }}
              >
                Close
              </Button>
            </div>

            <StudentEnrolledSubjectsPanel
              canManage={canManage}
              enrollments={[
                {
                  classLevel: managingEnrollment.classLevel,
                  id: managingEnrollment.id,
                  session: managingEnrollment.academicSession,
                  status: managingEnrollment.status,
                  ...(managingEnrollment.track ? { track: managingEnrollment.track } : {}),
                },
              ]}
              studentId={managingEnrollment.student.id}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

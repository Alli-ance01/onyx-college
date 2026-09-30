import type { EnrollmentDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type SyntheticEvent } from 'react';

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

type Outcome = 'GRADUATE' | 'PROMOTE' | 'REPEAT' | 'TRANSFER' | 'WITHDRAW';

export function AdminPromotionsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<EnrollmentDto>();
  const [outcome, setOutcome] = useState<Outcome>('PROMOTE');
  const enrollments = useQuery({
    queryFn: () => adminApi.enrollments(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'enrollments'],
  });
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
  const selectedClassOrder = classes.data?.find(
    (item) => item.id === selected?.classLevel.id,
  )?.order;
  const destinationClass = useMemo(
    () =>
      selectedClassOrder === undefined
        ? undefined
        : classes.data?.find((item) => item.order === selectedClassOrder + 1),
    [classes.data, selectedClassOrder],
  );
  const progress = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof adminApi.progressEnrollment>[2];
    }) => adminApi.progressEnrollment(auth.apiClient, id, input),
    onSuccess: async () => {
      setSelected(undefined);
      await cache.invalidateQueries({ queryKey: [...adminQueryKeys.academic, 'enrollments'] });
    },
  });

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === undefined) return;
    const form = new FormData(event.currentTarget);
    const destinationSessionId = formText(form, 'destinationSessionId');
    const destinationClassLevelId = formText(form, 'destinationClassLevelId');
    const destinationTrackId = formText(form, 'destinationTrackId');
    progress.mutate({
      id: selected.id,
      input: {
        outcome,
        reason: formText(form, 'reason'),
        ...(destinationSessionId === '' ? {} : { destinationSessionId }),
        ...(destinationClassLevelId === '' ? {} : { destinationClassLevelId }),
        ...(destinationTrackId === '' ? {} : { destinationTrackId }),
      },
    });
  }

  const error = progress.error instanceof ApiClientError ? progress.error.message : undefined;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Create the next historical enrollment or close the current lifecycle without overwriting history."
        eyebrow="Enrollment progression"
        title="Promotions"
      />
      {selected === undefined ? null : (
        <Panel
          description={`${selected.classLevel.name}${selected.track === undefined ? '' : ` / ${selected.track.name}`} / ${selected.academicSession.label}`}
          title={`Progress ${selected.student.name}`}
        >
          <form className="form-stack" onSubmit={submit}>
            <div className="form-grid form-grid--two">
              <FormField controlId="progress-outcome" label="Outcome">
                <select
                  onChange={(event) => {
                    setOutcome(event.target.value as Outcome);
                  }}
                  value={outcome}
                >
                  <option value="PROMOTE">Promote</option>
                  <option value="REPEAT">Repeat</option>
                  <option value="WITHDRAW">Withdraw</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="GRADUATE">Graduate</option>
                </select>
              </FormField>
              {outcome === 'PROMOTE' || outcome === 'REPEAT' ? (
                <>
                  <FormField controlId="progress-session" label="Destination session">
                    <select defaultValue="" name="destinationSessionId" required>
                      <option disabled value="">
                        Select session
                      </option>
                      {sessions.data
                        ?.filter((item) => item.id !== selected.academicSession.id)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                    </select>
                  </FormField>
                  <FormField controlId="progress-class" label="Destination class">
                    <select
                      defaultValue={
                        outcome === 'PROMOTE'
                          ? (destinationClass?.id ?? '')
                          : selected.classLevel.id
                      }
                      name="destinationClassLevelId"
                      required
                    >
                      {classes.data?.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {(outcome === 'PROMOTE'
                    ? destinationClass
                    : classes.data?.find((item) => item.id === selected.classLevel.id)
                  )?.stage === 'SENIOR' ? (
                    <FormField controlId="progress-track" label="Destination track">
                      <select
                        defaultValue={selected.track?.id ?? ''}
                        name="destinationTrackId"
                        required
                      >
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
                </>
              ) : null}
            </div>
            <FormField controlId="progress-reason" label="Reason">
              <textarea minLength={5} name="reason" required rows={2} />
            </FormField>
            {error === undefined ? null : <p className="form-alert form-alert--error">{error}</p>}
            <div className="form-actions">
              <Button loading={progress.isPending} type="submit">
                Confirm progression
              </Button>
              <Button
                onClick={() => {
                  setSelected(undefined);
                }}
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}
      <DataTable<EnrollmentDto>
        caption="Enrollment history"
        columns={[
          {
            header: 'Student',
            id: 'student',
            render: (row) => (
              <>
                <strong>{row.student.name}</strong>
                <small className="table-secondary">{row.student.studentId}</small>
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
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {row.status}
              </StatusBadge>
            ),
          },
          {
            header: '',
            id: 'action',
            align: 'end',
            render: (row) =>
              row.status === 'ACTIVE' ? (
                <Button
                  onClick={() => {
                    setSelected(row);
                  }}
                  variant="secondary"
                >
                  Progress
                </Button>
              ) : null,
          },
        ]}
        getRowKey={(row) => row.id}
        loading={enrollments.isPending}
        rows={enrollments.data ?? []}
      />
    </main>
  );
}

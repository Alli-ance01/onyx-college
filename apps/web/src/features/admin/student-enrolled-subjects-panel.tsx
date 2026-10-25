import type {
  CurriculumSubjectDto,
  StudentProfileDto,
  SubjectOfferingDto,
  SuccessEnvelope,
} from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { Button, Panel, StatusBadge } from '../../shared/ui/index.js';

export interface StudentEnrolledSubjectsPanelProps {
  canManage: boolean;
  enrollments: StudentProfileDto['academicHistory'];
  studentId: string;
}

export function StudentEnrolledSubjectsPanel({
  canManage,
  enrollments,
  studentId,
}: StudentEnrolledSubjectsPanelProps) {
  const auth = useAuthSession();
  const queryClient = useQueryClient();

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(enrollments[0]?.id ?? '');
  const activeEnrollment =
    enrollments.find((e) => e.id === selectedEnrollmentId) ?? enrollments[0];
  const activeEnrollmentId = activeEnrollment?.id ?? '';

  // Action Dialog state
  const [dialogState, setDialogState] = useState<{
    action: 'ADD' | 'REMOVE' | 'REVOKE';
    offeringId: string;
    subjectCode: string;
    subjectId: string;
    subjectName: string;
  } | null>(null);

  const [reason, setReason] = useState('');

  // 1. Fetch current active curriculum for enrollment
  const curriculumQuery = useQuery({
    enabled: activeEnrollmentId !== '',
    queryFn: async () => {
      const res = await auth.apiClient.request<SuccessEnvelope<CurriculumSubjectDto[]>>(
        `/enrollments/${activeEnrollmentId}/curriculum`,
      );
      return res.data;
    },
    queryKey: ['enrollment-curriculum', activeEnrollmentId],
  });

  // 2. Fetch all offerings for this class level & track
  const optionsQuery = useQuery({
    enabled: activeEnrollmentId !== '',
    queryFn: async () => {
      const res = await auth.apiClient.request<SuccessEnvelope<SubjectOfferingDto[]>>(
        `/enrollments/${activeEnrollmentId}/subject-change-options`,
      );
      return res.data;
    },
    queryKey: ['enrollment-options', activeEnrollmentId],
  });

  // Override mutation (Assign optional or Exempt required)
  const overrideMutation = useMutation({
    mutationFn: async ({
      action,
      subjectId,
      reasonText,
    }: {
      action: 'ADD' | 'REMOVE';
      reasonText: string;
      subjectId: string;
    }) => {
      return auth.apiClient.request(`/enrollments/${activeEnrollmentId}/subject-overrides`, {
        body: {
          action,
          reason: reasonText,
          subjectId,
        },
        method: 'PUT',
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['enrollment-curriculum', activeEnrollmentId],
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-student', studentId] });
      setDialogState(null);
      setReason('');
    },
  });

  // Revoke override mutation (Restore required or Unassign optional)
  const revokeMutation = useMutation({
    mutationFn: async ({ subjectId }: { subjectId: string }) => {
      return auth.apiClient.request(
        `/enrollments/${activeEnrollmentId}/subject-overrides/${subjectId}`,
        {
          method: 'DELETE',
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['enrollment-curriculum', activeEnrollmentId],
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-student', studentId] });
      setDialogState(null);
      setReason('');
    },
  });

  if (activeEnrollment === undefined) return null;

  const curriculumMap = new Map<string, CurriculumSubjectDto>();
  for (const item of curriculumQuery.data ?? []) {
    curriculumMap.set(item.subject.id, item);
  }

  const offerings = optionsQuery.data ?? [];

  return (
    <Panel
      description={`Official curriculum and subject assignments for ${activeEnrollment.session.label} (${activeEnrollment.classLevel.name}${
        activeEnrollment.track ? ` · ${activeEnrollment.track.name}` : ''
      })`}
      title="Enrolled subjects & curriculum"
    >
      {enrollments.length > 1 ? (
        <div className="toolbar surface">
          <label className="search-field" htmlFor="enrollment-select">
            Session / Class:
            <select
              id="enrollment-select"
              value={activeEnrollment.id}
              onChange={(e) => {
                setSelectedEnrollmentId(e.target.value);
              }}
            >
              {enrollments.map((enr) => (
                <option key={enr.id} value={enr.id}>
                  {enr.session.label} — {enr.classLevel.name} {enr.track ? `(${enr.track.name})` : ''} [{enr.status}]
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {curriculumQuery.isLoading || optionsQuery.isLoading ? (
        <p className="table-state">Loading curriculum subjects…</p>
      ) : offerings.length === 0 ? (
        <p className="table-state">No subject offerings configured for this class level.</p>
      ) : (
        <div className="table-wrap surface">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Classification</th>
                <th>Status for student</th>
                {canManage ? <th className="cell-align-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {offerings.map((offering) => {
                const cur = curriculumMap.get(offering.subject.id);
                const isRequired = offering.classification === 'REQUIRED';
                const isEnrolled = cur !== undefined;
                const isExempted = isRequired && !isEnrolled;
                const isElectiveAdded = !isRequired && isEnrolled;

                return (
                  <tr key={offering.id}>
                    <td>
                      <strong>{offering.subject.name}</strong>{' '}
                      <span className="table-secondary">({offering.subject.code})</span>
                    </td>
                    <td>
                      {isRequired ? (
                        <span className="table-secondary">Required (Core)</span>
                      ) : (
                        <span className="primary-text">Optional (Elective)</span>
                      )}
                    </td>
                    <td>
                      {isRequired ? (
                        isExempted ? (
                          <StatusBadge tone="warning">Exempted</StatusBadge>
                        ) : (
                          <StatusBadge tone="success">Core curriculum</StatusBadge>
                        )
                      ) : isElectiveAdded ? (
                        <StatusBadge tone="success">Enrolled elective</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Not enrolled</StatusBadge>
                      )}
                    </td>
                    {canManage ? (
                      <td className="cell-align-right">
                        {isRequired ? (
                          isExempted ? (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setDialogState({
                                  action: 'REVOKE',
                                  offeringId: offering.id,
                                  subjectCode: offering.subject.code,
                                  subjectId: offering.subject.id,
                                  subjectName: offering.subject.name,
                                });
                              }}
                            >
                              Restore subject
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setReason('Student approved for curriculum exemption.');
                                setDialogState({
                                  action: 'REMOVE',
                                  offeringId: offering.id,
                                  subjectCode: offering.subject.code,
                                  subjectId: offering.subject.id,
                                  subjectName: offering.subject.name,
                                });
                              }}
                            >
                              Exempt
                            </Button>
                          )
                        ) : isElectiveAdded ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setDialogState({
                                action: 'REVOKE',
                                offeringId: offering.id,
                                subjectCode: offering.subject.code,
                                subjectId: offering.subject.id,
                                subjectName: offering.subject.name,
                              });
                            }}
                          >
                            Unassign
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            onClick={() => {
                              setReason('Student enrolled in elective subject.');
                              setDialogState({
                                action: 'ADD',
                                offeringId: offering.id,
                                subjectCode: offering.subject.code,
                                subjectId: offering.subject.id,
                                subjectName: offering.subject.name,
                              });
                            }}
                          >
                            Assign subject
                          </Button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation / Reason Modal */}
      {dialogState !== null ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialogState(null);
          }}
        >
          <section
            aria-label="Confirm subject change"
            aria-modal="true"
            className="dialog surface"
            role="dialog"
          >
            <h2>
              {dialogState.action === 'ADD'
                ? `Assign ${dialogState.subjectName}`
                : dialogState.action === 'REMOVE'
                  ? `Exempt ${dialogState.subjectName}`
                  : `Restore default for ${dialogState.subjectName}`}
            </h2>
            <p className="field-hint">
              {dialogState.action === 'ADD'
                ? `This will add ${dialogState.subjectName} (${dialogState.subjectCode}) to the student's authoritative curriculum for this session.`
                : dialogState.action === 'REMOVE'
                  ? `This will exempt the student from ${dialogState.subjectName} (${dialogState.subjectCode}). It will not count towards term averages.`
                  : `This will remove the current exception and revert ${dialogState.subjectName} to the default school curriculum.`}
            </p>

            {dialogState.action !== 'REVOKE' ? (
              <label>
                <span>Reason / Authorization note</span>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                  }}
                />
              </label>
            ) : null}

            <div className="form-actions">
              <Button
                disabled={overrideMutation.isPending || revokeMutation.isPending}
                variant="secondary"
                onClick={() => {
                  setDialogState(null);
                }}
              >
                Cancel
              </Button>
              <Button
                loading={overrideMutation.isPending || revokeMutation.isPending}
                loadingLabel="Updating…"
                variant={dialogState.action === 'REMOVE' ? 'danger' : 'primary'}
                onClick={() => {
                  if (dialogState.action === 'REVOKE') {
                    revokeMutation.mutate({ subjectId: dialogState.subjectId });
                  } else {
                    overrideMutation.mutate({
                      action: dialogState.action,
                      reasonText: reason,
                      subjectId: dialogState.subjectId,
                    });
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </Panel>
  );
}

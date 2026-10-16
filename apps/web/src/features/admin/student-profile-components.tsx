/**
 * Student profile editing and subject assignment components.
 */
import type {
  CurriculumSubjectDto,
  StudentProfileDto,
  SubjectOfferingDto,
  SuccessEnvelope,
} from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { ApiClientError } from '../../lib/api/api-client.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { Button, FormField, Panel, StatusBadge } from '../../shared/ui/index.js';

// ─── Edit Student Profile Modal ───────────────────────────────────────────────

interface EditStudentProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentProfileDto;
  studentId: string;
}

export function EditStudentProfileModal({
  isOpen,
  onClose,
  student,
  studentId,
}: EditStudentProfileModalProps) {
  const auth = useAuthSession();
  const queryClient = useQueryClient();
  const canReadSensitive =
    auth.principal?.permissions.includes('students.read_sensitive') === true;

  const [activeTab, setActiveTab] = useState<'biodata' | 'guardians' | 'medical'>('biodata');

  // Biodata state
  const [firstName, setFirstName] = useState(student.biodata.firstName);
  const [surname, setSurname] = useState(student.biodata.surname);
  const [middleName, setMiddleName] = useState(student.biodata.middleName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(student.biodata.dateOfBirth);
  const [gender, setGender] = useState(student.biodata.gender);
  const [nationality, setNationality] = useState(student.biodata.nationality);
  const [stateOfOrigin, setStateOfOrigin] = useState(student.biodata.stateOfOrigin ?? '');
  const [lga, setLga] = useState(student.biodata.lga ?? '');
  const [residentialAddress, setResidentialAddress] = useState(
    student.biodata.residentialAddress,
  );

  // Guardians state
  const [guardians, setGuardians] = useState(
    student.guardians.map((g) => ({
      emergencyContact: g.emergencyContact,
      fullName: g.fullName,
      phone: g.phone,
      primary: g.primary,
      relationship: g.relationship,
    })),
  );

  // Medical state
  const medicalObj = student.medical ?? {};
  const [bloodGroup, setBloodGroup] = useState(medicalObj.bloodGroup ?? '');
  const [genotype, setGenotype] = useState(medicalObj.genotype ?? '');
  const [allergies, setAllergies] = useState(medicalObj.allergies ?? '');
  const [medicalConditions, setMedicalConditions] = useState(medicalObj.medicalConditions ?? '');
  const [medications, setMedications] = useState(medicalObj.medications ?? '');
  const [emergencyInstructions, setEmergencyInstructions] = useState(
    medicalObj.emergencyInstructions ?? '',
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: {
        biodata?: Record<string, string>;
        guardians?: typeof guardians;
        medical?: Record<string, string>;
      } = {
        biodata: {
          dateOfBirth,
          firstName,
          gender,
          lga,
          middleName,
          nationality,
          residentialAddress,
          stateOfOrigin,
          surname,
        },
        guardians,
      };

      if (canReadSensitive) {
        payload.medical = {
          allergies,
          bloodGroup,
          emergencyInstructions,
          genotype,
          medicalConditions,
          medications,
        };
      }

      return auth.apiClient.request(`/students/${studentId}`, {
        body: payload,
        method: 'PATCH',
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-student', studentId] });
      await queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      onClose();
    },
  });

  if (!isOpen) return null;

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  const errorMessage =
    mutation.error instanceof ApiClientError
      ? mutation.error.message
      : mutation.error instanceof Error
        ? mutation.error.message
        : undefined;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-label="Edit student profile"
        aria-modal="true"
        className="dialog surface"
        role="dialog"
        style={{ maxWidth: '680px', width: '92%' }}
      >
        <header style={{ marginBottom: '1rem' }}>
          <h2>Edit student profile</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Updating records for {student.studentName} ({student.studentId})
          </p>
        </header>

        {errorMessage ? (
          <div className="form-alert form-alert--error" style={{ marginBottom: '1rem' }}>
            {errorMessage}
          </div>
        ) : null}

        <div className="tab-row" role="tablist" style={{ marginBottom: '1.25rem' }}>
          <button
            aria-selected={activeTab === 'biodata'}
            className={`tab ${activeTab === 'biodata' ? 'tab--active' : ''}`}
            onClick={() => {
              setActiveTab('biodata');
            }}
            role="tab"
            type="button"
          >
            Biodata
          </button>
          <button
            aria-selected={activeTab === 'guardians'}
            className={`tab ${activeTab === 'guardians' ? 'tab--active' : ''}`}
            onClick={() => {
              setActiveTab('guardians');
            }}
            role="tab"
            type="button"
          >
            Guardians ({guardians.length})
          </button>
          {canReadSensitive ? (
            <button
              aria-selected={activeTab === 'medical'}
              className={`tab ${activeTab === 'medical' ? 'tab--active' : ''}`}
              onClick={() => {
                setActiveTab('medical');
              }}
              role="tab"
              type="button"
            >
              Medical & Emergency
            </button>
          ) : null}
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          {activeTab === 'biodata' ? (
            <div className="form-grid form-grid--two">
              <FormField controlId="firstName" label="First name">
                <input
                  id="firstName"
                  required
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="surname" label="Surname">
                <input
                  id="surname"
                  required
                  value={surname}
                  onChange={(e) => {
                    setSurname(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="middleName" label="Middle name">
                <input
                  id="middleName"
                  value={middleName}
                  onChange={(e) => {
                    setMiddleName(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="dateOfBirth" label="Date of birth">
                <input
                  id="dateOfBirth"
                  required
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => {
                    setDateOfBirth(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="gender" label="Gender">
                <select
                  id="gender"
                  required
                  value={gender}
                  onChange={(e) => {
                    setGender(e.target.value);
                  }}
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </FormField>
              <FormField controlId="nationality" label="Nationality">
                <input
                  id="nationality"
                  required
                  value={nationality}
                  onChange={(e) => {
                    setNationality(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="stateOfOrigin" label="State of origin">
                <input
                  id="stateOfOrigin"
                  value={stateOfOrigin}
                  onChange={(e) => {
                    setStateOfOrigin(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="lga" label="LGA">
                <input
                  id="lga"
                  value={lga}
                  onChange={(e) => {
                    setLga(e.target.value);
                  }}
                />
              </FormField>
              <div style={{ gridColumn: '1 / -1' }}>
                <FormField controlId="residentialAddress" label="Residential address">
                  <input
                    id="residentialAddress"
                    required
                    value={residentialAddress}
                    onChange={(e) => {
                      setResidentialAddress(e.target.value);
                    }}
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          {activeTab === 'guardians' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {guardians.map((g, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1rem',
                  }}
                >
                  <div className="form-grid form-grid--two">
                    <FormField controlId={`guardian-name-${String(idx)}`} label="Full name">
                      <input
                        id={`guardian-name-${String(idx)}`}
                        required
                        value={g.fullName}
                        onChange={(e) => {
                          setGuardians(
                            guardians.map((item, i) =>
                              i === idx ? { ...item, fullName: e.target.value } : item,
                            ),
                          );
                        }}
                      />
                    </FormField>
                    <FormField controlId={`guardian-phone-${String(idx)}`} label="Phone number">
                      <input
                        id={`guardian-phone-${String(idx)}`}
                        required
                        value={g.phone}
                        onChange={(e) => {
                          setGuardians(
                            guardians.map((item, i) =>
                              i === idx ? { ...item, phone: e.target.value } : item,
                            ),
                          );
                        }}
                      />
                    </FormField>
                    <FormField controlId={`guardian-rel-${String(idx)}`} label="Relationship">
                      <input
                        id={`guardian-rel-${String(idx)}`}
                        required
                        value={g.relationship}
                        onChange={(e) => {
                          setGuardians(
                            guardians.map((item, i) =>
                              i === idx ? { ...item, relationship: e.target.value } : item,
                            ),
                          );
                        }}
                      />
                    </FormField>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          checked={g.primary}
                          type="checkbox"
                          onChange={(e) => {
                            setGuardians(
                              guardians.map((item, i) =>
                                i === idx ? { ...item, primary: e.target.checked } : item,
                              ),
                            );
                          }}
                        />
                        Primary guardian
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          checked={g.emergencyContact}
                          type="checkbox"
                          onChange={(e) => {
                            setGuardians(
                              guardians.map((item, i) =>
                                i === idx ? { ...item, emergencyContact: e.target.checked } : item,
                              ),
                            );
                          }}
                        />
                        Emergency contact
                      </label>
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setGuardians([
                    ...guardians,
                    {
                      emergencyContact: true,
                      fullName: '',
                      phone: '',
                      primary: guardians.length === 0,
                      relationship: 'Parent',
                    },
                  ]);
                }}
              >
                + Add another guardian
              </Button>
            </div>
          ) : null}

          {activeTab === 'medical' && canReadSensitive ? (
            <div className="form-grid form-grid--two">
              <FormField controlId="bloodGroup" label="Blood group">
                <input
                  id="bloodGroup"
                  placeholder="e.g. O+, A+"
                  value={bloodGroup}
                  onChange={(e) => {
                    setBloodGroup(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="genotype" label="Genotype">
                <input
                  id="genotype"
                  placeholder="e.g. AA, AS"
                  value={genotype}
                  onChange={(e) => {
                    setGenotype(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="allergies" label="Allergies">
                <input
                  id="allergies"
                  placeholder="e.g. Penicillin, Peanuts"
                  value={allergies}
                  onChange={(e) => {
                    setAllergies(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="medicalConditions" label="Medical conditions">
                <input
                  id="medicalConditions"
                  placeholder="e.g. Asthma"
                  value={medicalConditions}
                  onChange={(e) => {
                    setMedicalConditions(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="medications" label="Medications">
                <input
                  id="medications"
                  value={medications}
                  onChange={(e) => {
                    setMedications(e.target.value);
                  }}
                />
              </FormField>
              <FormField controlId="emergencyInstructions" label="Emergency instructions">
                <input
                  id="emergencyInstructions"
                  value={emergencyInstructions}
                  onChange={(e) => {
                    setEmergencyInstructions(e.target.value);
                  }}
                />
              </FormField>
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              marginTop: '1.5rem',
              borderTop: '1px solid var(--color-border)',
              paddingTop: '1rem',
            }}
          >
            <Button disabled={mutation.isPending} type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={mutation.isPending} loadingLabel="Saving changes…" type="submit">
              Save changes
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ─── Enrolled Subjects & Curriculum Panel ────────────────────────────────────

interface StudentEnrolledSubjectsPanelProps {
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
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label htmlFor="enrollment-select" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
            Session / Class:
          </label>
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
                {canManage ? <th style={{ textAlign: 'right' }}>Actions</th> : null}
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
                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                          Required (Core)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-primary-600)' }}>
                          Optional (Elective)
                        </span>
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
                      <td style={{ textAlign: 'right' }}>
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
            style={{ maxWidth: '480px' }}
          >
            <h2>
              {dialogState.action === 'ADD'
                ? `Assign ${dialogState.subjectName}`
                : dialogState.action === 'REMOVE'
                  ? `Exempt ${dialogState.subjectName}`
                  : `Restore default for ${dialogState.subjectName}`}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {dialogState.action === 'ADD'
                ? `This will add ${dialogState.subjectName} (${dialogState.subjectCode}) to the student's authoritative curriculum for this session.`
                : dialogState.action === 'REMOVE'
                  ? `This will exempt the student from ${dialogState.subjectName} (${dialogState.subjectCode}). It will not count towards term averages.`
                  : `This will remove the current exception and revert ${dialogState.subjectName} to the default school curriculum.`}
            </p>

            {dialogState.action !== 'REVOKE' ? (
              <label style={{ display: 'block', marginTop: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Reason / Authorization note</span>
                <textarea
                  required
                  rows={3}
                  style={{ width: '100%', marginTop: '0.25rem' }}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                  }}
                />
              </label>
            ) : null}

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
              }}
            >
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

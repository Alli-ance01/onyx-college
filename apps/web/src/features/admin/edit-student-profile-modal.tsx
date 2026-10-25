import type { StudentProfileDto } from '@onyx/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { ApiClientError } from '../../lib/api/api-client.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { Button, FormField } from '../../shared/ui/index.js';

export interface EditStudentProfileModalProps {
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
      >
        <header>
          <h2>Edit student profile</h2>
          <p className="field-hint">
            Updating records for {student.studentName} ({student.studentId})
          </p>
        </header>

        {errorMessage ? (
          <div className="form-alert form-alert--error">{errorMessage}</div>
        ) : null}

        <div className="tab-list" role="tablist">
          <button
            aria-selected={activeTab === 'biodata'}
            className={activeTab === 'biodata' ? 'active' : ''}
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
            className={activeTab === 'guardians' ? 'active' : ''}
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
              className={activeTab === 'medical' ? 'active' : ''}
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
              <div className="form-grid--full">
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
            <div className="flow">
              {guardians.map((g, idx) => (
                <div className="surface surface--raised card" key={idx}>
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
                        placeholder="e.g. Mother, Father, Aunt"
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
                    <div className="form-grid--full form-options-row">
                      <label className="checkbox-label">
                        <input
                          checked={g.primary}
                          type="checkbox"
                          onChange={(e) => {
                            setGuardians(
                              guardians.map((item, i) => ({
                                ...item,
                                primary: i === idx ? e.target.checked : false,
                              })),
                            );
                          }}
                        />
                        Primary guardian
                      </label>
                      <label className="checkbox-label">
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

          <div className="form-actions">
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

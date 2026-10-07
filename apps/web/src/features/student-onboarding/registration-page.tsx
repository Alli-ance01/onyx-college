import type {
  AcademicSetupDto,
  RegistrationCustomField,
  RegistrationDraftInput,
  RegistrationDto,
  SuccessEnvelope,
} from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useFormState, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { ApiClientError } from '../../lib/api/api-client.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { ErrorState } from '../../shared/ui/async-state.js';
import { DocumentViewButton } from './document-view-button.js';

const steps = [
  'Personal Information',
  'Contact Information',
  'Parent / Guardian',
  'Academic Information',
  'Medical / Emergency',
  'Documents',
  'Review & Submit',
] as const;
const emptyDraft: RegistrationDraftInput = {
  academic: {},
  contact: {},
  customResponses: {},
  guardian: { emergencyContact: true },
  medical: {},
  personal: {},
  version: 0,
};

function ErrorMessage({ error }: { error: unknown }) {
  return (
    <div className="form-alert form-alert--error" role="alert">
      {typeof error === 'string'
        ? error
        : error instanceof ApiClientError
          ? error.message
          : 'The request could not be completed. Check your connection and try again.'}
      {error instanceof ApiClientError && error.requestId !== undefined ? (
        <small>Reference: {error.requestId}</small>
      ) : null}
    </div>
  );
}

function CustomFieldInput({
  disabled,
  field,
  form,
}: {
  disabled: boolean;
  field: RegistrationCustomField;
  form: ReturnType<typeof useForm<RegistrationDraftInput>>;
}) {
  const path = ('customResponses.' + field.key) as `customResponses.${string}`;
  const registered = form.register(
    path,
    field.type === 'NUMBER' ? { valueAsNumber: true } : undefined,
  );
  const common = {
    disabled,
    id: 'custom-' + field.key,
    name: registered.name,
    onBlur: registered.onBlur,
    onChange: registered.onChange,
    ref: registered.ref,
  };
  let control;
  if (field.type === 'TEXTAREA') {
    control = (
      <textarea
        {...common}
        maxLength={field.validation?.maximumLength}
        minLength={field.validation?.minimumLength}
        placeholder={field.placeholder}
        rows={3}
      />
    );
  } else if (field.type === 'SELECT' || field.type === 'MULTISELECT') {
    control = (
      <select {...common} multiple={field.type === 'MULTISELECT'}>
        {field.type === 'SELECT' ? <option value="">Select</option> : null}
        {field.options?.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  } else if (field.type === 'BOOLEAN') {
    control = <input {...common} type="checkbox" />;
  } else {
    const type = {
      DATE: 'date',
      EMAIL: 'email',
      NUMBER: 'number',
      PHONE: 'tel',
      TEXT: 'text',
    }[field.type];
    control = (
      <input
        {...common}
        max={field.type === 'DATE' ? field.validation?.latestDate : field.validation?.maximum}
        maxLength={field.validation?.maximumLength}
        min={field.type === 'DATE' ? field.validation?.earliestDate : field.validation?.minimum}
        minLength={field.validation?.minimumLength}
        placeholder={field.placeholder}
        type={type}
      />
    );
  }
  return (
    <label htmlFor={'custom-' + field.key}>
      {field.label}
      {field.required ? null : <span className="optional-label">Optional</span>}
      {control}
      {field.helpText === undefined ? null : <small>{field.helpText}</small>}
    </label>
  );
}

function StatusView({ registration }: { registration: RegistrationDto }) {
  const auth = useAuthSession();
  const navigate = useNavigate();
  if (registration.status === 'APPROVED')
    return (
      <section className="onboarding-status surface">
        <span className="status-badge status-badge--success">Approved</span>
        <h1>Welcome to Onyx College</h1>
        <p>
          Your institutional profile is ready. Refresh your secure session to enter the Student
          Portal.
        </p>
        <button
          className="primary-button"
          onClick={() =>
            void auth.refreshSession().then(() => navigate('/student/dashboard', { replace: true }))
          }
        >
          Enter Student Portal
        </button>
      </section>
    );
  if (registration.status === 'REJECTED')
    return (
      <section className="onboarding-status surface">
        <span className="status-badge status-badge--danger">Application closed</span>
        <h1>Your registration was not approved</h1>
        <p>
          {registration.decisionReason ??
            'Contact the school administration if you need clarification.'}
        </p>
        <p className="muted">
          A rejected registration cannot be replaced with a new application. Only an authorized
          administrator can reopen it.
        </p>
      </section>
    );
  return (
    <section className="onboarding-status surface">
      <span className="status-badge">
        {registration.status === 'UNDER_REVIEW' ? 'Under review' : 'Submitted'}
      </span>
      <h1>Your registration is with the school</h1>
      <p>We will keep this application read-only while it is being reviewed.</p>
      <dl className="summary-list">
        <div>
          <dt>Submitted</dt>
          <dd>
            {registration.submittedAt === undefined
              ? 'Recently'
              : new Date(registration.submittedAt).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>Application reference</dt>
          <dd>{registration.id}</dd>
        </div>
      </dl>
    </section>
  );
}

export function RegistrationPage() {
  const auth = useAuthSession();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<Date>();
  const [uploadProgress, setUploadProgress] = useState<number>();
  const [uploadError, setUploadError] = useState<unknown>();
  const registrationQuery = useQuery({
    queryKey: ['student-registration', 'mine'],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<RegistrationDto>>('/student-registrations/me'))
        .data,
  });
  const academicQuery = useQuery({
    queryKey: ['academic-setup'],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<AcademicSetupDto>>('/academic-setup')).data,
  });
  const requirementsQuery = useQuery({
    queryKey: ['document-requirements'],
    queryFn: async () =>
      (
        await auth.apiClient.request<
          SuccessEnvelope<
            {
              acceptedMimeTypes: string[];
              code: string;
              id: string;
              label: string;
              maximumBytes: number;
              requiredForRegistration: boolean;
            }[]
          >
        >('/document-requirements')
      ).data,
  });
  const form = useForm<RegistrationDraftInput>({ defaultValues: emptyDraft, mode: 'onBlur' });
  const { dirtyFields } = useFormState({ control: form.control });
  const hasUnsavedChanges = Object.keys(dirtyFields).length > 0;
  const registration = registrationQuery.data;
  useEffect(() => {
    if (registration !== undefined)
      form.reset(
        { ...registration.data, version: registration.version },
        { keepDirtyValues: true },
      );
  }, [form, registration]);

  const saveMutation = useMutation({
    mutationFn: async (draft: RegistrationDraftInput) =>
      (
        await auth.apiClient.request<SuccessEnvelope<RegistrationDto>>(
          '/student-registrations/me',
          { body: draft, method: 'PATCH' },
        )
      ).data,
    onSuccess: (data) => {
      queryClient.setQueryData(['student-registration', 'mine'], data);
      form.reset({ ...data.data, version: data.version });
      setSavedAt(new Date());
    },
  });
  const submitMutation = useMutation({
    mutationFn: async () =>
      (
        await auth.apiClient.request<SuccessEnvelope<RegistrationDto>>(
          '/student-registrations/me/submit',
          { method: 'POST' },
        )
      ).data,
    onSuccess: (data) => queryClient.setQueryData(['student-registration', 'mine'], data),
  });
  const removeDocumentMutation = useMutation({
    mutationFn: async (documentId: string) =>
      auth.apiClient.request('/student-documents/' + documentId, { method: 'DELETE' }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['student-registration', 'mine'] });
    },
  });
  const saveAndMove = form.handleSubmit((draft) => {
    saveMutation.mutate(draft, {
      onSuccess: () => {
        setStep((current) => Math.min(current + 1, steps.length - 1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  });

  const [requestedClass, nationality] = useWatch({
    control: form.control,
    name: ['academic.requestedClassLevelCode', 'personal.nationality'],
  });
  const passport = registration?.documents.find(
    (document) =>
      requirementsQuery.data?.find(
        (requirement) => requirement.id === document.documentRequirementId,
      )?.code === 'PASSPORT_PHOTOGRAPH',
  );
  const lockedTo =
    registration?.status === 'CHANGES_REQUESTED'
      ? new Set(registration.allowedCorrectionFields)
      : null;
  const isAllowed = (path: string) =>
    lockedTo === null ||
    [...lockedTo].some(
      (allowed) =>
        path === allowed || path.startsWith(`${allowed}.`) || allowed.startsWith(`${path}.`),
    );
  const isCanonicalEnabled = (key: string) =>
    registration?.configuration.canonicalFields.some(
      (field) => field.key === key && field.enabled,
    ) === true;

  if (registrationQuery.isLoading)
    return <main className="route-status">Loading your registration…</main>;
  if (registrationQuery.isError || registration === undefined)
    return (
      <main className="registration-shell">
        <ErrorState
          title="Registration unavailable"
          onRetry={() => void registrationQuery.refetch()}
        />
      </main>
    );
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(registration.status))
    return (
      <main className="registration-shell">
        <StatusView registration={registration} />
      </main>
    );

  const uploadPassport = async (file: File) => {
    const requirement = requirementsQuery.data?.find(({ code }) => code === 'PASSPORT_PHOTOGRAPH');
    if (requirement === undefined) return;
    setUploadError(undefined);
    if (
      !requirement.acceptedMimeTypes.includes(file.type) ||
      file.size === 0 ||
      file.size > requirement.maximumBytes
    ) {
      setUploadError('Choose a JPEG or PNG photograph within the allowed file size.');
      return;
    }
    setUploadProgress(0);
    try {
      await auth.apiClient.upload(
        `/student-documents/${requirement.id}/content`,
        file,
        setUploadProgress,
      );
      await queryClient.invalidateQueries({ queryKey: ['student-registration', 'mine'] });
    } catch (error) {
      setUploadError(error);
    } finally {
      setUploadProgress(undefined);
    }
  };

  const customFields = registration.configuration.customFields.filter(
    ({ enabled, section }) =>
      enabled &&
      section.toLocaleLowerCase() ===
        ['personal', 'contact', 'guardian', 'academic', 'medical', 'documents', 'review'][step],
  );

  return (
    <main className="registration-shell">
      <header className="registration-heading">
        <div>
          <p className="eyebrow">Student registration</p>
          <h1>Complete your Onyx College registration</h1>
          <p>
            Save each section as you go. Your application is not final until you review and submit
            it.
          </p>
        </div>
        <div className="save-indicator" aria-live="polite">
          {saveMutation.isPending
            ? 'Saving…'
            : hasUnsavedChanges
              ? 'Unsaved changes'
              : savedAt === undefined
                ? 'Progress saved when you continue'
                : `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      </header>
      {academicQuery.isError ? (
        <ErrorState
          title="Academic options unavailable"
          onRetry={() => void academicQuery.refetch()}
        />
      ) : null}
      {registration.status === 'CHANGES_REQUESTED' ? (
        <div className="form-alert">
          <strong>Changes requested:</strong> {registration.decisionReason}
          <br />
          <span>Only the highlighted fields can be changed before resubmission.</span>
        </div>
      ) : null}
      <div className="registration-layout">
        <nav className="step-navigation" aria-label="Registration sections">
          <ol>
            {steps.map((label, index) => (
              <li key={label}>
                <button
                  aria-current={step === index ? 'step' : undefined}
                  className={step === index ? 'active' : index < step ? 'complete' : ''}
                  onClick={() => {
                    setStep(index);
                  }}
                  type="button"
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <form
          className="registration-form surface"
          onSubmit={(event) => {
            void saveAndMove(event).catch(() => undefined);
          }}
        >
          <div className="section-heading">
            <p>
              Step {step + 1} of {steps.length}
            </p>
            <h2>{steps[step]}</h2>
          </div>
          {step === 0 ? (
            <div className="form-grid form-grid--two">
              <label>
                Surname
                <input
                  disabled={!isAllowed('personal.surname')}
                  {...form.register('personal.surname', { required: 'Surname is required.' })}
                />
                {form.formState.errors.personal?.surname === undefined ? null : (
                  <span className="field-error">
                    {form.formState.errors.personal.surname.message}
                  </span>
                )}
              </label>
              <label>
                First name
                <input
                  disabled={!isAllowed('personal.firstName')}
                  {...form.register('personal.firstName', { required: 'First name is required.' })}
                />
              </label>
              {isCanonicalEnabled('middleName') ? (
                <label>
                  Middle name <span className="optional-label">Optional</span>
                  <input
                    disabled={!isAllowed('personal.middleName')}
                    {...form.register('personal.middleName')}
                  />
                </label>
              ) : null}
              <label>
                Date of birth
                <input
                  disabled={!isAllowed('personal.dateOfBirth')}
                  type="date"
                  {...form.register('personal.dateOfBirth', {
                    required: 'Date of birth is required.',
                  })}
                />
              </label>
              <label>
                Gender
                <select
                  disabled={!isAllowed('personal.gender')}
                  {...form.register('personal.gender', { required: 'Gender is required.' })}
                >
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Nationality
                <input
                  disabled={!isAllowed('personal.nationality')}
                  {...form.register('personal.nationality', {
                    required: 'Nationality is required.',
                  })}
                />
              </label>
              {nationality?.trim().toLocaleLowerCase() === 'nigerian' ? (
                <>
                  <label>
                    State of origin
                    <input
                      disabled={!isAllowed('personal.stateOfOrigin')}
                      {...form.register('personal.stateOfOrigin', {
                        required: 'State of origin is required.',
                      })}
                    />
                  </label>
                  <label>
                    Local government area
                    <input
                      disabled={!isAllowed('personal.lga')}
                      {...form.register('personal.lga', { required: 'LGA is required.' })}
                    />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
          {step === 1 ? (
            <div className="form-grid">
              <label>
                Residential address
                <textarea
                  disabled={!isAllowed('contact.residentialAddress')}
                  rows={4}
                  {...form.register('contact.residentialAddress', {
                    required: 'Residential address is required.',
                  })}
                />
              </label>
              <div className="form-grid form-grid--two">
                {isCanonicalEnabled('studentPhone') ? (
                  <label>
                    Student phone <span className="optional-label">Optional</span>
                    <input
                      disabled={!isAllowed('contact.phone')}
                      type="tel"
                      {...form.register('contact.phone')}
                    />
                  </label>
                ) : null}
                {isCanonicalEnabled('studentEmail') ? (
                  <label>
                    Student email <span className="optional-label">Optional</span>
                    <input
                      disabled={!isAllowed('contact.email')}
                      type="email"
                      {...form.register('contact.email')}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="form-grid form-grid--two">
              <label>
                Primary guardian name
                <input
                  disabled={!isAllowed('guardian.fullName')}
                  {...form.register('guardian.fullName', {
                    required: 'Guardian name is required.',
                  })}
                />
              </label>
              <label>
                Relationship
                <input
                  disabled={!isAllowed('guardian.relationship')}
                  {...form.register('guardian.relationship', {
                    required: 'Relationship is required.',
                  })}
                />
              </label>
              <label>
                Phone
                <input
                  disabled={!isAllowed('guardian.phone')}
                  type="tel"
                  {...form.register('guardian.phone', { required: 'Guardian phone is required.' })}
                />
              </label>
              {isCanonicalEnabled('guardianAlternatePhone') ? (
                <label>
                  Alternate phone <span className="optional-label">Optional</span>
                  <input
                    disabled={!isAllowed('guardian.alternatePhone')}
                    type="tel"
                    {...form.register('guardian.alternatePhone')}
                  />
                </label>
              ) : null}
              {isCanonicalEnabled('guardianEmail') ? (
                <label>
                  Email <span className="optional-label">Optional</span>
                  <input
                    disabled={!isAllowed('guardian.email')}
                    type="email"
                    {...form.register('guardian.email')}
                  />
                </label>
              ) : null}
              {isCanonicalEnabled('guardianOccupation') ? (
                <label>
                  Occupation <span className="optional-label">Optional</span>
                  <input
                    disabled={!isAllowed('guardian.occupation')}
                    {...form.register('guardian.occupation')}
                  />
                </label>
              ) : null}
              {isCanonicalEnabled('guardianAddress') ? (
                <label className="form-grid__full">
                  Address <span className="optional-label">Optional</span>
                  <textarea
                    disabled={!isAllowed('guardian.address')}
                    rows={3}
                    {...form.register('guardian.address')}
                  />
                </label>
              ) : null}
              <label className="checkbox-field form-grid__full">
                <input
                  disabled={!isAllowed('guardian.emergencyContact')}
                  type="checkbox"
                  {...form.register('guardian.emergencyContact')}
                />
                Use this guardian as the primary emergency contact
              </label>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="form-grid form-grid--two">
              <label>
                Requested class
                <select
                  disabled={!isAllowed('academic.requestedClassLevelCode')}
                  {...form.register('academic.requestedClassLevelCode', {
                    required: 'Requested class is required.',
                  })}
                >
                  <option value="">Select class</option>
                  {academicQuery.data?.classLevels.map((level) => (
                    <option key={level.id} value={level.code}>
                      {level.name}
                    </option>
                  ))}
                </select>
              </label>
              {requestedClass?.startsWith('SS') ? (
                <label>
                  Requested senior track
                  <select
                    disabled={!isAllowed('academic.requestedTrackCode')}
                    {...form.register('academic.requestedTrackCode', {
                      required: 'Senior track is required.',
                    })}
                  >
                    <option value="">Select track</option>
                    {academicQuery.data?.tracks.map((track) => (
                      <option key={track.id} value={track.code}>
                        {track.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <p className="form-note form-grid__full">
                This is your requested placement. The school confirms the authoritative class and
                track during approval.
              </p>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="form-grid form-grid--two">
              {isCanonicalEnabled('bloodGroup') ? (
                <label>
                  Blood group <span className="optional-label">Optional</span>
                  <input
                    disabled={!isAllowed('medical.bloodGroup')}
                    {...form.register('medical.bloodGroup')}
                  />
                </label>
              ) : null}
              {isCanonicalEnabled('genotype') ? (
                <label>
                  Genotype <span className="optional-label">Optional</span>
                  <input
                    disabled={!isAllowed('medical.genotype')}
                    {...form.register('medical.genotype')}
                  />
                </label>
              ) : null}
              {isCanonicalEnabled('allergies') ? (
                <label className="form-grid__full">
                  Allergies <span className="optional-label">Optional</span>
                  <textarea
                    disabled={!isAllowed('medical.allergies')}
                    rows={3}
                    {...form.register('medical.allergies')}
                  />
                </label>
              ) : null}
              {isCanonicalEnabled('medicalConditions') ? (
                <label className="form-grid__full">
                  Medical conditions <span className="optional-label">Optional</span>
                  <textarea
                    disabled={!isAllowed('medical.medicalConditions')}
                    rows={3}
                    {...form.register('medical.medicalConditions')}
                  />
                </label>
              ) : null}
              {isCanonicalEnabled('medications') ? (
                <label className="form-grid__full">
                  Medications <span className="optional-label">Optional</span>
                  <textarea
                    disabled={!isAllowed('medical.medications')}
                    rows={3}
                    {...form.register('medical.medications')}
                  />
                </label>
              ) : null}
              {isCanonicalEnabled('emergencyInstructions') ? (
                <label className="form-grid__full">
                  Emergency instructions <span className="optional-label">Optional</span>
                  <textarea
                    disabled={!isAllowed('medical.emergencyInstructions')}
                    rows={3}
                    {...form.register('medical.emergencyInstructions')}
                  />
                </label>
              ) : null}
              <p className="privacy-note form-grid__full">
                Medical information is restricted and is not included in ordinary staff student
                views.
              </p>
            </div>
          ) : null}
          {step === 5 ? (
            <div className="document-uploader">
              {requirementsQuery.isError ? (
                <ErrorState
                  title="Document requirements unavailable"
                  onRetry={() => void requirementsQuery.refetch()}
                />
              ) : null}
              <div>
                <h3>
                  Passport photograph <span aria-label="required">*</span>
                </h3>
                <p>Upload a clear JPEG or PNG image, no larger than 5 MB.</p>
              </div>
              {passport === undefined ? (
                <label className="upload-control">
                  Choose photograph
                  <input
                    accept="image/jpeg,image/png"
                    disabled={
                      !isAllowed('documents.passportPhotograph') ||
                      uploadProgress !== undefined ||
                      !requirementsQuery.isSuccess
                    }
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file !== undefined) void uploadPassport(file);
                    }}
                    type="file"
                  />
                </label>
              ) : (
                <div className="document-row">
                  <div>
                    <strong>{passport.displayName}</strong>
                    <span>
                      {(passport.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                      {passport.reviewStatus.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <DocumentViewButton documentId={passport.id} label="Preview" />
                  <label className="secondary-button">
                    Replace
                    <input
                      className="visually-hidden"
                      accept="image/jpeg,image/png"
                      disabled={
                        !isAllowed('documents.passportPhotograph') ||
                        uploadProgress !== undefined ||
                        !requirementsQuery.isSuccess
                      }
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file !== undefined) void uploadPassport(file);
                      }}
                      type="file"
                    />
                  </label>
                  <button
                    className="text-button text-button--danger"
                    disabled={
                      !isAllowed('documents.passportPhotograph') ||
                      removeDocumentMutation.isPending ||
                      uploadProgress !== undefined
                    }
                    onClick={() => {
                      removeDocumentMutation.mutate(passport.id);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              )}
              {uploadProgress === undefined ? null : (
                <progress aria-label="Upload progress" max={100} value={uploadProgress}>
                  {uploadProgress}%
                </progress>
              )}
              {uploadError === undefined ? null : <ErrorMessage error={uploadError} />}
              {removeDocumentMutation.isError ? (
                <ErrorMessage error={removeDocumentMutation.error} />
              ) : null}
            </div>
          ) : null}
          {step === 6 ? <Review registration={registration} values={form.getValues()} /> : null}
          {customFields.map((field) => (
            <CustomFieldInput
              disabled={!isAllowed(`customResponses.${field.key}`)}
              field={field}
              form={form}
              key={field.key}
            />
          ))}
          {saveMutation.isError || submitMutation.isError ? (
            <ErrorMessage error={saveMutation.error ?? submitMutation.error} />
          ) : null}
          <footer className="form-actions">
            {step > 0 ? (
              <button
                className="secondary-button"
                onClick={() => {
                  setStep((current) => current - 1);
                }}
                type="button"
              >
                Previous
              </button>
            ) : (
              <span />
            )}
            {step < steps.length - 1 ? (
              <button
                className="primary-button"
                disabled={saveMutation.isPending || uploadProgress !== undefined}
                type="submit"
              >
                Save and continue
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={
                  submitMutation.isPending || passport === undefined || uploadProgress !== undefined
                }
                onClick={() => {
                  if (
                    window.confirm(
                      'Submit this registration for administrative review? You cannot freely edit it after submission.',
                    )
                  )
                    submitMutation.mutate();
                }}
                type="button"
              >
                {registration.status === 'CHANGES_REQUESTED'
                  ? 'Resubmit corrections'
                  : 'Submit registration'}
              </button>
            )}
          </footer>
        </form>
      </div>
    </main>
  );
}

function Review({
  registration,
  values,
}: {
  registration: RegistrationDto;
  values: RegistrationDraftInput;
}) {
  const groups = useMemo(
    () => [
      [
        'Student',
        [values.personal.surname, values.personal.firstName, values.personal.middleName]
          .filter(Boolean)
          .join(' '),
      ],
      ['Date of birth', values.personal.dateOfBirth],
      ['Nationality', values.personal.nationality],
      ['Residential address', values.contact.residentialAddress],
      ['Primary guardian', values.guardian.fullName],
      ['Guardian phone', values.guardian.phone],
      ['Requested class', values.academic.requestedClassLevelCode],
      ['Requested track', values.academic.requestedTrackCode ?? 'Not applicable'],
      ['Passport photograph', registration.documents.length > 0 ? 'Uploaded' : 'Missing'],
    ],
    [registration.documents.length, values],
  );
  return (
    <div className="review-grid">
      {groups.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value ?? 'Not provided'}</strong>
        </div>
      ))}
      <p className="form-note review-grid__full">
        By submitting, you confirm that the information is accurate. The school will determine final
        academic placement.
      </p>
    </div>
  );
}

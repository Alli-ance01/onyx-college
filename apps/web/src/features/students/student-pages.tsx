import type { StudentDashboardDto, StudentProfileDto, SuccessEnvelope } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '../../lib/api/api-client.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { DocumentViewButton } from '../student-onboarding/document-view-button.js';

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('');
}

export function StudentDashboardPage() {
  const auth = useAuthSession();
  const query = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<StudentDashboardDto>>('/students/me/dashboard'))
        .data,
  });
  if (query.isLoading)
    return <main className="portal-content route-status">Loading your dashboard…</main>;
  if (query.isError || query.data === undefined)
    return (
      <main className="portal-content">
        <div className="form-alert form-alert--error">Your dashboard could not be loaded.</div>
      </main>
    );
  const student = query.data;
  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Student dashboard</p>
          <h1>Welcome, {student.studentName}</h1>
          <p>Your current institutional and academic details.</p>
        </div>
        <span className="status-badge status-badge--success">{student.lifecycleStatus}</span>
      </header>
      <section className="identity-panel surface">
        <div className="avatar" aria-hidden="true">
          {initials(student.studentName)}
        </div>
        <div>
          <span className="muted-label">Student ID</span>
          <strong className="student-id">{student.studentId}</strong>
          <p>
            {student.currentEnrollment === undefined
              ? 'Current placement unavailable'
              : `${student.currentEnrollment.classLevel.name}${student.currentEnrollment.track === undefined ? '' : ` · ${student.currentEnrollment.track.name}`}`}
          </p>
        </div>
        <dl>
          <div>
            <dt>Academic session</dt>
            <dd>{student.currentEnrollment?.session.label ?? 'Not available'}</dd>
          </div>
          <div>
            <dt>Current term</dt>
            <dd>{student.currentTerm?.name ?? 'Not active'}</dd>
          </div>
        </dl>
      </section>
      <section className="dashboard-grid">
        <EmptyModule
          title="Assignments"
          text="Published assignments will appear here when the Assignments module is introduced."
        />
        <EmptyModule
          title="Announcements"
          text="School announcements will appear here when available."
        />
        <EmptyModule
          title="Results"
          text="Published results and report cards will appear here when the Results module is introduced."
        />
      </section>
    </main>
  );
}

function EmptyModule({ text, title }: { text: string; title: string }) {
  return (
    <article className="empty-module surface">
      <span aria-hidden="true">—</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

const profileTabs = [
  'Overview',
  'Biodata',
  'Guardian Information',
  'Academic Information',
  'Academic History',
  'Documents',
] as const;

export function StudentProfilePage() {
  const auth = useAuthSession();
  const client = useQueryClient();
  const [tab, setTab] = useState<(typeof profileTabs)[number]>('Overview');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [field, setField] = useState('surname');
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['student-profile', 'mine'],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<StudentProfileDto>>('/students/me/profile'))
        .data,
  });
  const correction = useMutation({
    mutationFn: async () =>
      auth.apiClient.request('/students/me/profile-correction-requests', {
        body: { field, reason, requestedValue },
        method: 'POST',
      }),
    onSuccess: async () => {
      setCorrectionOpen(false);
      setReason('');
      setRequestedValue('');
      await client.invalidateQueries({ queryKey: ['student-profile', 'mine'] });
    },
  });
  if (query.isLoading) return <main className="portal-content route-status">Loading profile…</main>;
  if (query.data === undefined)
    return (
      <main className="portal-content">
        <div className="form-alert form-alert--error">Profile unavailable.</div>
      </main>
    );
  const profile = query.data;
  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Official student profile</p>
          <h1>{profile.studentName}</h1>
          <p>
            Authoritative records are read-only. Request a reviewed correction when something is
            wrong.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            setCorrectionOpen(true);
          }}
        >
          Request a correction
        </button>
      </header>
      <div className="tab-list" role="tablist">
        {profileTabs.map((item) => (
          <button
            aria-selected={tab === item}
            className={tab === item ? 'active' : ''}
            key={item}
            onClick={() => {
              setTab(item);
            }}
            role="tab"
          >
            {item}
          </button>
        ))}
      </div>
      <section className="profile-panel surface">
        {tab === 'Overview' ? (
          <>
            <div className="profile-identity">
              <div className="avatar avatar--large">{initials(profile.studentName)}</div>
              <div>
                <h2>{profile.studentName}</h2>
                <strong className="student-id">{profile.studentId}</strong>
                <p>
                  {profile.currentEnrollment?.classLevel.name ?? 'No current placement'}
                  {profile.currentEnrollment?.track === undefined
                    ? ''
                    : ` · ${profile.currentEnrollment.track.name}`}
                </p>
              </div>
            </div>
            {profile.medical === undefined || Object.keys(profile.medical).length === 0 ? null : (
              <div className="privacy-note">
                <strong>Your medical/emergency information</strong>
                <p>
                  {Object.entries(profile.medical)
                    .map(([key, value]) => `${key.replaceAll(/([A-Z])/gu, ' $1')}: ${value}`)
                    .join(' · ')}
                </p>
              </div>
            )}
            <h3>Correction requests</h3>
            <div className="record-list">
              {profile.correctionRequests.length === 0 ? (
                <p className="empty-copy">No correction requests.</p>
              ) : (
                profile.correctionRequests.map((item) => (
                  <div key={item.id}>
                    <strong>{item.field}</strong>
                    <span>{item.status.replaceAll('_', ' ')}</span>
                    <p>{item.requestedValue}</p>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
        {tab === 'Biodata' ? <DefinitionGrid entries={Object.entries(profile.biodata)} /> : null}
        {tab === 'Guardian Information' ? (
          <div className="record-list">
            {profile.guardians.map((guardian) => (
              <div key={`${guardian.fullName}-${guardian.phone}`}>
                <strong>{guardian.fullName}</strong>
                <span>
                  {guardian.relationship}
                  {guardian.primary ? ' · Primary' : ''}
                </span>
                <p>
                  {guardian.phone}
                  {guardian.emergencyContact ? ' · Emergency contact' : ''}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {tab === 'Academic Information' ? (
          <DefinitionGrid
            entries={[
              ['currentClass', profile.currentEnrollment?.classLevel.name],
              ['track', profile.currentEnrollment?.track?.name],
              ['session', profile.currentEnrollment?.session.label],
              ['term', profile.currentTerm?.name],
            ]}
          />
        ) : null}
        {tab === 'Academic History' ? (
          <div className="record-list">
            {profile.academicHistory.map((item) => (
              <div key={item.id}>
                <strong>{item.session.label}</strong>
                <span>{item.status}</span>
                <p>
                  {item.classLevel.name}
                  {item.track === undefined ? '' : ` · ${item.track.name}`}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {tab === 'Documents' ? (
          <div className="record-list">
            {profile.documents.map((document) => (
              <div key={document.id}>
                <strong>{document.displayName}</strong>
                <span>{document.reviewStatus.replaceAll('_', ' ')}</span>
                <p>
                  Version {document.version} · {(document.sizeBytes / 1024).toFixed(0)} KB
                </p>
                <DocumentViewButton documentId={document.id} />
              </div>
            ))}
          </div>
        ) : null}
      </section>
      {correctionOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-modal="true" className="dialog surface" role="dialog">
            <h2>Request an official correction</h2>
            <p>The school reviews every request. This does not immediately change your profile.</p>
            <label>
              Field
              <select
                value={field}
                onChange={(event) => {
                  setField(event.target.value);
                }}
              >
                <option value="surname">Surname</option>
                <option value="firstName">First name</option>
                <option value="middleName">Middle name</option>
                <option value="dateOfBirth">Date of birth</option>
                <option value="gender">Gender</option>
                <option value="nationality">Nationality</option>
                <option value="stateOfOrigin">State of origin</option>
                <option value="lga">LGA</option>
                <option value="residentialAddress">Residential address</option>
              </select>
            </label>
            <label>
              Requested value
              <input
                value={requestedValue}
                onChange={(event) => {
                  setRequestedValue(event.target.value);
                }}
              />
            </label>
            <label>
              Reason
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </label>
            {correction.isError ? (
              <div className="field-error">
                {correction.error instanceof ApiClientError
                  ? correction.error.message
                  : 'Request failed.'}
              </div>
            ) : null}
            <footer className="form-actions">
              <button
                className="text-button"
                onClick={() => {
                  setCorrectionOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={reason.length < 5 || requestedValue.length === 0 || correction.isPending}
                onClick={() => {
                  correction.mutate();
                }}
              >
                Submit request
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function DefinitionGrid({ entries }: { entries: [string, unknown][] }) {
  return (
    <dl className="definition-grid">
      {entries
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => (
          <div key={key}>
            <dt>{key.replaceAll(/([A-Z])/gu, ' $1')}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
    </dl>
  );
}

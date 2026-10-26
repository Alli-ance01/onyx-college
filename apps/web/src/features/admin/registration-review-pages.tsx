/**
 * AdminRegistrationReviewPage — Phase 3 refactor.
 *
 * Improvements over the original inline decision panel:
 *  1. Grouped, labelled correction field checklist (replaces free-text CSV input).
 *  2. Explicit confirmation modals for all destructive/irreversible actions:
 *     - Approve: shows applicant name, resolved class/track, session, and next Student ID slot.
 *     - Reject: requires reason ≥ 10 chars.
 *     - Reopen: requires reason.
 *  3. Machine-string-free review history and document status (uses statusLabel).
 *  4. DataTable for registration queue.
 *  5. Button / StatusBadge components throughout.
 */
import type { AcademicSetupDto, RegistrationDto, SuccessEnvelope } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { resolveErrorMessage } from '../../shared/error-messages.js';
import {
  Button,
  DataTable,
  ErrorState,
  LoadingState,
  StatusBadge,
  useToast,
} from '../../shared/ui/index.js';
import { formatStatusLabel } from '../../shared/ui/status-label.js';
import { DocumentViewButton } from '../student-onboarding/document-view-button.js';

// ─── constants ───────────────────────────────────────────────────────────────

const REGISTRATION_FILTERS = [
  'ALL',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'REJECTED',
  'APPROVED',
  'DUPLICATE_REVIEW',
] as const;

/**
 * All correctable field paths, grouped by section.
 * Each entry: [path, human label].
 */
const CORRECTION_FIELD_GROUPS: {
  label: string;
  fields: [string, string][];
}[] = [
  {
    label: 'Personal',
    fields: [
      ['personal.surname', 'Surname'],
      ['personal.firstName', 'First name'],
      ['personal.middleName', 'Middle name'],
      ['personal.dateOfBirth', 'Date of birth'],
      ['personal.gender', 'Gender'],
      ['personal.nationality', 'Nationality'],
      ['personal.stateOfOrigin', 'State of origin'],
      ['personal.lga', 'Local government area'],
    ],
  },
  {
    label: 'Contact',
    fields: [
      ['contact.phone', 'Phone number'],
      ['contact.email', 'Email'],
      ['contact.residentialAddress', 'Residential address'],
    ],
  },
  {
    label: 'Guardian',
    fields: [
      ['guardian.fullName', 'Full name'],
      ['guardian.relationship', 'Relationship'],
      ['guardian.phone', 'Phone'],
      ['guardian.alternatePhone', 'Alternate phone'],
      ['guardian.email', 'Email'],
      ['guardian.occupation', 'Occupation'],
      ['guardian.address', 'Address'],
      ['guardian.emergencyContact', 'Emergency contact'],
    ],
  },
  {
    label: 'Medical',
    fields: [
      ['medical.bloodGroup', 'Blood group'],
      ['medical.genotype', 'Genotype'],
      ['medical.allergies', 'Allergies'],
      ['medical.medicalConditions', 'Medical conditions'],
    ],
  },
  {
    label: 'Requested placement',
    fields: [
      ['academic.requestedClassLevelCode', 'Class level'],
      ['academic.requestedTrackCode', 'Track'],
    ],
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function apiError(error: unknown): string {
  return resolveErrorMessage(error, {
    action: 'complete registration review',
    entity: 'registration',
  });
}

function camelToWords(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

// ─── queue page ──────────────────────────────────────────────────────────────

export function AdminRegistrationQueuePage() {
  const auth = useAuthSession();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'SUBMITTED';
  const q = params.get('q') ?? '';

  const query = useQuery({
    queryKey: ['admin-registrations', status, q],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (status === 'DUPLICATE_REVIEW') search.set('filter[duplicateReview]', 'true');
      else if (status !== 'ALL') search.set('filter[status]', status);
      if (q !== '') search.set('q', q);
      return (
        await auth.apiClient.request<SuccessEnvelope<RegistrationDto[]>>(
          `/student-registrations?${search.toString()}`,
        )
      ).data;
    },
  });

  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Students · Admissions</p>
          <h1>Registration review</h1>
          <p>
            Review submitted applications, corrections, decisions, and possible duplicate cases.
          </p>
        </div>
      </header>

      {/* Filter tabs */}
      <div className="filter-tabs">
        {REGISTRATION_FILTERS.map((item) => (
          <button
            className={status === item ? 'active' : ''}
            key={item}
            type="button"
            onClick={() => {
              setParams({ status: item });
            }}
          >
            {formatStatusLabel(item)}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="toolbar surface">
        <label className="search-field">
          Search applicants
          <input
            defaultValue={q}
            onKeyDown={(event) => {
              if (event.key === 'Enter')
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('q', event.currentTarget.value);
                  return next;
                });
            }}
            placeholder="Name"
          />
        </label>
      </div>

      <DataTable
        caption="Registration queue"
        columns={[
          {
            header: 'Applicant',
            id: 'name',
            render: (row) => (
              <>
                <strong>
                  {row.data.personal.firstName} {row.data.personal.surname}
                </strong>
                <small className="table-secondary">{row.data.guardian.phone}</small>
              </>
            ),
          },
          {
            header: 'Placement requested',
            id: 'placement',
            render: (row) =>
              [row.data.academic.requestedClassLevelCode, row.data.academic.requestedTrackCode]
                .filter(Boolean)
                .join(' / ') || '—',
          },
          {
            header: 'Status',
            id: 'status',
            render: (row) => <StatusBadge status={row.status} />,
          },
          {
            header: 'Duplicate flag',
            id: 'dup',
            render: (row) =>
              row.duplicateReview.requiresReview ? (
                <span className="warning-text">Review required</span>
              ) : (
                'Clear'
              ),
          },
          {
            header: 'Submitted',
            id: 'submitted',
            render: (row) =>
              row.submittedAt === undefined
                ? 'Not submitted'
                : new Date(row.submittedAt).toLocaleDateString(),
          },
          {
            header: '',
            id: 'open',
            align: 'end',
            render: (row) => (
              <Link to={`/admin/students/registrations/${row.id}`}>Open review</Link>
            ),
          },
        ]}
        error={query.isError}
        getRowKey={(row) => row.id}
        loading={query.isLoading}
        onRetry={() => void query.refetch()}
        rows={query.data ?? []}
      />
    </main>
  );
}

// ─── correction checklist ────────────────────────────────────────────────────

function CorrectionChecklist({
  selected,
  onChange,
}: {
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
}) {
  function toggle(path: string) {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onChange(next);
  }

  return (
    <fieldset className="correction-checklist">
      <legend className="correction-checklist__legend">Fields requiring correction</legend>
      {CORRECTION_FIELD_GROUPS.map((group) => (
        <div className="correction-checklist__group" key={group.label}>
          <p className="correction-checklist__group-label">{group.label}</p>
          <div className="correction-checklist__fields">
            {group.fields.map(([path, label]) => (
              <label className="checkbox-field" key={path}>
                <input
                  checked={selected.has(path)}
                  type="checkbox"
                  onChange={() => {
                    toggle(path);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

// ─── confirmation dialogs ────────────────────────────────────────────────────

type DialogKind = 'approve' | 'reject' | 'reopen' | null;

interface ApproveDialogProps {
  registration: RegistrationDto;
  academic: AcademicSetupDto;
  classLevelId: string;
  trackId: string;
  error?: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

function ApproveDialog({
  registration,
  academic,
  classLevelId,
  trackId,
  error,
  onConfirm,
  onCancel,
  isPending,
}: ApproveDialogProps) {
  const name = [registration.data.personal.firstName, registration.data.personal.surname]
    .filter(Boolean)
    .join(' ');
  const classLevel = academic.classLevels.find((c) => c.id === classLevelId);
  const track = academic.tracks.find((t) => t.id === trackId);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <section aria-modal="true" className="dialog surface" role="dialog">
        <h2 className="review-dialog__title">Confirm approval</h2>
        <p className="review-dialog__body">
          You are about to permanently approve this application and create an Onyx College student
          record. This action cannot be undone.
        </p>
        <dl className="review-dialog__summary">
          <div>
            <dt>Applicant</dt>
            <dd>
              <strong>{name}</strong>
            </dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{academic.activeSession?.label ?? '—'}</dd>
          </div>
          <div>
            <dt>Class level</dt>
            <dd>{classLevel?.name ?? '—'}</dd>
          </div>
          {track !== undefined ? (
            <div>
              <dt>Track</dt>
              <dd>{track.name}</dd>
            </div>
          ) : null}
          <div>
            <dt>Student ID</dt>
            <dd className="review-dialog__id-note">
              A permanent ONYX/XXXX ID will be assigned automatically.
            </dd>
          </div>
        </dl>
        {error !== undefined ? (
          <p className="form-alert form-alert--error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="review-dialog__actions">
          <Button loading={isPending} loadingLabel="Approving…" onClick={onConfirm}>
            Approve and create student
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}

interface ReasonDialogProps {
  title: string;
  body: string;
  actionLabel: string;
  variant: 'primary' | 'danger';
  reason: string;
  minLength: number;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  error?: string | undefined;
}

function ReasonDialog({
  title,
  body,
  actionLabel,
  variant,
  reason,
  minLength,
  onReasonChange,
  onConfirm,
  onCancel,
  isPending,
  error,
}: ReasonDialogProps) {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <section aria-modal="true" className="dialog surface" role="dialog">
        <h2 className="review-dialog__title">{title}</h2>
        <p className="review-dialog__body">{body}</p>
        <label>
          Reason
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => {
              onReasonChange(e.target.value);
            }}
          />
        </label>
        {error !== undefined ? (
          <p className="form-alert form-alert--error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="review-dialog__actions">
          <Button
            disabled={reason.trim().length < minLength}
            loading={isPending}
            loadingLabel="Working…"
            variant={variant}
            onClick={onConfirm}
          >
            {actionLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}

// ─── review page ──────────────────────────────────────────────────────────────

export function AdminRegistrationReviewPage() {
  const { registrationId = '' } = useParams();
  const auth = useAuthSession();
  const client = useQueryClient();
  const { toast } = useToast();

  // Dialog state
  const [openDialog, setOpenDialog] = useState<DialogKind>(null);
  const [dialogReason, setDialogReason] = useState('');

  // Correction checklist state
  const [correctionFields, setCorrectionFields] = useState<ReadonlySet<string>>(new Set());
  const [correctionNote, setCorrectionNote] = useState('');

  // Approval placement state
  const [classLevelId, setClassLevelId] = useState('');
  const [trackId, setTrackId] = useState('');

  const query = useQuery({
    queryKey: ['admin-registration', registrationId],
    queryFn: async () =>
      (
        await auth.apiClient.request<SuccessEnvelope<RegistrationDto>>(
          `/student-registrations/${registrationId}`,
        )
      ).data,
  });

  const academic = useQuery({
    queryKey: ['academic-setup'],
    queryFn: async () =>
      (await auth.apiClient.request<SuccessEnvelope<AcademicSetupDto>>('/academic-setup')).data,
  });

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['admin-registration', registrationId] });
    await client.invalidateQueries({ queryKey: ['admin-registrations'] });
  };

  const command = useMutation({
    mutationFn: async ({
      body,
      path,
      headers,
    }: {
      body?: unknown;
      headers?: HeadersInit;
      path: string;
    }) =>
      auth.apiClient.request(`/student-registrations/${registrationId}/${path}`, {
        ...(body === undefined ? {} : { body }),
        ...(headers === undefined ? {} : { headers }),
        method: 'POST',
      }),
    onSuccess: async (_, vars) => {
      setOpenDialog(null);
      setDialogReason('');
      await refresh();
      if (vars.path === 'approve') {
        toast({
          tone: 'success',
          title: 'Student application approved',
          description: 'Official student record created and permanent Student ID assigned.',
        });
      } else if (vars.path === 'reject') {
        toast({
          tone: 'warning',
          title: 'Application rejected',
          description: 'Rejection decision has been saved.',
        });
      } else if (vars.path === 'request-changes') {
        toast({
          tone: 'info',
          title: 'Changes requested',
          description: 'Correction notification sent to applicant.',
        });
      } else if (vars.path === 'reopen') {
        toast({
          tone: 'info',
          title: 'Registration reopened',
          description: 'Application returned to under review status.',
        });
      }
    },
    onError: (err) => {
      toast({
        tone: 'danger',
        title: 'Action failed',
        description: apiError(err),
      });
    },
  });

  const documentReview = useMutation({
    mutationFn: async ({
      documentId,
      status,
    }: {
      documentId: string;
      status: 'REJECTED' | 'VERIFIED';
    }) =>
      auth.apiClient.request(`/student-documents/${documentId}/review`, {
        body: { status },
        method: 'POST',
      }),
    onSuccess: async (_, vars) => {
      toast({
        tone: vars.status === 'VERIFIED' ? 'success' : 'warning',
        title: vars.status === 'VERIFIED' ? 'Document verified' : 'Document rejected',
        description: `Document review status updated to ${vars.status.toLowerCase()}.`,
      });
      await refresh();
    },
    onError: (err) => {
      toast({
        tone: 'danger',
        title: 'Document review failed',
        description: apiError(err),
      });
    },
  });

  if (query.isLoading) return <LoadingState label="Loading registration" rows={6} />;
  if (query.data === undefined) return <ErrorState title="Registration unavailable" />;

  const registration = query.data;
  const isSenior =
    academic.data?.classLevels.find(({ id }) => id === classLevelId)?.stage === 'SENIOR';
  const canApprove =
    academic.data?.activeSession !== undefined &&
    classLevelId !== '' &&
    (!isSenior || trackId !== '');
  const actionError = command.error !== null ? apiError(command.error) : undefined;

  return (
    <main className="portal-content product-page">
      <header className="page-heading">
        <div>
          <Link className="back-link" to="/admin/students/registrations">
            ← Registration queue
          </Link>
          <p className="eyebrow">Application review</p>
          <h1>
            {registration.data.personal.firstName} {registration.data.personal.surname}
          </h1>
          <p className="review-app-id">Application {registration.id}</p>
        </div>
        <StatusBadge status={registration.status} />
      </header>

      {registration.duplicateReview.requiresReview ? (
        <p className="form-alert form-alert--warning">
          <strong>Possible duplicate:</strong> a strong deterministic candidate match requires an
          explicit resolution before approval.
        </p>
      ) : null}

      <div className="review-layout">
        {/* ── left: data sections ───────────────────────────────────── */}
        <div className="review-sections">
          <ReviewSection title="Personal information" entries={registration.data.personal} />
          <ReviewSection title="Contact information" entries={registration.data.contact} />
          <ReviewSection title="Guardian" entries={registration.data.guardian} />
          <ReviewSection title="Requested placement" entries={registration.data.academic} />
          {auth.principal?.permissions.includes('students.read_sensitive') ? (
            <ReviewSection title="Medical / emergency" entries={registration.data.medical} />
          ) : null}

          {/* Documents */}
          <section className="review-section surface">
            <h2>Documents</h2>
            {registration.documents.length === 0 ? (
              <p className="empty-copy">No documents uploaded.</p>
            ) : (
              registration.documents.map((document) => (
                <div className="document-row" key={document.id}>
                  <div>
                    <strong>{document.displayName}</strong>
                    <span className="table-secondary">
                      <StatusBadge status={document.reviewStatus} withDot={false} /> ·{' '}
                      {(document.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  {auth.principal?.permissions.some((p) =>
                    ['documents.read', 'documents.review'].includes(p),
                  ) ? (
                    <DocumentViewButton documentId={document.id} />
                  ) : null}
                  {auth.principal?.permissions.includes('documents.review') ? (
                    <div className="row-actions">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          documentReview.mutate({ documentId: document.id, status: 'VERIFIED' });
                        }}
                      >
                        Verify
                      </button>
                      <button
                        className="text-button text-button--danger"
                        type="button"
                        onClick={() => {
                          documentReview.mutate({ documentId: document.id, status: 'REJECTED' });
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </section>

          {/* Submission history */}
          <section className="review-section surface">
            <h2>Submission history</h2>
            <div className="timeline">
              {registration.reviewHistory.map((event, index) => (
                <div key={`${event.at}-${String(index)}`}>
                  <strong>{formatStatusLabel(event.action)}</strong>
                  <time>{new Date(event.at).toLocaleString()}</time>
                  {event.note === undefined ? null : <p>{event.note}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── right: decision panel ─────────────────────────────────── */}
        <aside className="decision-panel surface">
          <h2>Review actions</h2>

          {actionError !== undefined ? (
            <p className="form-alert form-alert--error" role="alert">
              {actionError}
            </p>
          ) : null}

          {/* Begin review */}
          {registration.status === 'SUBMITTED' ? (
            <Button
              loading={command.isPending}
              loadingLabel="Starting review…"
              onClick={() => {
                command.mutate({ path: 'start-review' });
              }}
            >
              Begin review
            </Button>
          ) : null}

          {/* Reopen (from REJECTED) */}
          {registration.status === 'REJECTED' ? (
            <Button
              onClick={() => {
                setDialogReason('');
                setOpenDialog('reopen');
              }}
            >
              Reopen registration
            </Button>
          ) : null}

          {/* UNDER_REVIEW decision panel */}
          {registration.status === 'UNDER_REVIEW' ? (
            <>
              {/* Request changes — grouped checklist */}
              <div className="decision-subsection">
                <h3>Request corrections</h3>
                <label className="decision-note-label">
                  Reviewer note
                  <textarea
                    rows={2}
                    value={correctionNote}
                    onChange={(e) => {
                      setCorrectionNote(e.target.value);
                    }}
                  />
                </label>
                <CorrectionChecklist selected={correctionFields} onChange={setCorrectionFields} />
                <Button
                  disabled={correctionFields.size === 0 || correctionNote.trim().length < 5}
                  loading={command.isPending}
                  loadingLabel="Sending…"
                  variant="secondary"
                  onClick={() => {
                    command.mutate({
                      body: {
                        allowedCorrectionFields: [...correctionFields],
                        note: correctionNote,
                      },
                      path: 'request-changes',
                    });
                  }}
                >
                  Request changes ({correctionFields.size} field
                  {correctionFields.size !== 1 ? 's' : ''})
                </Button>
              </div>

              <hr />

              {/* Reject */}
              <Button
                variant="danger"
                onClick={() => {
                  setDialogReason('');
                  setOpenDialog('reject');
                }}
              >
                Reject registration
              </Button>

              {/* Duplicate resolution */}
              {registration.duplicateReview.requiresReview &&
              registration.duplicateReview.resolution === undefined ? (
                <div className="decision-subsection">
                  <h3>Duplicate resolution</h3>
                  <div className="form-grid">
                    {(
                      [
                        ['CONFIRMED_DISTINCT', 'Confirm distinct applicant', 'secondary'],
                        ['ORIGINAL_REOPENED', 'Reopen rejected original', 'secondary'],
                        ['DUPLICATE_REJECTED', 'Reject duplicate attempt', 'danger'],
                      ] as const
                    ).map(([resolution, label, variant]) => (
                      <Button
                        key={resolution}
                        variant={variant}
                        onClick={() => {
                          command.mutate({
                            body: { reason: correctionNote, resolution },
                            path: 'resolve-duplicate',
                          });
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <hr />

              {/* Approve */}
              <div className="decision-subsection">
                <h3>Authoritative placement</h3>
                {academic.data?.activeSession === undefined ? (
                  <p className="warning-text">
                    Set up an active academic session before approving.
                  </p>
                ) : (
                  <p>
                    <strong>{academic.data.activeSession.label}</strong>
                  </p>
                )}
                <label>
                  Class level
                  <select
                    value={classLevelId}
                    onChange={(e) => {
                      setClassLevelId(e.target.value);
                      setTrackId('');
                    }}
                  >
                    <option value="">Select</option>
                    {academic.data?.classLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </label>
                {isSenior ? (
                  <label>
                    Senior track
                    <select
                      value={trackId}
                      onChange={(e) => {
                        setTrackId(e.target.value);
                      }}
                    >
                      <option value="">Select</option>
                      {academic.data?.tracks.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <Button
                  disabled={!canApprove}
                  onClick={() => {
                    setOpenDialog('approve');
                  }}
                >
                  Approve and create student
                </Button>
              </div>
            </>
          ) : null}
        </aside>
      </div>

      {/* ── Approval confirmation dialog ─────────────────────────── */}
      {openDialog === 'approve' && academic.data !== undefined ? (
        <ApproveDialog
          academic={academic.data}
          classLevelId={classLevelId}
          error={actionError}
          isPending={command.isPending}
          registration={registration}
          trackId={trackId}
          onCancel={() => {
            setOpenDialog(null);
          }}
          onConfirm={() => {
            command.mutate({
              body: {
                academicSessionId: academic.data.activeSession?.id,
                classLevelId,
                ...(isSenior ? { trackId } : {}),
              },
              headers: { 'Idempotency-Key': crypto.randomUUID() },
              path: 'approve',
            });
          }}
        />
      ) : null}

      {/* ── Reject confirmation dialog ────────────────────────────── */}
      {openDialog === 'reject' ? (
        <ReasonDialog
          actionLabel="Reject registration"
          body="This will permanently reject the application. The applicant will not be enrolled. Provide a clear reason."
          error={actionError}
          isPending={command.isPending}
          minLength={10}
          reason={dialogReason}
          title="Confirm rejection"
          variant="danger"
          onCancel={() => {
            setOpenDialog(null);
          }}
          onConfirm={() => {
            command.mutate({ body: { note: dialogReason }, path: 'reject' });
          }}
          onReasonChange={setDialogReason}
        />
      ) : null}

      {/* ── Reopen confirmation dialog ────────────────────────────── */}
      {openDialog === 'reopen' ? (
        <ReasonDialog
          actionLabel="Reopen registration"
          body="Reopening returns this application to UNDER_REVIEW. Provide a reason."
          error={actionError}
          isPending={command.isPending}
          minLength={5}
          reason={dialogReason}
          title="Reopen registration"
          variant="primary"
          onCancel={() => {
            setOpenDialog(null);
          }}
          onConfirm={() => {
            command.mutate({ body: { note: dialogReason }, path: 'reopen' });
          }}
          onReasonChange={setDialogReason}
        />
      ) : null}
    </main>
  );
}

// ─── shared review section ────────────────────────────────────────────────────

function ReviewSection({ entries, title }: { entries: Record<string, unknown>; title: string }) {
  return (
    <section className="review-section surface">
      <h2>{title}</h2>
      <dl className="definition-grid">
        {Object.entries(entries)
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([key, value]) => (
            <div key={key}>
              <dt>{camelToWords(key)}</dt>
              <dd>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

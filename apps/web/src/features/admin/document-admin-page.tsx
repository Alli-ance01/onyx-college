import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { ApiClientError } from '../../lib/api/index.js';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { formText } from '../../shared/forms/form-data.js';
import { DocumentViewButton } from '../student-onboarding/document-view-button.js';
import {
  Button,
  DataTable,
  FormField,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import {
  adminApi,
  adminQueryKeys,
  type DocumentRequirementAdminSummary,
  type StudentDocumentAdminSummary,
} from './admin-api.js';

export function AdminDocumentsPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<StudentDocumentAdminSummary>();
  const [note, setNote] = useState('');
  const requirements = useQuery({
    queryFn: () => adminApi.documentRequirements(auth.apiClient),
    queryKey: [...adminQueryKeys.documents, 'requirements'],
  });
  const documents = useQuery({
    queryFn: () => adminApi.studentDocuments(auth.apiClient),
    queryKey: [...adminQueryKeys.documents, 'submissions'],
  });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.createDocumentRequirement>[1]) =>
      adminApi.createDocumentRequirement(auth.apiClient, input),
    onSuccess: async () =>
      cache.invalidateQueries({ queryKey: [...adminQueryKeys.documents, 'requirements'] }),
  });
  const review = useMutation({
    mutationFn: (status: 'REJECTED' | 'VERIFIED') =>
      selected === undefined
        ? Promise.reject(new Error('No document selected.'))
        : adminApi.reviewDocument(auth.apiClient, selected.id, {
            status,
            ...(note === '' ? {} : { note }),
          }),
    onSuccess: async () => {
      setSelected(undefined);
      setNote('');
      await cache.invalidateQueries({ queryKey: [...adminQueryKeys.documents, 'submissions'] });
    },
  });

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = formText(form, 'description');
    create.mutate({
      acceptedMimeTypes: form.getAll('acceptedMimeTypes').map(String) as (
        'application/pdf' | 'image/jpeg' | 'image/png'
      )[],
      code: formText(form, 'code'),
      label: formText(form, 'label'),
      maximumBytes: Number(form.get('maximumMegabytes') ?? 5) * 1024 * 1024,
      requiredForRegistration: form.get('requiredForRegistration') === 'on',
      ...(description === '' ? {} : { description }),
    });
    event.currentTarget.reset();
  }
  const createError = create.error instanceof ApiClientError ? create.error.message : undefined;
  const reviewError = review.error instanceof ApiClientError ? review.error.message : undefined;
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Configure required registration documents and review private uploads through authorized access."
        eyebrow="Private files"
        title="Documents"
      />
      <Panel title="Add document requirement">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="document-code" label="Code">
              <input name="code" placeholder="BIRTH_CERTIFICATE" required />
            </FormField>
            <FormField controlId="document-label" label="Label">
              <input name="label" required />
            </FormField>
            <FormField controlId="document-size" label="Maximum size (MB)">
              <input
                defaultValue="5"
                max="25"
                min="1"
                name="maximumMegabytes"
                required
                type="number"
              />
            </FormField>
          </div>
          <FormField controlId="document-description" label="Description" optional>
            <textarea name="description" rows={2} />
          </FormField>
          <fieldset className="checkbox-group">
            <legend>Allowed files</legend>
            <label>
              <input
                defaultChecked
                name="acceptedMimeTypes"
                type="checkbox"
                value="application/pdf"
              />{' '}
              PDF
            </label>
            <label>
              <input defaultChecked name="acceptedMimeTypes" type="checkbox" value="image/jpeg" />{' '}
              JPEG
            </label>
            <label>
              <input defaultChecked name="acceptedMimeTypes" type="checkbox" value="image/png" />{' '}
              PNG
            </label>
            <label>
              <input name="requiredForRegistration" type="checkbox" /> Required before submission
            </label>
          </fieldset>
          {createError === undefined ? null : (
            <p className="form-alert form-alert--error">{createError}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Add requirement
          </Button>
        </form>
      </Panel>
      <DataTable<DocumentRequirementAdminSummary>
        caption="Document requirements"
        columns={[
          {
            header: 'Requirement',
            id: 'requirement',
            render: (row) => (
              <>
                <strong>{row.label}</strong>
                <small className="table-secondary">{row.code}</small>
              </>
            ),
          },
          {
            header: 'Allowed files',
            id: 'files',
            render: (row) => row.acceptedMimeTypes.join(', '),
          },
          {
            header: 'Limit',
            id: 'limit',
            render: (row) => `${(row.maximumBytes / 1024 / 1024).toFixed(0)} MB`,
          },
          {
            header: 'Registration',
            id: 'required',
            render: (row) =>
              row.requiredForRegistration ? (
                <StatusBadge tone="warning">Required</StatusBadge>
              ) : (
                'Optional'
              ),
          },
          {
            header: 'Status',
            id: 'status',
            render: (row) => (
              <StatusBadge tone={row.active ? 'success' : 'neutral'}>
                {row.active ? 'ACTIVE' : 'INACTIVE'}
              </StatusBadge>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        loading={requirements.isPending}
        rows={requirements.data ?? []}
      />
      {selected === undefined ? null : (
        <Panel
          description={`${selected.requirement.label} / ${selected.mimeType} / ${(selected.sizeBytes / 1024).toFixed(0)} KB`}
          title={`Review ${selected.ownerName}`}
        >
          <DocumentViewButton documentId={selected.id} label="Open protected file" />
          <FormField controlId="document-review-note" label="Review note" optional>
            <textarea
              onChange={(event) => {
                setNote(event.target.value);
              }}
              rows={2}
              value={note}
            />
          </FormField>
          {reviewError === undefined ? null : (
            <p className="form-alert form-alert--error">{reviewError}</p>
          )}
          <div className="form-actions">
            <Button
              loading={review.isPending}
              onClick={() => {
                review.mutate('VERIFIED');
              }}
            >
              Verify
            </Button>
            <Button
              disabled={note.trim().length < 5}
              loading={review.isPending}
              onClick={() => {
                review.mutate('REJECTED');
              }}
              variant="danger"
            >
              Reject
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
        </Panel>
      )}
      <DataTable<StudentDocumentAdminSummary>
        caption="Student documents"
        columns={[
          {
            header: 'Student',
            id: 'student',
            render: (row) => (
              <>
                <strong>{row.ownerName}</strong>
                <small className="table-secondary">{row.registrationId}</small>
              </>
            ),
          },
          {
            header: 'Document',
            id: 'document',
            render: (row) => (
              <>
                <strong>{row.requirement.label}</strong>
                <small className="table-secondary">{row.displayName}</small>
              </>
            ),
          },
          { header: 'Storage', id: 'storage', render: (row) => row.provider },
          {
            header: 'Review',
            id: 'review',
            render: (row) => (
              <StatusBadge
                tone={
                  row.reviewStatus === 'VERIFIED'
                    ? 'success'
                    : row.reviewStatus === 'REJECTED'
                      ? 'danger'
                      : 'warning'
                }
              >
                {row.reviewStatus}
              </StatusBadge>
            ),
          },
          {
            header: '',
            id: 'action',
            align: 'end',
            render: (row) => (
              <Button
                onClick={() => {
                  setSelected(row);
                }}
                variant="secondary"
              >
                Review
              </Button>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        loading={documents.isPending}
        rows={documents.data ?? []}
      />
    </main>
  );
}

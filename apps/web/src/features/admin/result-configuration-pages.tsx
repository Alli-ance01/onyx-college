import type { AssessmentSchemeDto, GradingSchemeDto } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

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

interface ComponentDraft {
  key: string;
  label: string;
  maximum: string;
}
interface BandDraft {
  grade: string;
  maximumPercentage: string;
  minimumPercentage: string;
  remark: string;
}

function errorMessage(error: Error | null): string | undefined {
  if (error === null) return undefined;
  return error instanceof ApiClientError ? error.message : 'The configuration could not be saved.';
}

export function AdminAssessmentSchemesPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [components, setComponents] = useState<ComponentDraft[]>([
    { key: 'CA', label: 'Continuous Assessment', maximum: '40' },
    { key: 'EXAM', label: 'Exam', maximum: '60' },
  ]);
  const sessions = useQuery({
    queryFn: () => adminApi.sessions(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'sessions'],
  });
  const schemes = useQuery({
    queryFn: () => adminApi.assessmentSchemes(auth.apiClient),
    queryKey: [...adminQueryKeys.resultConfiguration, 'assessment'],
  });
  const refresh = async () =>
    cache.invalidateQueries({ queryKey: adminQueryKeys.resultConfiguration });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.createAssessmentScheme>[1]) =>
      adminApi.createAssessmentScheme(auth.apiClient, input),
    onSuccess: refresh,
  });
  const activate = useMutation({
    mutationFn: (id: string) => adminApi.activateAssessmentScheme(auth.apiClient, id),
    onSuccess: refresh,
  });
  function update(index: number, field: keyof ComponentDraft, value: string) {
    setComponents((current) =>
      current.map((item, position) => (position === index ? { ...item, [field]: value } : item)),
    );
  }
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const totalMaximum = components
      .reduce((sum, item) => sum + Number(item.maximum || 0), 0)
      .toFixed(2)
      .replace(/\.00$/u, '');
    create.mutate({
      academicSessionId: formText(form, 'academicSessionId'),
      code: formText(form, 'code'),
      components,
      name: formText(form, 'name'),
      totalMaximum,
    });
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Set the assessment components and maximum marks used when teachers enter results."
        eyebrow="Results configuration"
        title="Assessment schemes"
      />
      <Panel title="New assessment scheme">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="assessment-session" label="Session">
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
            <FormField controlId="assessment-code" label="Code">
              <input name="code" required />
            </FormField>
            <FormField controlId="assessment-name" label="Name">
              <input name="name" required />
            </FormField>
          </div>
          <div className="configuration-list">
            <h3>Assessment components</h3>
            {components.map((component, index) => (
              <div className="configuration-row" key={component.key + '-' + String(index)}>
                <input
                  aria-label={`Component ${String(index + 1)} key`}
                  onChange={(event) => {
                    update(index, 'key', event.target.value);
                  }}
                  placeholder="Key"
                  required
                  value={component.key}
                />
                <input
                  aria-label={`Component ${String(index + 1)} label`}
                  onChange={(event) => {
                    update(index, 'label', event.target.value);
                  }}
                  placeholder="Label"
                  required
                  value={component.label}
                />
                <input
                  aria-label={`Component ${String(index + 1)} maximum`}
                  inputMode="decimal"
                  onChange={(event) => {
                    update(index, 'maximum', event.target.value);
                  }}
                  placeholder="Maximum"
                  required
                  value={component.maximum}
                />
                <Button
                  disabled={components.length === 1}
                  onClick={() => {
                    setComponents((current) => current.filter((_, position) => position !== index));
                  }}
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button
            onClick={() => {
              setComponents((current) => [...current, { key: '', label: '', maximum: '' }]);
            }}
            variant="secondary"
          >
            Add component
          </Button>
          {errorMessage(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{errorMessage(create.error)}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Create scheme
          </Button>
        </form>
      </Panel>
      <DataTable<AssessmentSchemeDto>
        caption="Assessment schemes"
        columns={[
          {
            header: 'Scheme',
            id: 'scheme',
            render: (row) => (
              <>
                <strong>{row.name}</strong>
                <small className="table-secondary">
                  {row.code} / {row.totalMaximum}
                </small>
              </>
            ),
          },
          {
            header: 'Components',
            id: 'components',
            render: (row) =>
              row.components.map((item) => `${item.label} ${item.maximum}`).join(', '),
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
            header: '',
            id: 'action',
            align: 'end',
            render: (row) =>
              row.status === 'ACTIVE' ? null : (
                <Button
                  disabled={activate.isPending}
                  onClick={() => {
                    activate.mutate(row.id);
                  }}
                  variant="secondary"
                >
                  Activate
                </Button>
              ),
          },
        ]}
        getRowKey={(row) => row.id}
        error={schemes.isError}
        onRetry={() => void schemes.refetch()}
        loading={schemes.isPending}
        rows={schemes.data ?? []}
      />
    </main>
  );
}

export function AdminGradingSchemesPage() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [bands, setBands] = useState<BandDraft[]>([
    { grade: 'A', maximumPercentage: '100', minimumPercentage: '70', remark: 'Excellent' },
    { grade: 'B', maximumPercentage: '69.99', minimumPercentage: '60', remark: 'Very good' },
    { grade: 'C', maximumPercentage: '59.99', minimumPercentage: '50', remark: 'Good' },
    { grade: 'D', maximumPercentage: '49.99', minimumPercentage: '40', remark: 'Pass' },
    { grade: 'F', maximumPercentage: '39.99', minimumPercentage: '0', remark: 'Needs improvement' },
  ]);
  const sessions = useQuery({
    queryFn: () => adminApi.sessions(auth.apiClient),
    queryKey: [...adminQueryKeys.academic, 'sessions'],
  });
  const schemes = useQuery({
    queryFn: () => adminApi.gradingSchemes(auth.apiClient),
    queryKey: [...adminQueryKeys.resultConfiguration, 'grading'],
  });
  const refresh = async () =>
    cache.invalidateQueries({ queryKey: adminQueryKeys.resultConfiguration });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof adminApi.createGradingScheme>[1]) =>
      adminApi.createGradingScheme(auth.apiClient, input),
    onSuccess: refresh,
  });
  const activate = useMutation({
    mutationFn: (id: string) => adminApi.activateGradingScheme(auth.apiClient, id),
    onSuccess: refresh,
  });
  function update(index: number, field: keyof BandDraft, value: string) {
    setBands((current) =>
      current.map((item, position) => (position === index ? { ...item, [field]: value } : item)),
    );
  }
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      academicSessionId: formText(form, 'academicSessionId'),
      bands: bands.map((band) => ({
        grade: band.grade,
        maximumPercentage: band.maximumPercentage,
        minimumPercentage: band.minimumPercentage,
        ...(band.remark === '' ? {} : { remark: band.remark }),
      })),
      code: formText(form, 'code'),
      name: formText(form, 'name'),
    });
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        description="Configure complete, non-overlapping grade bands for an academic session."
        eyebrow="Results configuration"
        title="Grading schemes"
      />
      <Panel title="New grading scheme">
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid form-grid--two">
            <FormField controlId="grading-session" label="Session">
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
            <FormField controlId="grading-code" label="Code">
              <input name="code" required />
            </FormField>
            <FormField controlId="grading-name" label="Name">
              <input name="name" required />
            </FormField>
          </div>
          <div className="configuration-list">
            <h3>Grade bands</h3>
            {bands.map((band, index) => (
              <div
                className="configuration-row configuration-row--grade"
                key={band.grade + '-' + String(index)}
              >
                <input
                  aria-label={`Band ${String(index + 1)} grade`}
                  onChange={(event) => {
                    update(index, 'grade', event.target.value);
                  }}
                  placeholder="Grade"
                  required
                  value={band.grade}
                />
                <input
                  aria-label={`Band ${String(index + 1)} minimum`}
                  onChange={(event) => {
                    update(index, 'minimumPercentage', event.target.value);
                  }}
                  placeholder="Minimum"
                  required
                  value={band.minimumPercentage}
                />
                <input
                  aria-label={`Band ${String(index + 1)} maximum`}
                  onChange={(event) => {
                    update(index, 'maximumPercentage', event.target.value);
                  }}
                  placeholder="Maximum"
                  required
                  value={band.maximumPercentage}
                />
                <input
                  aria-label={`Band ${String(index + 1)} remark`}
                  onChange={(event) => {
                    update(index, 'remark', event.target.value);
                  }}
                  placeholder="Remark"
                  value={band.remark}
                />
                <Button
                  disabled={bands.length === 1}
                  onClick={() => {
                    setBands((current) => current.filter((_, position) => position !== index));
                  }}
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button
            onClick={() => {
              setBands((current) => [
                ...current,
                { grade: '', maximumPercentage: '', minimumPercentage: '', remark: '' },
              ]);
            }}
            variant="secondary"
          >
            Add band
          </Button>
          {errorMessage(create.error) === undefined ? null : (
            <p className="form-alert form-alert--error">{errorMessage(create.error)}</p>
          )}
          <Button loading={create.isPending} type="submit">
            Create scheme
          </Button>
        </form>
      </Panel>
      <DataTable<GradingSchemeDto>
        caption="Grading schemes"
        columns={[
          {
            header: 'Scheme',
            id: 'scheme',
            render: (row) => (
              <>
                <strong>{row.name}</strong>
                <small className="table-secondary">{row.code}</small>
              </>
            ),
          },
          {
            header: 'Bands',
            id: 'bands',
            render: (row) =>
              row.bands
                .map((item) => `${item.grade}: ${item.minimumPercentage}-${item.maximumPercentage}`)
                .join(', '),
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
            header: '',
            id: 'action',
            align: 'end',
            render: (row) =>
              row.status === 'ACTIVE' ? null : (
                <Button
                  disabled={activate.isPending}
                  onClick={() => {
                    activate.mutate(row.id);
                  }}
                  variant="secondary"
                >
                  Activate
                </Button>
              ),
          },
        ]}
        getRowKey={(row) => row.id}
        error={schemes.isError}
        onRetry={() => void schemes.refetch()}
        loading={schemes.isPending}
        rows={schemes.data ?? []}
      />
    </main>
  );
}

import type { TermReportDto } from '@onyx/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
  type DataTableColumn,
} from '../../shared/ui/index.js';
import { studentPortalApi, studentPortalQueryKeys } from './student-portal-api.js';
import { formatDate } from './student-portal-utils.js';

export function StudentResultsPage() {
  const auth = useAuthSession();
  const reports = useQuery({
    queryKey: studentPortalQueryKeys.reports,
    queryFn: () => studentPortalApi.reports(auth.apiClient),
  });

  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        description="Only approved and published results appear here. Each report is a preserved historical snapshot."
        eyebrow="Academic performance"
        title="Results and report cards"
      />
      {reports.isPending ? <LoadingState label="Loading report cards" rows={4} /> : null}
      {reports.isError ? (
        <ErrorState onRetry={() => void reports.refetch()} title="Results unavailable" />
      ) : null}
      {reports.isSuccess && reports.data.length === 0 ? (
        <EmptyState
          description="The school has not published a report card for your account yet."
          title="No published results"
        />
      ) : null}
      {reports.data === undefined || reports.data.length === 0 ? null : (
        <div className="student-report-grid">
          {reports.data.map((report) => (
            <article className="student-report-summary" key={report.id}>
              <div>
                <p className="student-record-card__meta">
                  {report.sessionLabel} / {report.termName}
                </p>
                <h2>{report.classLevel}</h2>
                <p>{report.track ?? 'Junior school'}</p>
              </div>
              <dl>
                <div>
                  <dt>Overall average</dt>
                  <dd>{report.overallAverage}%</dd>
                </div>
                <div>
                  <dt>Subjects</dt>
                  <dd>{report.subjects.length}</dd>
                </div>
                <div>
                  <dt>Published</dt>
                  <dd>{formatDate(report.publishedAt)}</dd>
                </div>
              </dl>
              <Link className="ui-button ui-button--secondary" to={`/student/results/${report.id}`}>
                View report card
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

const subjectColumns: readonly DataTableColumn<TermReportDto['subjects'][number]>[] = [
  {
    header: 'Subject',
    id: 'subject',
    render: (row) => (
      <span className="table-primary">
        <strong>{row.subjectName}</strong>
        <small>{row.subjectCode}</small>
      </span>
    ),
  },
  {
    header: 'Assessment',
    id: 'assessment',
    render: (row) =>
      row.exempt
        ? 'Exempt'
        : row.components
            .map((component) =>
              component.state === 'ABSENT'
                ? `${component.label}: Absent`
                : `${component.label}: ${component.score ?? '—'}/${component.maximum}`,
            )
            .join(' / '),
  },
  {
    align: 'end',
    header: 'Total',
    id: 'total',
    render: (row) => row.total ?? '—',
  },
  {
    align: 'end',
    header: 'Percentage',
    id: 'percentage',
    render: (row) => (row.percentage === undefined ? '—' : `${row.percentage}%`),
  },
  {
    align: 'center',
    header: 'Grade',
    id: 'grade',
    render: (row) => (
      <StatusBadge tone={row.exempt ? 'neutral' : 'info'}>
        {row.exempt ? 'Exempt' : (row.grade ?? '—')}
      </StatusBadge>
    ),
  },
];

export function StudentReportPage() {
  const auth = useAuthSession();
  const { reportId } = useParams();
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const report = useQuery({
    enabled: reportId !== undefined,
    queryKey: studentPortalQueryKeys.report(reportId ?? 'missing'),
    queryFn: () => studentPortalApi.report(auth.apiClient, reportId ?? ''),
  });

  async function downloadPdf() {
    if (reportId === undefined) return;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const blob = await auth.apiClient.download(`/results/reports/${reportId}/pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `onyx-report-${report.data?.studentId ?? reportId}.pdf`;
      anchor.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30_000);
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  }

  if (report.isPending) {
    return (
      <main className="portal-content">
        <LoadingState label="Loading report card" rows={6} />
      </main>
    );
  }
  if (report.isError) {
    return (
      <main className="portal-content">
        <ErrorState onRetry={() => void report.refetch()} title="Report card unavailable" />
      </main>
    );
  }
  const data = report.data;
  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        actions={
          <>
            <Button
              onClick={() => {
                window.print();
              }}
              variant="secondary"
            >
              Print
            </Button>
            <Button
              loading={downloading}
              loadingLabel="Preparing PDF"
              onClick={() => void downloadPdf()}
            >
              Download PDF
            </Button>
          </>
        }
        description={`${data.sessionLabel} / ${data.termName}`}
        eyebrow="Published report card"
        title={`${data.studentName} — ${data.classLevel}`}
      />
      {downloadFailed ? (
        <div className="form-alert form-alert--error">
          The PDF could not be downloaded. Please try again.
        </div>
      ) : null}
      <article className="report-card-sheet">
        <header className="report-card-sheet__header">
          <div>
            <p className="eyebrow">{data.schoolName}</p>
            <h2>Official term report</h2>
          </div>
          <StatusBadge tone="success">Published</StatusBadge>
        </header>
        <dl className="report-card-meta">
          <div>
            <dt>Student</dt>
            <dd>{data.studentName}</dd>
          </div>
          <div>
            <dt>Student ID</dt>
            <dd>{data.studentId}</dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>{data.classLevel}</dd>
          </div>
          <div>
            <dt>Track</dt>
            <dd>{data.track ?? 'Not applicable'}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{data.sessionLabel}</dd>
          </div>
          <div>
            <dt>Term</dt>
            <dd>{data.termName}</dd>
          </div>
        </dl>
        <DataTable
          caption="Report card subject results"
          columns={subjectColumns}
          getRowKey={(row) => row.subjectCode}
          rows={data.subjects}
        />
        <Panel className="report-card-average">
          <span>Overall average</span>
          <strong>{data.overallAverage}%</strong>
          {data.classPosition === undefined ? null : (
            <span>Class position: {data.classPosition}</span>
          )}
        </Panel>
        <footer className="report-card-sheet__footer">
          Published {formatDate(data.publishedAt)} / Snapshot version {data.versionNumber}
        </footer>
      </article>
    </main>
  );
}

import { useSearchParams, Link } from 'react-router';
import type { AnnouncementDto, AssignmentDto } from '@onyx/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../shared/ui/index.js';
import { ProtectedAttachmentButton } from './protected-attachment-button.js';
import { studentPortalApi, studentPortalQueryKeys } from './student-portal-api.js';
import { formatDate, formatDateTime } from './student-portal-utils.js';

function assignmentTone(
  dueAt: string,
  currentTimestamp: number,
): 'danger' | 'info' | 'success' | 'warning' {
  const remaining = new Date(dueAt).getTime() - currentTimestamp;
  if (remaining < 0) return 'danger';
  if (remaining < 1000 * 60 * 60 * 24 * 3) return 'warning';
  return 'info';
}

function AssignmentCard({
  assignment,
  currentTimestamp,
}: {
  assignment: AssignmentDto;
  currentTimestamp: number;
}) {
  const overdue = new Date(assignment.dueAt).getTime() < currentTimestamp;

  return (
    <article className="student-record-card">
      <header className="student-record-card__header">
        <div>
          <p className="student-record-card__meta">
            {assignment.subject.code} / {assignment.classLevel.name}
            {assignment.track === undefined ? '' : ` / ${assignment.track.name}`}
          </p>
          <h2>{assignment.title}</h2>
        </div>
        <StatusBadge tone={assignmentTone(assignment.dueAt, currentTimestamp)}>
          {overdue ? 'Due date passed' : `Due ${formatDate(assignment.dueAt)}`}
        </StatusBadge>
      </header>
      <p className="student-prose">{assignment.instructions}</p>
      <dl className="student-inline-details">
        <div>
          <dt>Teacher</dt>
          <dd>{assignment.teacher.name}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{assignment.academicSession.label}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>
            {assignment.publishedAt === undefined
              ? 'Not available'
              : formatDateTime(assignment.publishedAt)}
          </dd>
        </div>
      </dl>
      {assignment.attachments.length === 0 ? null : (
        <div className="student-files" aria-label="Assignment attachments">
          {assignment.attachments.map((attachment) => (
            <div className="student-file" key={attachment.id}>
              <span>
                <strong>{attachment.displayName}</strong>
                <small>
                  {attachment.mimeType} / {(attachment.sizeBytes / 1024).toFixed(0)} KB
                </small>
              </span>
              <ProtectedAttachmentButton
                attachmentId={attachment.id}
                label={attachment.displayName}
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function StudentAssignmentsPage() {
  const auth = useAuthSession();
  const [params] = useSearchParams();
  const focusedId = params.get('assignment');
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'PAST'>('ALL');
  const [currentTimestamp] = useState(() => Date.now());
  const query = useQuery({
    queryKey: studentPortalQueryKeys.assignments,
    queryFn: () => studentPortalApi.assignments(auth.apiClient),
  });
  const assignments = useMemo(() => {
    const rows = (query.data ?? []).filter((item) => focusedId === null || item.id === focusedId);
    if (filter === 'ALL') return rows;
    return rows.filter((assignment) =>
      filter === 'PAST'
        ? new Date(assignment.dueAt).getTime() < currentTimestamp
        : new Date(assignment.dueAt).getTime() >= currentTimestamp,
    );
  }, [currentTimestamp, filter, query.data, focusedId]);

  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        description="Read your teachers’ instructions, check due dates, and download classwork. Follow each teacher’s instructions for handing in work."
        eyebrow="Academic work"
        title="Assignments"
      />
      {focusedId === null ? null : <Link to="/student/assignments">← Show all assignments</Link>}
      <div className="student-filter-bar" role="group" aria-label="Filter assignments">
        {(['ALL', 'OPEN', 'PAST'] as const).map((item) => (
          <button
            aria-pressed={filter === item}
            className={filter === item ? 'student-filter is-active' : 'student-filter'}
            key={item}
            onClick={() => {
              setFilter(item);
            }}
            type="button"
          >
            {item === 'ALL' ? 'All assignments' : item === 'OPEN' ? 'Upcoming' : 'Past due'}
          </button>
        ))}
      </div>
      {query.isPending ? <LoadingState label="Loading assignments" rows={4} /> : null}
      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} title="Assignments unavailable" />
      ) : null}
      {query.isSuccess && assignments.length === 0 ? (
        <EmptyState
          description={
            filter === 'ALL'
              ? 'No assignments have been published for your current subjects.'
              : 'No assignments match this filter.'
          }
          title="No assignments"
        />
      ) : null}
      {assignments.length > 0 ? (
        <div className="student-record-list">
          {assignments.map((assignment) => (
            <AssignmentCard
              assignment={assignment}
              currentTimestamp={currentTimestamp}
              key={assignment.id}
            />
          ))}
        </div>
      ) : null}
    </main>
  );
}

function AnnouncementCard({ announcement }: { announcement: AnnouncementDto }) {
  return (
    <article className="student-record-card student-record-card--announcement">
      <header className="student-record-card__header">
        <div>
          <p className="student-record-card__meta">
            {announcement.audience.label} / {announcement.author.name}
          </p>
          <h2>{announcement.title}</h2>
        </div>
        <time dateTime={announcement.publishedAt ?? announcement.createdAt}>
          {formatDateTime(announcement.publishedAt ?? announcement.createdAt)}
        </time>
      </header>
      <p className="student-prose">{announcement.body}</p>
      {announcement.expiresAt === undefined ? null : (
        <p className="student-record-card__expiry">
          Available until {formatDate(announcement.expiresAt)}
        </p>
      )}
    </article>
  );
}

export function StudentAnnouncementsPage() {
  const auth = useAuthSession();
  const [queryText, setQueryText] = useState('');
  const query = useQuery({
    queryKey: studentPortalQueryKeys.announcements,
    queryFn: () => studentPortalApi.announcements(auth.apiClient),
  });
  const announcements = useMemo(() => {
    const normalized = queryText.trim().toLocaleLowerCase();
    if (normalized === '') return query.data ?? [];
    return (query.data ?? []).filter((announcement) =>
      `${announcement.title} ${announcement.body} ${announcement.audience.label}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [query.data, queryText]);

  return (
    <main className="portal-content product-page student-portal-page">
      <PageHeader
        description="Official notices addressed to you, your class, or the wider school community."
        eyebrow="School communication"
        title="Announcements"
      />
      <Panel className="student-search-panel">
        <label className="student-search">
          <span>Search announcements</span>
          <input
            onChange={(event) => {
              setQueryText(event.target.value);
            }}
            placeholder="Search by title or message"
            type="search"
            value={queryText}
          />
        </label>
      </Panel>
      {query.isPending ? <LoadingState label="Loading announcements" rows={4} /> : null}
      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} title="Announcements unavailable" />
      ) : null}
      {query.isSuccess && announcements.length === 0 ? (
        <EmptyState
          description={
            queryText.trim() === ''
              ? 'There are no current announcements for you.'
              : 'Try a different search term.'
          }
          title={queryText.trim() === '' ? 'No announcements' : 'No matching announcements'}
        />
      ) : null}
      {announcements.length > 0 ? (
        <div className="student-record-list">
          {announcements.map((announcement) => (
            <AnnouncementCard announcement={announcement} key={announcement.id} />
          ))}
        </div>
      ) : null}
    </main>
  );
}

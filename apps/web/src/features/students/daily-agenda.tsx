import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { EmptyState, ErrorState, LoadingState, Panel } from '../../shared/ui/index.js';
import { studentPortalApi, studentPortalQueryKeys } from '../student-portal/student-portal-api.js';
import {
  formatDateTime,
  notificationResourceHref,
} from '../student-portal/student-portal-utils.js';
import { timetableApi } from '../timetable/timetable-api.js';
export function DailyAgenda({ sessionId }: { sessionId: string | undefined }) {
  const { apiClient } = useAuthSession();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const timetable = useQuery({
    queryKey: ['timetable', ''],
    queryFn: () => timetableApi.read(apiClient),
  });
  const work = useQuery({
    queryKey: studentPortalQueryKeys.assignments,
    queryFn: () => studentPortalApi.assignments(apiClient),
  });
  const notices = useQuery({
    queryKey: studentPortalQueryKeys.notifications,
    queryFn: () => studentPortalApi.notifications(apiClient),
  });
  const reports = useQuery({
    queryKey: studentPortalQueryKeys.reports,
    queryFn: () => studentPortalApi.reports(apiClient),
  });
  const zone = timetable.data?.timeZone ?? 'Africa/Lagos';
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: zone }).format(now);
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(day) + 1;
  const clock = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zone,
  }).format(now);
  const lessons = (timetable.data?.lessons ?? []).filter(
    (x) => x.weekday === weekday && x.endsAt > clock,
  );
  const upcoming = (work.data ?? [])
    .filter(
      (x) => x.academicSession.id === sessionId && new Date(x.dueAt).getTime() >= now.getTime(),
    )
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const unread = (notices.data ?? []).filter((x) => x.readAt === undefined);
  const latest = [...(reports.data ?? [])].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  )[0];
  return (
    <section className="daily-agenda" aria-label="Your daily school agenda">
      <div className="daily-agenda__heading">
        <div>
          <p className="eyebrow">Your next steps</p>
          <h2>
            {new Intl.DateTimeFormat('en-NG', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: zone,
            }).format(now)}
          </h2>
        </div>
        <Link to="/student/timetable">View the school week →</Link>
      </div>
      <div className="student-day-grid">
        <Panel title="Today’s lessons" description={`School time · ${zone}`}>
          {timetable.isPending ? (
            <LoadingState rows={2} />
          ) : timetable.isError ? (
            <ErrorState
              title="Today’s timetable unavailable"
              onRetry={() => void timetable.refetch()}
            />
          ) : !timetable.data.published ? (
            <EmptyState
              title="Your timetable is on its way"
              description="The school has not published a schedule for your current term yet."
            />
          ) : lessons.length === 0 ? (
            <EmptyState
              title="No more lessons scheduled today"
              description="You can still check upcoming work and the full weekly timetable."
            />
          ) : (
            <ol className="agenda-list">
              {lessons.map((lesson, index) => (
                <li key={`${lesson.teachingAssignmentId}-${String(index)}`}>
                  <time>
                    {lesson.startsAt}–{lesson.endsAt}
                  </time>
                  <div>
                    <strong>{lesson.subject}</strong>
                    <span>
                      {lesson.teacher}
                      {lesson.room === '' ? '' : ` · ${lesson.room}`}
                    </span>
                    {lesson.startsAt <= clock ? <small>Happening now</small> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel
          title="Your classwork"
          description="Upcoming deadlines for your current session. Follow your teacher’s instructions for handing in work."
        >
          {work.isPending ? (
            <LoadingState rows={2} />
          ) : work.isError ? (
            <ErrorState title="Classwork unavailable" onRetry={() => void work.refetch()} />
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming deadlines"
              description="Published assignments remain available in your assignment list, including past due dates."
            />
          ) : (
            <ol className="agenda-list">
              {upcoming.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <div>
                    <Link to={`/student/assignments?assignment=${item.id}`}>{item.title}</Link>
                    <span>
                      {item.subject.name} · {item.teacher.name}
                    </span>
                    <time dateTime={item.dueAt}>Due {formatDateTime(item.dueAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Link to="/student/assignments">All assignments →</Link>
        </Panel>
        <Panel title="Updates to read" description="Notifications addressed to your account.">
          {notices.isPending ? (
            <LoadingState rows={2} />
          ) : notices.isError ? (
            <ErrorState title="Updates unavailable" onRetry={() => void notices.refetch()} />
          ) : unread.length === 0 ? (
            <p>You’re up to date. New school updates will appear here.</p>
          ) : (
            <ul className="record-list">
              {unread.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <Link to={notificationResourceHref(item) ?? '/student/notifications'}>
                    {item.title}
                  </Link>
                  <small>{formatDateTime(item.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
          <Link to="/student/notifications">
            {notices.isSuccess
              ? `${String(unread.length)} unread · Open notifications`
              : 'Open notifications'}
          </Link>
        </Panel>
        <Panel
          title="Your latest report"
          description="Published results remain available across academic sessions."
        >
          {reports.isPending ? (
            <LoadingState rows={2} />
          ) : reports.isError ? (
            <ErrorState title="Results unavailable" onRetry={() => void reports.refetch()} />
          ) : latest === undefined ? (
            <EmptyState
              title="Results are not published yet"
              description="Your report will appear after the school completes review and publication. Contact the school office if you believe a report is missing."
            />
          ) : (
            <div className="agenda-report">
              <p>
                {latest.sessionLabel} · {latest.termName}
              </p>
              <strong>
                {latest.classLevel}
                {latest.track === undefined ? '' : ` · ${latest.track}`}
              </strong>
              <p>Published {formatDateTime(latest.publishedAt)}</p>
              <Link className="ui-button ui-button--secondary" to={`/student/results/${latest.id}`}>
                Open report card
              </Link>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

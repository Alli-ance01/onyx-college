import type { SaveTimetableInput, TimetableLessonInput } from '@onyx/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuthSession } from '../../lib/auth/use-auth-session.js';
import { useUnsavedChanges } from '../../shared/hooks/use-unsaved-changes.js';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Panel,
} from '../../shared/ui/index.js';
import { timetableApi, weekdays } from './timetable-api.js';
export function TimetablePage() {
  const [params] = useSearchParams();
  return <TimetableContent key={params.get('term') ?? ''} />;
}
function TimetableContent() {
  const auth = useAuthSession();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const termId = params.get('term') ?? '';
  const manage = auth.principal?.permissions.includes('timetable.manage') === true;
  const [draft, setDraft] = useState<SaveTimetableInput>();
  const [saved, setSaved] = useState(false);
  useUnsavedChanges(draft !== undefined);
  const query = useQuery({
    queryKey: ['timetable', termId],
    queryFn: () => timetableApi.read(auth.apiClient, termId),
  });
  const terms = useQuery({
    queryKey: ['timetable-terms'],
    queryFn: () => timetableApi.terms(auth.apiClient),
  });
  const assignments = useQuery({
    queryKey: ['timetable-assignments'],
    queryFn: () => timetableApi.assignments(auth.apiClient),
    enabled: manage,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (query.data?.term === null || query.data?.term === undefined || draft === undefined)
        throw new Error('Choose a term and make a change first.');
      await timetableApi.save(auth.apiClient, query.data.term.id, draft);
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['timetable'] });
      setDraft(undefined);
      setSaved(true);
    },
  });
  const value = draft ?? {
    version: query.data?.version ?? 0,
    timeZone: query.data?.timeZone ?? 'Africa/Lagos',
    lessons: query.data?.lessons ?? [],
  };
  const choices = (assignments.data ?? []).filter(
    (x) => x.academicSession.id === query.data?.term?.sessionId && x.status === 'ACTIVE',
  );
  function change(lessons: readonly TimetableLessonInput[]) {
    setDraft({ ...value, lessons });
    setSaved(false);
  }
  return (
    <main className="portal-content product-page">
      <PageHeader
        eyebrow="Your school week"
        title="Timetable"
        description="Lessons are shown in the school’s time zone. Choose a term to view its weekly schedule."
      />
      <label className="timetable-term">
        Academic term
        <select
          value={termId}
          onChange={(event) => {
            setParams(event.target.value === '' ? {} : { term: event.target.value });
            setSaved(false);
          }}
        >
          <option value="">Current term</option>
          {terms.data?.map((term) => (
            <option key={term.id} value={term.id}>
              {term.sessionLabel} · {term.name}
            </option>
          ))}
        </select>
      </label>
      {terms.isError ? (
        <ErrorState title="Term options unavailable" onRetry={() => void terms.refetch()} />
      ) : null}
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState title="Timetable unavailable" onRetry={() => void query.refetch()} />
      ) : query.data.term === null ? (
        <EmptyState
          title="No current timetable context"
          description="A current term and academic placement are needed. Contact the school office if you expect lessons here."
        />
      ) : (
        <>
          <p className="academic-context">
            {query.data.term.sessionLabel} · {query.data.term.name} · {value.timeZone}
            {query.data.published
              ? ` · Revision ${String(query.data.version)}`
              : ' · Not published'}
          </p>
          {manage ? (
            <Panel
              title="Manage the week"
              description="Save to publish the complete week. Overlapping classes, teachers, and rooms are rejected. Completed terms are protected."
            >
              {assignments.isError ? (
                <ErrorState
                  title="Teaching assignments unavailable"
                  onRetry={() => void assignments.refetch()}
                />
              ) : null}
              <label className="timetable-term">
                School time zone
                <input
                  disabled={save.isPending}
                  value={value.timeZone}
                  onChange={(event) => {
                    setDraft({ ...value, timeZone: event.target.value });
                    setSaved(false);
                  }}
                />
              </label>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate();
                }}
              >
                <fieldset disabled={save.isPending} className="timetable-editor">
                  {value.lessons.map((lesson, index) => (
                    <div className="timetable-editor__lesson" key={index}>
                      <label>
                        Lesson {index + 1}
                        <select
                          required
                          aria-label={`Teaching assignment ${String(index + 1)}`}
                          value={lesson.teachingAssignmentId}
                          onChange={(event) => {
                            change(
                              value.lessons.map((item, i) =>
                                i === index
                                  ? { ...item, teachingAssignmentId: event.target.value }
                                  : item,
                              ),
                            );
                          }}
                        >
                          <option value="">Choose subject and class</option>
                          {lesson.teachingAssignmentId !== '' &&
                          !choices.some((item) => item.id === lesson.teachingAssignmentId) ? (
                            <option value={lesson.teachingAssignmentId}>
                              Assignment no longer active — remove this lesson
                            </option>
                          ) : null}
                          {choices.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.subject.name} · {item.classLevel.name}
                              {item.track === undefined ? '' : ` ${item.track.name}`} ·{' '}
                              {item.teacher.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Day
                        <select
                          value={lesson.weekday}
                          onChange={(event) => {
                            change(
                              value.lessons.map((item, i) =>
                                i === index
                                  ? { ...item, weekday: Number(event.target.value) }
                                  : item,
                              ),
                            );
                          }}
                        >
                          {weekdays.map((day, i) => (
                            <option key={day} value={i + 1}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Starts
                        <input
                          type="time"
                          required
                          value={lesson.startsAt}
                          onChange={(event) => {
                            change(
                              value.lessons.map((item, i) =>
                                i === index ? { ...item, startsAt: event.target.value } : item,
                              ),
                            );
                          }}
                        />
                      </label>
                      <label>
                        Ends
                        <input
                          type="time"
                          required
                          value={lesson.endsAt}
                          onChange={(event) => {
                            change(
                              value.lessons.map((item, i) =>
                                i === index ? { ...item, endsAt: event.target.value } : item,
                              ),
                            );
                          }}
                        />
                      </label>
                      <label>
                        Room (optional)
                        <input
                          maxLength={80}
                          value={lesson.room}
                          onChange={(event) => {
                            change(
                              value.lessons.map((item, i) =>
                                i === index ? { ...item, room: event.target.value } : item,
                              ),
                            );
                          }}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        aria-label={`Remove lesson ${String(index + 1)}`}
                        onClick={() => {
                          change(value.lessons.filter((_, i) => i !== index));
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <div className="ui-page-header__actions">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        change([
                          ...value.lessons,
                          {
                            teachingAssignmentId: '',
                            weekday: 1,
                            startsAt: '08:00',
                            endsAt: '09:00',
                            room: '',
                          },
                        ]);
                      }}
                    >
                      Add lesson
                    </Button>
                    <Button
                      type="submit"
                      loading={save.isPending}
                      disabled={
                        draft === undefined || (choices.length === 0 && value.lessons.length > 0)
                      }
                    >
                      Save and publish timetable
                    </Button>
                  </div>
                </fieldset>
                {save.isError ? (
                  <p className="form-alert form-alert--error" role="alert">
                    {save.error.message} Your edits are still here.
                  </p>
                ) : null}
                {saved ? (
                  <p role="status" className="form-alert">
                    Timetable saved and published.
                  </p>
                ) : null}
              </form>
            </Panel>
          ) : query.data.lessons.length === 0 ? (
            <EmptyState
              title={
                query.data.published
                  ? 'No lessons for this placement'
                  : 'Timetable not published yet'
              }
              description="The school will publish your lessons here once the schedule is ready."
            />
          ) : (
            <div className="timetable-week">
              {weekdays.map((day, index) => (
                <Panel key={day} title={day}>
                  {query.data.lessons
                    .filter((x) => x.weekday === index + 1)
                    .map((lesson, i) => (
                      <article
                        className="agenda-lesson"
                        key={`${lesson.teachingAssignmentId}-${String(i)}`}
                      >
                        <time>
                          {lesson.startsAt}–{lesson.endsAt}
                        </time>
                        <strong>{lesson.subject}</strong>
                        <span>
                          {lesson.className} · {lesson.teacher}
                        </span>
                        {lesson.room === '' ? null : <small>Room: {lesson.room}</small>}
                      </article>
                    ))}
                  {query.data.lessons.some((x) => x.weekday === index + 1) ? null : (
                    <p className="muted">No scheduled lessons.</p>
                  )}
                </Panel>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

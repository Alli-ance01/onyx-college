import type {
  SuccessEnvelope,
  TimetableDto,
  TeachingAssignmentDto,
  SaveTimetableInput,
} from '@onyx/contracts';
import type { ApiClient } from '../../lib/api/api-client.js';
export const timetableApi = {
  read: async (client: ApiClient, termId = '') =>
    (
      await client.request<SuccessEnvelope<TimetableDto>>(
        `/timetables${termId === '' ? '' : `?termId=${encodeURIComponent(termId)}`}`,
      )
    ).data,
  terms: async (client: ApiClient) =>
    (await client.request<SuccessEnvelope<NonNullable<TimetableDto['term']>[]>>('/timetable-terms'))
      .data,
  assignments: async (client: ApiClient) =>
    (await client.request<SuccessEnvelope<TeachingAssignmentDto[]>>('/timetable-assignments')).data,
  save: async (client: ApiClient, termId: string, body: SaveTimetableInput) =>
    client.request(`/timetables/${termId}`, {
      method: 'PUT',
      body: {
        ...body,
        lessons: body.lessons.map(({ teachingAssignmentId, weekday, startsAt, endsAt, room }) => ({
          teachingAssignmentId,
          weekday,
          startsAt,
          endsAt,
          room,
        })),
      },
    }),
};
export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

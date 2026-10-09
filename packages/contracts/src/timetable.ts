export interface TimetableLessonInput {
  teachingAssignmentId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string;
}
export interface TimetableLessonDto extends TimetableLessonInput {
  subject: string;
  teacher: string;
  className: string;
}
export interface TimetableDto {
  term: { id: string; name: string; sessionId: string; sessionLabel: string } | null;
  timeZone: string;
  version: number;
  published: boolean;
  lessons: readonly TimetableLessonDto[];
}
export interface SaveTimetableInput {
  version: number;
  timeZone: string;
  lessons: readonly TimetableLessonInput[];
}

import type { TimetableLessonInput } from '@onyx/contracts';
import { ValidationError } from '../../../app/errors/app-error.js';
export interface LessonScope {
  teacherId: string;
  placement: string;
}
export function validateSchedule(
  lessons: readonly TimetableLessonInput[],
  scopes: ReadonlyMap<string, LessonScope>,
): void {
  for (const [index, lesson] of lessons.entries()) {
    const scope = scopes.get(lesson.teachingAssignmentId);
    if (scope === undefined)
      throw new ValidationError('Choose an active teaching assignment in this academic session.');
    if (lesson.startsAt >= lesson.endsAt)
      throw new ValidationError('A lesson must end after it starts.');
    for (const other of lessons.slice(0, index)) {
      if (
        other.weekday !== lesson.weekday ||
        other.endsAt <= lesson.startsAt ||
        other.startsAt >= lesson.endsAt
      )
        continue;
      const otherScope = scopes.get(other.teachingAssignmentId);
      if (
        otherScope?.placement === scope.placement ||
        otherScope?.teacherId === scope.teacherId ||
        (lesson.room.trim() !== '' &&
          other.room.trim().toLowerCase() === lesson.room.trim().toLowerCase())
      ) {
        throw new ValidationError(
          'Lessons overlap for a class, teacher, or room. Adjust the day or time.',
        );
      }
    }
  }
}

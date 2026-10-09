import { describe, expect, it } from 'vitest';
import { validateSchedule } from '../src/modules/timetable/application/timetable-policy.js';
const scopes = new Map([
  ['a', { teacherId: 'teacher-one', placement: 'JSS1' }],
  ['b', { teacherId: 'teacher-two', placement: 'JSS1' }],
  ['c', { teacherId: 'teacher-one', placement: 'JSS2' }],
  ['d', { teacherId: 'teacher-two', placement: 'JSS2' }],
]);
const lesson = {
  teachingAssignmentId: 'a',
  weekday: 1,
  startsAt: '08:00',
  endsAt: '09:00',
  room: 'Lab',
};
describe('weekly timetable invariants', () => {
  it.each(['b', 'c', 'd'])(
    'rejects overlapping class, teacher, or room for %s',
    (teachingAssignmentId) => {
      expect(() => {
        validateSchedule([lesson, { ...lesson, teachingAssignmentId, startsAt: '08:30' }], scopes);
      }).toThrow('overlap');
    },
  );
  it('allows adjacent periods, different weekdays and independent rooms', () => {
    expect(() => {
      validateSchedule(
        [
          lesson,
          { ...lesson, startsAt: '09:00', endsAt: '10:00' },
          { ...lesson, weekday: 2 },
          { ...lesson, teachingAssignmentId: 'd', room: 'Library' },
        ],
        scopes,
      );
    }).not.toThrow();
  });
  it('normalizes room names but does not treat an unspecified room as a clash', () => {
    expect(() => {
      validateSchedule([lesson, { ...lesson, teachingAssignmentId: 'd', room: ' LAB ' }], scopes);
    }).toThrow('overlap');
    expect(() => {
      validateSchedule(
        [
          { ...lesson, room: '' },
          { ...lesson, teachingAssignmentId: 'd', room: '' },
        ],
        scopes,
      );
    }).not.toThrow();
  });
  it('rejects missing authority and invalid time order', () => {
    expect(() => {
      validateSchedule([{ ...lesson, teachingAssignmentId: 'revoked' }], scopes);
    }).toThrow('active teaching');
    expect(() => {
      validateSchedule([{ ...lesson, endsAt: '08:00' }], scopes);
    }).toThrow('end after');
  });
});

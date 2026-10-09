# Timetable and daily work — approved scope extension, 8 October 2026

The school owner accepted the release-readiness programme including a daily timetable. This intentionally extends the original V1 exclusion. Assignment submission, attendance, payments, and messaging remain outside this change.

A term owns one bounded weekly timetable (maximum 2,000 lessons). Each lesson references an active subject TeachingAssignment in that term's academic session, a weekday (Monday–Friday), local start/end time, and optional room. The schedule stores an IANA time zone, initially Africa/Lagos. Timetables are planning information; they never create teacher authority, alter enrollment, select student subjects, or change results.

`timetable.manage` permits administrators to replace a term's schedule. Saving validates assignment/session membership, time ranges, and overlapping class/track, teacher, or named-room bookings. Adjacent lessons are allowed. Saves use optimistic revision checks and a transaction with an audit snapshot; conflicting editors must reload. Completed/archived terms and closed/archived sessions cannot be changed. A missing timetable is an explicit unpublished state, not a fabricated schedule.

Students receive only lessons matching their own enrollment and official curriculum for the selected term's session. Teachers receive only lessons attached to their active subject assignments. Account/profile lifecycle and assignment revocation are checked on reads. Clients cannot supply a student or teacher identity. Historical term selection preserves enrollment history. Published schedules are edited only by authorized staff; an empty saved schedule intentionally clears the week and increments its revision.

Daily work combines the authenticated student's schedule, upcoming published assignments, unread notifications, and published reports. Due dates indicate deadlines, not submission/completion status, because assignment submission is not part of this product. Failed data sources show retryable errors rather than zero counts.

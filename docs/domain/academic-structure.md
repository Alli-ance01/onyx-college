# Academic Structure

## 1. Purpose

This document defines the authoritative academic hierarchy and the rules for placing students, offering subjects, assigning teachers, and preserving academic history.

## 2. Hierarchy

An `AcademicSession` represents one school year and owns exactly three ordered `Term` records:

1. First Term
2. Second Term
3. Third Term

Sessions use two consecutive four-digit years separated by `/`, for example `2026/2027`. Academic Session statuses are `DRAFT`, `ACTIVE`, `CLOSED`, and `ARCHIVED`. Exactly one session may be `ACTIVE` at a time. The active session is authoritative data and must not be inferred from the calendar or hard-coded.

Within the `ACTIVE` Academic Session, at most one Term may be `ACTIVE` at a time. Other Term states follow the session/term lifecycle needed to distinguish not-yet-active, closed, and archived records. Changing the active session or term is privileged and audited. `SchoolSettings.currentAcademicSessionId` and `currentTermId` must agree with the authoritative session/term states; silent disagreement is invalid. Exact enforcement is an architecture decision.

The initial `ClassLevel` catalogue is ordered as:

1. JSS1
2. JSS2
3. JSS3
4. SS1
5. SS2
6. SS3

The initial senior `Track` catalogue is Science, Arts, and Commercial.

Rules:

- JSS1–JSS3 are junior levels and require no track.
- SS1–SS3 are senior levels and require a valid senior track for authoritative placement and track-specific operations.
- No A/B/C or other class arms exist in V1.
- Class levels and tracks are referenced records, not duplicated free-text labels in academic history.

## 3. Enrollment is authoritative

`Enrollment` is the authoritative relationship between a Student and a placement for an Academic Session. The Student entity does not carry a mutable `currentClass` or `currentTrack` as the source of truth.

A placement comprises:

- Student;
- Academic Session;
- Class Level; and
- Track for a senior placement, otherwise no track.

There is at most one authoritative enrollment for a student in an academic session. Current placement is derived from the enrollment for the selected/current session whose lifecycle makes it effective.

Historical enrollments are immutable as history. Corrections to erroneous data must use a controlled, audited process; progression never updates an older enrollment into a new class.

Example:

| Session | Placement |
| --- | --- |
| 2024/2025 | JSS3 |
| 2025/2026 | SS1 Science |
| 2026/2027 | SS2 Science |

## 4. Promotion outcomes

Academic progression records an outcome and preserves the source enrollment:

- **Promote:** create a new Enrollment for the next session at the next approved level.
- **Repeat:** create a new Enrollment for the next session at the same class level and approved track rules.
- **Withdraw:** retain all enrollments and move the student's/enrollment's lifecycle to the applicable withdrawn state.
- **Transfer:** retain all enrollments and record the applicable transferred lifecycle outcome.
- **Graduate:** complete SS3, preserve the final enrollment, and set the Student lifecycle to `GRADUATED`.

JSS3-to-SS1 promotion must select Science, Arts, or Commercial. A transaction should cover the progression decision, destination Enrollment, Student lifecycle change where applicable, notification, and audit record so partial progression cannot occur.

## 5. Subjects and offerings

`Subject` is the school-wide catalogue entry. `SubjectOffering` states that a subject is available for a class level and, in senior school, a track. Its curriculum classification is `REQUIRED` or `OPTIONAL`.

Offering rules:

- a junior offering has no track;
- a senior offering has a valid track;
- duplicate active offerings for the same subject/class/track context are prohibited;
- offerings are governed by academic validity so changes do not rewrite historical curricula; and
- applicable `REQUIRED` offerings automatically form the Enrollment's standard curriculum; and
- an `OPTIONAL` offering is not part of an individual Enrollment until explicitly added.

Students do not directly change their official curriculum in V1. They may submit one pending subject-change request for their own active Enrollment: `ADD` for an applicable `OPTIONAL` offering or `REMOVE` for an applicable `REQUIRED` offering. The request records the student's reason and does not change curriculum while pending. An authorized administrator with `enrollments.manage` may approve or reject it; approval atomically creates the `EnrollmentSubjectOverride` and both the decision and override are audited. Requests remain tied to their historical Enrollment, cannot be submitted for completed, withdrawn, transferred, graduated, or archived enrollments, and a rejected or approved request does not silently alter the curriculum.

## 6. Teacher academic scope

A `TeachingAssignment` authorizes a teacher for one Subject, Class Level, applicable Track, and Academic Session, subject to global permissions and active lifecycle state. It is the academic scope for result entry, assignment creation, subject-level student access, and related announcement targeting.

A `ClassTeacherAssignment` separately relates a teacher to a Class Level, applicable Track, and Academic Session. It may support broader class-level visibility and class-teacher tasks when permissions allow, but it does not imply authority to teach or enter results for every subject.

V1 permits only one active Class Teacher Assignment for the same Academic Session, Class Level, and applicable Track. Co-class teachers are not supported.

## 7. Results context

Academic results are always contextualized by Academic Session, Term, Enrollment, Subject, and the responsible result batch/assignment scope. Assessment and grading configurations used for a result must remain identifiable so later configuration changes do not alter historical interpretation.

Published `TermReport` records are historical snapshots. They retain the effective student identity, Student ID, placement, subjects, scores, totals, grades, average, optional position, and authorized remarks as published.

Overall average is computed from eligible non-exempt subject percentages. If position is enabled, the complete reporting cohort is the same session, term, class level, and applicable senior track. Official position cannot be calculated or published for an incomplete cohort.

## 8. Integrity checks

At minimum, authoritative operations enforce:

- consecutive-year session labels and session-label uniqueness;
- exactly one `ACTIVE` Academic Session system-wide;
- at most one `ACTIVE` Term within the active session and settings references consistent with both active states;
- exactly one First, Second, and Third Term per session;
- unique class-level codes and track codes;
- no track on junior enrollments, offerings, or assignments;
- a required valid track on senior enrollments and track-scoped academic records;
- one enrollment per student/session;
- no duplicate active offering or teacher assignment for the same scope;
- at most one active Class Teacher Assignment per session/class/track scope;
- result students are enrolled in the batch's academic context;
- result subjects are applicable through an offering or explicit override; and
- optional subjects require `ADD`, required removals require `REMOVE`, and all overrides carry audit metadata;
- progression creates destination history rather than modifying source history.

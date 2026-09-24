# Product Specification

## 1. Product definition

Onyx College Portal is a role-based school information and academic management platform for Onyx College. It is one system with one backend and one database, exposed through three primary experiences:

1. Student Portal
2. Teacher Portal
3. Admin Portal

Account identity, institutional profiles, academic placement, and authorization are distinct concerns. Possessing an account or identifier never implies academic standing or permission.

## 2. Product principles

- Administrative approval is required before a student receives an institutional profile, permanent Student ID, initial enrollment, and full portal access.
- Academic history is append-preserving. Progression creates new enrollment records and never overwrites prior placement.
- Global roles provide a baseline access category, but permissions authorize administrative actions and active assignments constrain teacher academic authority.
- Students consume authoritative academic records and cannot edit them directly.
- Results, report cards, approvals, corrections, promotions, permission changes, and other material mutations are auditable.
- Configuration must replace hard-coded assumptions for assessment, grading, document requirements, subject offerings, academic sessions, and other school-controlled policy.
- Important records use lifecycle states rather than destructive deletion.

## 3. Student onboarding

Public signup is available only to students. The mandatory sequence is:

`Create Account → Complete Registration → Submit Registration → Admin Review → Approval → Student Profile Creation → Student ID Generation → Initial Enrollment Creation → Full Student Portal Activation`

Account creation starts an applicant relationship; it does not make the account holder an approved Onyx College student. Registration is configurable while retaining strongly typed mandatory core data. Its default sections are:

1. Personal Information
2. Contact Information
3. Parent / Guardian
4. Academic Information
5. Medical / Emergency
6. Documents
7. Review & Submit

An applicant may indicate an expected or current placement, but an authorized administrator determines the authoritative initial class and, where applicable, senior track.

The mandatory canonical registration fields are surname, first name, date of birth, gender, nationality, residential address, primary guardian name, guardian relationship, guardian phone, requested class, and passport photograph. Nigerian applicants must also provide state of origin and LGA. Applicants requesting SS1, SS2, or SS3 must select Science, Arts, or Commercial as the requested senior track. Administrators cannot disable these fields or conditions.

Administrators may configure supported optional canonical fields and add custom fields. V1 custom field types are `TEXT`, `TEXTAREA`, `NUMBER`, `DATE`, `SELECT`, `MULTISELECT`, `BOOLEAN`, `EMAIL`, and `PHONE`. Configuration supports key, label, help text, applicable placeholder, section, display order, enabled state, and required state, plus the bounded type-specific validation rules defined in the registration workflow. Arbitrary custom file fields, executable validation, arbitrary regular expressions, and a general conditional-form engine are excluded. Known Nigerian State/LGA and senior-track conditions remain explicit domain rules.

Registration form configuration is versioned. Once a version governs a submitted registration, that version is immutable; later changes create a new version. Every registration retains the governing version so old submissions remain interpretable.

Student IDs use a numeric sequence with a minimum width of four digits: `ONYX/0001`, `ONYX/0042`, `ONYX/9999`, then `ONYX/10000`. The sequence grows naturally, never rolls over, and is never reused. IDs are permanent, unique, contain no year, and are never authentication or authorization credentials.

`REJECTED` is terminal for the applicant. The applicant cannot create another registration to bypass the decision. An authorized administrator may explicitly reopen the rejected registration, and the reopening is audited. `CHANGES_REQUESTED` is used instead when an otherwise valid application needs corrections.

Duplicate detection is deterministic but does not claim to establish human identity. A strong candidate match uses normalized first name, surname, date of birth, and primary guardian phone. Strong matches against pending, approved, or rejected registrations enter administrative duplicate review; a rejected match never receives an automatically clean registration path. Partial/fuzzy matches warn reviewers but do not automatically reject. Administrators may reopen the original rejected registration, confirm distinct people, or reject the duplicate attempt. Every resolution/override is audited. Email alone is not student identity, and V1 introduces no biometric, NIN, or external identity requirement.

After approval, students cannot directly edit authoritative biodata. They request official changes through Profile Correction Requests.

## 4. Student Portal

The Student Portal navigation is:

- Dashboard
- Assignments
- Announcements
- Results
- Subjects
- Academic History
- Documents
- Profile
- Notifications
- Settings

Academic information is primarily read-only. Students cannot modify their Student ID, official name, date of birth, class, track, academic history, results, or subject assignments. Published term report cards are available from the results experience for viewing, printing, and PDF download.

## 5. Academic structure

The initial class levels are JSS1, JSS2, JSS3, SS1, SS2, and SS3. Senior school tracks are Science, Arts, and Commercial. Junior levels have no track, and V1 has no A/B/C class arms.

Academic sessions use the consecutive-year format `YYYY/YYYY`, such as `2026/2027`. Each session contains First Term, Second Term, and Third Term. Academic Session statuses are `DRAFT`, `ACTIVE`, `CLOSED`, and `ARCHIVED`, with exactly one `ACTIVE` session at a time. Within it, at most one Term may be `ACTIVE`. Changing active session or term is privileged and audited. `SchoolSettings.currentAcademicSessionId` and `currentTermId` must agree with authoritative states; silent disagreement is prohibited. Exact enforcement is deferred to architecture.

Enrollment is the authoritative record of a student's placement in an academic session. Current placement is derived from enrollment; it is not stored as a mutable class field on the Student record.

## 6. Subjects and curriculum

Administrators manage the subject catalogue and configure Subject Offerings by class level and, for senior school, track. Each offering is `REQUIRED` or `OPTIONAL`.

Students do not choose their official curriculum in V1. Applicable `REQUIRED` offerings automatically form the Enrollment's standard curriculum. An `OPTIONAL` offering is excluded until an authorized administrator creates an `ADD` Enrollment Subject Override for that student. An administrator may create a `REMOVE` override for an exceptional removal from required curriculum. Every override records reason, actor, timestamp, and audit event.

## 7. Teachers

There is no public teacher signup. A teacher is privately invited or directly created by an authorized administrator, completes account setup and profile information as applicable, receives administrative approval, and is then assigned academic responsibilities.

Teachers never select their own classes, subjects, tracks, permissions, or responsibilities. A teacher may hold multiple concurrent Teaching Assignments. Each assignment relates a teacher to a subject, class level, applicable track, and academic session.

Class Teacher is a separate academic assignment, not a global role. It can grant broader class-level capabilities only as explicitly permitted. V1 allows only one active Class Teacher Assignment for each Academic Session, Class Level, and applicable Track; co-class teachers are not supported.

## 8. Teacher Portal

The Teacher Portal navigation is:

- Dashboard
- My Classes
- My Subjects
- Students
- Assignments
- Results
- Announcements
- Notifications
- Profile
- Settings

Teachers see and act on academic resources only within active assignments and granted permissions. A global `TEACHER` role alone is insufficient for resource access.

## 9. Assignments

In V1, an authorized teacher can create an assignment, provide instructions, attach files, select a class and subject within an active assignment, set a due date, and publish it. Assigned students can view and download the assignment and its files.

V1 has no student assignment submission, grading, or broader learning-management workflow.

## 10. Announcements

Administrators with the necessary permission may target the entire school, all students, all teachers, junior school, senior school, a class, a senior track, a class-and-track combination, or specific users.

Teachers may target only academic groups covered by their active assignments and permissions. Students consume announcements and do not publish them.

## 11. Results and report cards

Assessment and grading schemes are configurable. A default assessment scheme may allocate 40 marks to Continuous Assessment and 60 marks to Examination, but this is configuration—not hard-coded policy.

The result lifecycle is:

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PUBLISHED`

During review, `UNDER_REVIEW` may transition to `RETURNED_FOR_CORRECTION`. The authorized teacher may edit the returned batch and resubmit it to `SUBMITTED`. This is a pre-publication workflow and does not use Result Correction Requests. Published batches cannot be returned or normally edited.

Teachers may enter results only through valid Teaching Assignments. Scores support at most two decimal places. Every required assessment component must be explicitly `SCORED` or `ABSENT`; an unentered component blocks submission. `ABSENT` contributes zero while remaining academically distinct from a scored zero. Authorized staff may mark an entire result `EXEMPT`; it then has no normal total or grade and is excluded from relevant aggregate calculations. Authoritative totals and grades are calculated server-side. Students see only published results.

For each eligible non-exempt subject, `subjectPercentage = (subjectTotal / subjectMaximum) × 100`. Overall average is the sum of eligible non-exempt subject percentages divided by their count. Exempt subjects contribute to neither numerator nor denominator. A required non-exempt subject with an unresolved/missing result prevents the final report from becoming complete. Calculations use decimal-safe server-side arithmetic without repeated intermediate rounding. The final authoritative/displayed average is rounded once to two decimal places using the architecture-approved decimal strategy.

The user who entered or submitted a Result Batch cannot approve that batch. Approval requires another authorized user with `results.approve`. An approver may also publish when they hold `results.publish`.

Published results cannot be silently edited. Any correction follows:

`Correction Request → Review → Approval → Application → Audit Record`

The requester of a published-result correction cannot approve that correction.

V1 term report cards may include school identity, student identity, Student ID, class, track where applicable, session, term, subjects, assessment scores, totals, grades, overall average, optional class position, class teacher remark, and principal or administrator remark. Class position is configurable and disabled by default. When enabled, the cohort is the same academic session, term, class level, and senior track where applicable; ranking uses overall average and standard competition ranking for ties (`1, 2, 2, 4`). Official class position cannot be calculated or published while the eligible cohort is incomplete, with no acknowledgement bypass in V1. Administrators must complete the cohort or disable position publication for that reporting context. Published report cards preserve a historical snapshot and remain printable and downloadable as PDF. Attendance is excluded.

## 12. Promotion and student lifecycle

Academic progression creates a new Enrollment and retains all earlier enrollment records. Supported outcomes are Promote, Repeat, Withdraw, Transfer, and Graduate.

- A promotion advances the student to the authorized placement for the next session.
- A repeat creates the next session's enrollment at the repeated level; it does not rewrite the prior session.
- Withdrawal and transfer preserve existing history and change lifecycle state as appropriate.
- JSS3 to SS1 promotion requires Science, Arts, or Commercial track selection.
- SS3 completion changes the Student lifecycle to `GRADUATED`.

## 13. Roles and administration

Initial global roles are `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`, and `STUDENT`. Authorization uses permissions, with additional academic-scope checks for teachers.

Default role bundles establish starting permissions, never bypass invariants or resource authorization. `SUPER_ADMIN` receives every system permission and is the only initial unrestricted system-administration role. `SCHOOL_ADMIN` receives broad operational administration but cannot modify the protected `SUPER_ADMIN` role or bootstrap another initial `SUPER_ADMIN`; security-critical capabilities remain separately controlled. `PRINCIPAL` receives broad visibility and academic/result oversight but no routine role/permission or privileged bootstrap administration by default. `TEACHER` receives the documented scoped operational permissions, always constrained by academic assignments. `STUDENT` receives no administrative permission bundle; normal self-service is ownership-based.

There is no public administrator signup. The first `SUPER_ADMIN` is created by a secure, one-time, server-side bootstrap process that is idempotent/safe, refuses ordinary duplicate bootstrapping, assigns the `SUPER_ADMIN` role, uses a secure temporary credential process, and requires a password change at first login. The exact CLI mechanism is an architecture decision.

The Admin Portal manages students, teachers, academic structure, assignments, announcements, results, users and access, documents, audit logs, notifications, and school settings. Detailed navigation and workflows are defined in [Admin Flow](admin-flow.md).

## 14. Documents

Administrators configure student document requirements, but cannot disable the mandatory passport photograph. Other initial supported examples are birth certificate, admission document, and custom school-configured documents. Former-school results are not included.

Student documents use the review states `PENDING_REVIEW`, `VERIFIED`, and `REJECTED`.

## 15. Notifications

V1 provides in-app notifications for events such as registration approval, registration changes requested, assignment publication, announcement publication, result publication, correction decisions, and teacher account approval.

Notification delivery must be separable from the business event so that web push, PWA, or native channels can be added later without rewriting business modules.

## 16. Auditability and record retention

Important academic, security, and administrative mutations generate append-only audit events. Audit records must identify the action, actor, affected resource, time, and safe contextual metadata without containing credentials, tokens, or unnecessary sensitive data.

Important academic and history records are not permanently deleted. They transition through explicit states such as active, completed, archived, withdrawn, revoked, or graduated as appropriate.

## 17. V1 exclusions

The following are out of scope unless this specification is intentionally revised:

- school fees and payments;
- attendance;
- timetable;
- parent portal;
- CBT/examinations;
- student assignment submissions;
- chat or messaging;
- library management; and
- discipline management.

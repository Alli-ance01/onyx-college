# Teacher Flow

## 1. Entry into the system

There is no public teacher signup route. A teacher enters through one of two administrator-controlled paths:

- **Private invitation:** an authorized administrator records a Teacher Invitation and sends the private setup path to the intended recipient.
- **Direct staff creation:** an authorized administrator creates the staff/account record and provides a controlled account-setup path.

Invitation and account-setup tokens are secret, time-bound, single-use credentials and are never stored or displayed in plaintext after issuance.

## 2. Account setup and profile

1. The intended teacher completes account setup and establishes authentication credentials.
2. The teacher completes the required Teacher Registration/profile data when applicable.
3. The account remains pending or restricted until administrative approval.
4. An authorized administrator reviews the staff identity and profile.
5. Approval activates the Teacher profile and Teacher Portal eligibility.
6. The system sends an in-app notification and writes an audit event.

Account state, Teacher profile state, and academic assignments are separate. An active teacher account without an active assignment has no subject/class academic authority.

## 3. Academic assignment

An authorized administrator creates one or more Teaching Assignments. Each assignment identifies:

- teacher;
- subject;
- class level;
- track for senior school, or no track for junior school;
- academic session; and
- lifecycle state/effective validity.

A teacher may concurrently teach multiple subjects, classes, and senior tracks. Teachers cannot create or alter their own assignments.

Class Teacher Assignments are separate from Teaching Assignments. Class Teacher is not a global role and does not automatically authorize subject result entry. V1 permits only one active Class Teacher Assignment for an Academic Session, Class Level, and applicable Track; co-class teachers are not supported.

Assignment creation, change, revocation, or archival is audited. Historical assignments are preserved.

## 4. Teacher Portal

The Teacher Portal contains:

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

Every academic query and mutation is filtered and authorized server-side against active assignments and permissions. UI visibility mirrors those decisions but does not replace them.

The default Teacher permission bundle is `students.read`, `enrollments.read`, `assignments.create`, `assignments.update`, `assignments.publish`, `announcements.create_scoped`, `announcements.update_own`, `results.enter`, `results.submit`, and `results.request_correction`. These permissions never authorize an academic action outside a valid Teaching Assignment or Class Teacher Assignment.

## 5. Students and subjects

A teacher may view only students whose authoritative enrollment intersects the teacher's permitted academic scope. Subject-teacher access is limited by subject, class, track where applicable, and session. Class-teacher access may be broader at class level only for expressly permitted capabilities.

Medical records and unrelated sensitive documents are not exposed through ordinary academic access.

## 6. Assignments

Within a matching active Teaching Assignment, a teacher can:

1. create an assignment;
2. select the authorized subject and class/track audience;
3. add instructions and file attachments;
4. set a due date; and
5. publish it.

Students can view and download published assignments. V1 does not allow students to submit work, and teachers do not grade assignment submissions in the portal.

## 7. Results

For a valid Teaching Assignment, an authorized teacher can create or edit a draft Result Batch and its student Result Entries. Server-side rules validate enrollment, subject offering/override, configured assessment components, score bounds, and teacher scope. Totals and grades are calculated authoritatively by the system.

Only applicable `REQUIRED` Subject Offerings and administrator-added `OPTIONAL` subjects form a student's official curriculum. Result entry is not available for an optional subject until an authorized `ADD` Enrollment Subject Override exists.

The standard progression is:

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PUBLISHED`

While a batch is `UNDER_REVIEW`, an authorized reviewer may move it to `RETURNED_FOR_CORRECTION`. The authorized teacher may edit that returned batch and resubmit it to `SUBMITTED`. This route is unavailable after publication and is distinct from the published-result correction workflow.

Each required assessment component must be explicitly `SCORED` or `ABSENT`, and scores have at most two decimal places. `ABSENT` contributes zero but remains distinct from a scored zero. A missing component blocks submission. Authorized staff may apply result-level `EXEMPT`, which produces no normal total or grade and excludes the result from relevant aggregates.

Submission freezes ordinary teacher editing while the batch is in review. The user who entered or submitted a batch cannot approve that same batch. Approval requires another user with `results.approve`; an approver may publish only when they also hold `results.publish`. Students cannot view results until publication.

A published result is never silently edited. A discovered error uses the Result Correction Request workflow and produces an audit trail.

Where a Class Teacher Assignment and permission allow it, a class teacher may add a class teacher report-card remark for the assigned class/session/term. This does not grant result-entry rights for subjects the teacher is not assigned to teach.

## 8. Announcements

A teacher may create announcements only for audiences contained within active academic assignments and allowed by permission. The server validates the entire audience expression; a teacher cannot broaden a target by submitting client-controlled class, track, subject, or user identifiers.

## 9. Loss or change of access

Revoking an academic assignment immediately removes the authority it conferred while retaining the historical assignment and associated records. Account suspension, teacher deactivation, or permission removal can independently remove access. Where the risk warrants it, active authentication sessions are revoked.

## Daily portal and readiness extension — 8 October 2026

See [Timetable and daily work](../domain/timetable.md) for the approved weekly schedule, ownership rules and daily student agenda. Staff forms preserve failed submissions and warn before discarding unsaved work; result entry must be saved before submission. The [pilot checklist](../operations/pilot-checklist.md) defines acceptance tasks for this role.

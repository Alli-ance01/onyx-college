# Admin Flow

## 1. Administrator access

There is no public administrator signup. The first `SUPER_ADMIN` is created through a secure one-time server-side bootstrap process. It is idempotent/safe, refuses ordinary duplicate bootstrapping, assigns `SUPER_ADMIN`, uses a secure temporary credential process, and requires password change at first login. Its exact CLI mechanism is deferred to architecture. Additional administrators or staff are created or invited only by an authorized administrator with the relevant user/access permissions.

Administrative power is permission-based. `SUPER_ADMIN`, `SCHOOL_ADMIN`, and `PRINCIPAL` are initial role categories, not unconditional bypasses. `SUPER_ADMIN` receives every system permission but remains subject to invariants and security checks. `SCHOOL_ADMIN` receives broad operational administration but cannot modify the protected `SUPER_ADMIN` role or bootstrap another initial `SUPER_ADMIN`. `PRINCIPAL` receives broad visibility and academic/result oversight without routine role/permission or bootstrap administration by default. Sensitive actions remain authorized server-side and audited.

## 2. Admin Portal navigation

### Dashboard

Operational summaries and actionable queues, constrained by the administrator's permissions.

### Students

- All Students
- Pending Registrations
- Profiles
- Academic History
- Graduated
- Archived
- Correction Requests

### Teachers

- All Teachers
- Pending Approvals
- Invitations
- Profiles
- Teaching Assignments

### Academic Structure

- Sessions
- Terms
- Classes
- Senior Tracks
- Subjects
- Subject Offerings
- Promotions

### Academic operations

- Assignments
- Announcements
- Results
  - Assessment Configuration
  - Grading Configuration
  - Submitted Results
  - Review
  - Approval
  - Publishing
  - Corrections

### Administration

- Users & Access
  - Administrators
  - Roles
  - Permissions
- Documents
- Audit Logs
- Notifications
- School Settings

## 3. Student registration review

An authorized administrator reviews a submitted registration, verifies or rejects required documents, and either requests changes, rejects the registration, or prepares approval. `CHANGES_REQUESTED` is used for a generally valid application requiring corrections. `REJECTED` is terminal for the student, who cannot start another registration to bypass it. An administrator with `students.approve_registration` may explicitly reopen a rejected registration; reopening is audited. For approval, the administrator selects the authoritative session, class level, and senior track where required.

Registration intake performs deterministic duplicate detection using normalized first name, surname, date of birth, and primary guardian phone as a strong-candidate key. Strong matches to pending, approved, or rejected registrations enter an administrative duplicate-review queue. For a rejected match, an authorized administrator may reopen the original registration, confirm that the records represent different people, or reject the duplicate attempt. Partial/fuzzy matches produce warnings only. Every resolution and override is audited; email alone is not identity.

Approval atomically creates the Student profile, allocates the permanent non-reusable Student ID, establishes guardian and medical relationships, creates the initial Enrollment, activates full student access, notifies the student, and records audit events. Applicant-supplied placement is never treated as authoritative without review.

## 4. Student administration

Authorized administrators can inspect profiles and historical enrollments, process Profile Correction Requests, manage explicit `ADD`/`REMOVE` Enrollment Subject Overrides, and carry out promotion outcomes. `REQUIRED` offerings enter matching curricula automatically; an `OPTIONAL` offering requires an `ADD` override for an individual Enrollment, while `REMOVE` creates an exception from required curriculum. Every override records reason, actor, timestamp, and audit event. Students do not select official subjects. Administrators do not overwrite historical enrollments.

Promotion creates the next session's Enrollment. Repeat also creates a new enrollment for the next session. Withdraw, transfer, archive, and graduate preserve earlier history. JSS3-to-SS1 placement requires a senior track; SS3 graduation changes the Student lifecycle to `GRADUATED`.

All material changes are permission-controlled and audited.

## 5. Teacher administration

Authorized administrators can:

- issue, revoke, or inspect private Teacher Invitations;
- create staff through the controlled direct-creation path;
- review and approve teacher registrations/profiles;
- manage teacher lifecycle state as permitted;
- create multiple Teaching Assignments; and
- create separate Class Teacher Assignments.

Academic assignments specify session, class level, applicable track, and—only for Teaching Assignments—subject. Teachers never assign themselves. Assignment changes preserve history and generate audit events.

Only one active Class Teacher Assignment may exist for the same Academic Session, Class Level, and applicable Track. V1 does not support co-class teachers.

## 6. Academic configuration

Administrators with the relevant permissions manage Academic Sessions, Terms, class levels, senior tracks, the Subject catalogue, Subject Offerings, Enrollment Subject Overrides, Assessment Schemes, and Grading Schemes.

They also manage versioned registration-form configuration. Mandatory canonical and conditional fields cannot be disabled. Once a version has governed a submitted registration it is immutable, and changes create a new version.

Custom registration fields are limited to `TEXT`, `TEXTAREA`, `NUMBER`, `DATE`, `SELECT`, `MULTISELECT`, `BOOLEAN`, `EMAIL`, and `PHONE`, with the documented bounded configuration and validation. Custom files, executable validation, arbitrary regex, and a general conditional-form engine are not available in V1.

Sessions use `YYYY/YYYY` and statuses `DRAFT`, `ACTIVE`, `CLOSED`, or `ARCHIVED`. Exactly one Academic Session is `ACTIVE`; at most one of its Terms is `ACTIVE`. Activating a session or term is privileged and audited. `SchoolSettings.currentAcademicSessionId` and `currentTermId` must remain consistent with these states. Junior classes do not use tracks. No class arms exist in V1. Configuration used by historical records must not be destructively changed in a way that rewrites history.

## 7. Results administration

The result administration queues align with:

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PUBLISHED`

Authorized reviewers inspect submitted batches for scope, completeness, configured score rules, and anomalies. Separate permissions govern review, approval, and publication. Publication makes results visible to affected students and creates historical Term Report snapshots as applicable.

During review, a batch may move from `UNDER_REVIEW` to `RETURNED_FOR_CORRECTION`; the authorized teacher can edit and resubmit it. Every required component must be `SCORED` or `ABSENT`, unentered components block submission, and authorized result-level `EXEMPT` entries have no normal total/grade and are excluded from relevant aggregates.

The user who entered or submitted a batch cannot approve it. A different user with `results.approve` must approve; that approver may also publish only with `results.publish`. For published-result corrections, the requester cannot approve their own request.

Published results and reports cannot be silently edited. Corrections follow request, review, approval, controlled application, and audit.

Overall average is the arithmetic mean of eligible non-exempt subject percentages, where each percentage is `(subjectTotal / subjectMaximum) × 100`. Exempt subjects affect neither numerator nor denominator. Required non-exempt missing/unresolved results keep a report incomplete. Calculations are decimal-safe and avoid intermediate rounding; the final average is rounded once to two decimal places using the architecture-approved strategy.

If class position is enabled, no official position may be calculated or published until every eligible report in the session/term/class/track cohort is complete. V1 has no acknowledgement bypass. Administrators must complete the cohort or disable class-position publication for that reporting context.

## 8. Assignments and announcements

Administrators may oversee assignments according to permission. Administrator announcements may target the entire school, students, teachers, junior school, senior school, a class, a senior track, a class-and-track combination, or specific users.

## 9. Documents

Administrators configure Document Requirements and review Student Documents. Passport photograph is a mandatory canonical registration requirement and cannot be disabled. Other initial supported examples are birth certificate, admission document, and custom school-configured documents. Former-school results are excluded.

Document review states are `PENDING_REVIEW`, `VERIFIED`, and `REJECTED`. Review actions identify the reviewer, decision time, and safe reason metadata.

## 10. Users and access

Authorized administrators manage administrator accounts, Role assignments, and Permission grants within their authority. Only the initial `SUPER_ADMIN` role has unrestricted system-administration permissions by default. The protected `SUPER_ADMIN` role cannot be modified by `SCHOOL_ADMIN`, and the one-time bootstrap cannot be reused to create another initial super administrator. Access-control mutations are sensitive, audited, and may require active session revocation. The system never derives administrative authority from a frontend flag or broad `role === admin` condition.

## 11. Audit and notifications

Audit Logs are append-only and accessible only with explicit permission. They include important student, teacher, academic, result, security, and permission mutations without storing secrets.

V1 notifications are in-app. Business workflows publish notification intents without coupling themselves to a future delivery channel.

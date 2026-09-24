# Result Workflow

## 1. Scope and principles

Results are sensitive academic records. A result is valid only when tied to the correct student Enrollment, Subject, Academic Session, Term, assessment configuration, grading configuration, and authorized teacher scope.

The server validates component scores and calculates authoritative totals and grades. Client-calculated totals, grades, placement, or authorization claims are never trusted.

## 2. Configuration

`AssessmentScheme` defines named score components and their maximums. The initial default may be Continuous Assessment (40) and Examination (60), but schemes are configurable and must not be scattered as constants through the application.

`GradingScheme` defines non-overlapping score ranges and their grades, with any configured remarks or points. A scheme must cover the intended total-score range unambiguously.

Each Result Batch and published report must retain or reference the exact scheme versions/effective configuration used, so future changes do not recalculate history unexpectedly.

## 3. Result batch boundary

A `ResultBatch` groups entries for one teacher-authorized subject context:

- Academic Session;
- Term;
- Class Level;
- Track where applicable;
- Subject; and
- originating Teaching Assignment/teacher.

Each `ResultEntry` represents one enrolled student within that batch. A student appears at most once per batch, and only if the subject applies through a Subject Offering or explicit Enrollment Subject Override.

## 4. Lifecycle

The canonical result workflow is:

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PUBLISHED`

- `DRAFT`: an authorized teacher may enter or revise scoped scores.
- `SUBMITTED`: teacher entry is frozen and queued for review.
- `UNDER_REVIEW`: an authorized reviewer is actively checking the batch.
- `APPROVED`: an authorized approver has accepted the batch for publication.
- `PUBLISHED`: results are visible to eligible students and ordinary edits are prohibited.

During review, the allowed correction branch is:

`UNDER_REVIEW → RETURNED_FOR_CORRECTION → SUBMITTED`

- `RETURNED_FOR_CORRECTION`: the authorized teacher may edit the batch in response to recorded review feedback and resubmit it.

This branch preserves review comments and transition history. Returning a batch requires `results.review`. It is unavailable after `PUBLISHED` and is not the post-publication Result Correction Request workflow.

## 5. Draft validation and calculation

For every entry, the server verifies:

- the acting teacher has an active matching Teaching Assignment;
- the student has the matching Enrollment for the session/class/track;
- the subject applies to that enrollment;
- each required component is explicitly resolved as `SCORED` or `ABSENT`;
- each `SCORED` value is numeric, has at most two decimal places, and is within the component's configured bounds;
- each `ABSENT` component contributes zero but remains distinguishable from a legitimately scored zero;
- no required component is missing or unentered; and
- duplicate result entries do not exist.

The server computes the authoritative total from resolved components and maps it through the applicable Grading Scheme. A missing/unentered required component blocks submission.

Authorized staff may instead apply result-level `EXEMPT`. An exempt result has no normal total or grade and is excluded from relevant aggregate calculations. Applying or removing `EXEMPT` requires `results.enter`; teacher actors additionally require the matching active Teaching Assignment. Every change is audited.

## 6. Subject percentages and overall average

For every eligible non-exempt subject:

`subjectPercentage = (subjectTotal / subjectMaximum) × 100`

The authoritative overall average is:

`sum(eligible non-exempt subject percentages) / count(eligible non-exempt subjects)`

An `EXEMPT` subject contributes nothing to either numerator or denominator and retains no normal total/grade. A required, non-exempt subject with a missing or unresolved result prevents the final Term Report from becoming complete.

All calculations use decimal-safe server-side arithmetic. Component scores support at most two decimal places. Intermediate percentages, sums, and divisions are not repeatedly rounded. The final authoritative/displayed overall average is rounded once to two decimal places under the architecture-approved decimal strategy.

## 7. Submission, review, approval, and publication

Submitting records the submitter and time and prevents ordinary draft edits unless the batch is subsequently `RETURNED_FOR_CORRECTION`. Review records reviewer identity, time, comments, validation findings, and any return decision. Approval records the approver and time. Each transition requires its corresponding permission; teacher scope is additionally revalidated where applicable.

Every user who entered data in or submitted a Result Batch is disqualified from approving that batch. Approval therefore requires another authorized user with `results.approve`. The approver may also publish the approved batch if they independently hold `results.publish`. These checks apply even if one person otherwise holds both permissions.

Publication is an atomic workflow that:

1. verifies the batch is approved and has not already been published;
2. freezes the authoritative published values;
3. makes the results visible to the affected students;
4. creates or updates the corresponding historical Term Report snapshot in a controlled manner;
5. creates in-app result-published notifications; and
6. appends audit events.

Repeated publication attempts must be idempotent and must not create duplicate notifications or conflicting snapshots.

## 8. Student visibility

Students can access only their own `PUBLISHED` results and published Term Reports. Draft, submitted, under-review, and merely approved records are never student-visible. Authorization is checked when the resource is opened; a notification link does not grant access.

## 9. Term reports

A published `TermReport` is a historical snapshot and may contain school identity, student identity, Student ID, class level, track, session, term, subject assessment scores, totals, grades, overall average, optional class position, class teacher remark, and principal/administrator remark.

Students may view, print, and download the report as PDF. Attendance is excluded. Later changes to a Student profile, Enrollment, assessment scheme, grading scheme, school settings, or remarks must not silently alter a published snapshot.

Class position is configurable and disabled by default. When enabled, the cohort is the same Academic Session, Term, Class Level, and senior Track where applicable. Ranking uses the authoritative overall average and standard competition ranking for ties (`1, 2, 2, 4`). Official position cannot be calculated or published while any eligible report in the cohort is incomplete. V1 has no warning acknowledgement or “continue anyway” bypass. Administrators must complete the cohort or disable class-position publication for that reporting context.

## 10. Published-result correction

Published records are changed only through:

`Correction Request → Review → Approval → Application → Audit Record`

A `ResultCorrectionRequest` identifies the affected batch/entry/report, existing value, proposed value, reason, evidence where applicable, requester, review decision, approver, and application outcome.

Application is a controlled atomic operation that updates the authoritative corrected value, recomputes dependent totals/grade/average where necessary, creates a new preserved report snapshot or revision, records safe before/after values, and notifies affected users as configured. It never erases the fact that a correction occurred.

The requester of a published-result correction cannot approve that correction. Approval requires another user with `results.approve_correction`. Review and approval actions, including denials, are audited.

## 11. Audit requirements

Audit events cover at least batch submission, review start/outcome, return for correction, resubmission, exemption changes, approval, publication, correction request, correction decision, and correction application. Events identify actor, action, resource, timestamp, correlation/workflow identity, and safe metadata without copying unnecessary student-sensitive data or secrets.

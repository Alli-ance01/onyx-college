# Roles and Capabilities

## 1. Authorization model at a glance

Onyx College Portal uses three complementary controls:

1. **Account and profile state** determines whether the user and associated institutional profile are active.
2. **Permissions** authorize operations; global role names are not a substitute for permission checks.
3. **Academic scope** further limits teachers to resources covered by active Teaching Assignments or Class Teacher Assignments.

All protected decisions are enforced on the server. Navigation visibility is a usability feature, not a security boundary. Student IDs, database identifiers, route parameters, and client-provided role claims never grant access.

## 2. Initial global roles

### `SUPER_ADMIN`

The first privileged administrator is created through the secure one-time server-side bootstrap process, receives this role, and must change the temporary credential at first login. The default bundle contains every system permission. `SUPER_ADMIN` is the only initial unrestricted system-administration role, but remains subject to invariants, separation of duties, lifecycle rules, security controls, and audit requirements.

### `SCHOOL_ADMIN`

The default bundle provides broad operational administration of students, teachers, academic structure, enrollments, assignments, announcements, results, documents, and ordinary school settings. It excludes routine protected-role/permission and bootstrap management. A `SCHOOL_ADMIN` cannot modify the protected `SUPER_ADMIN` role or bootstrap another initial `SUPER_ADMIN`, even if a permission assignment would otherwise appear broad enough. Security-critical capabilities remain explicitly permission-controlled and audited.

### `PRINCIPAL`

The default bundle provides broad school, student, teacher, enrollment, and result visibility; academic oversight; `results.review`; `results.approve`; and `announcements.create_schoolwide`. `results.publish` may be separately granted. Routine role/permission administration and privileged security/bootstrap management are not included by default.

### `TEACHER`

The default permission bundle is `students.read`, `enrollments.read`, `assignments.create`, `assignments.update`, `assignments.publish`, `announcements.create_scoped`, `announcements.update_own`, `results.enter`, `results.submit`, and `results.request_correction`. Every class-, subject-, enrollment-, or student-facing action also requires an active assignment matching the requested session, class level, track where applicable, and subject where applicable.

### `STUDENT`

Students receive no administrative permission bundle. Ownership-based self-service permits viewing their own profile, subjects, academic history, assignments, announcements, published results/report cards, documents, and notifications; submitting their own Profile Correction Request; and managing allowed account preferences. These capabilities do not permit mutation of authoritative academic records.

Role defaults are starting permission assignments, not substitutes for ownership, domain invariants, resource lifecycle, sensitive-field controls, teacher scope, or separation-of-duties checks.

## 3. Capability matrix

The table states the product boundary, not fixed permission names. “Scoped” means the operation also requires a matching active academic assignment.

| Capability area | Student | Teacher | Authorized administrator/principal |
| --- | --- | --- | --- |
| Own onboarding registration | Create, edit before submission, submit, respond to change request | None | Review and decide with permission |
| Student profile | View own; request authoritative correction | View within authorized academic scope | Manage or correct with permission and audit |
| Enrollment/history | View own | View within assignment scope | Create initial enrollment; promote/repeat/withdraw/transfer/graduate with permission |
| Subjects | View own derived curriculum | View assigned subjects | Manage catalogue, offerings, and overrides with permission |
| Student documents | Upload/provide own required documents; view review state | No default access | Configure requirements and review documents with permission |
| Assignments | View/download assigned published items | Create and publish within subject/class scope | Oversight with permission |
| Assignment submission | Not available | Not available | Not available |
| Announcements | Read targeted announcements | Create/read within authorized scope | Create/read for permitted audiences |
| Result entry | None | Enter/edit drafts within valid Teaching Assignment | As granted for controlled operations |
| Result workflow | View only published own results | Enter and submit scoped batches; edit/resubmit returned batches | Review, return, approve, or publish according to permission and separation of duties |
| Result corrections | View own corrected published outcome; no administrative correction permission | Request correction within valid academic scope | Review, approve, and apply with permission; requester cannot self-approve |
| Report cards | View/print/download own published cards | Add permitted remarks or view scoped cards | Generate/review/publish with permission |
| Teacher management | None | View own profile; no self-assignment | Invite/create, approve, and assign with permission |
| Users, roles, permissions | Own account settings only | Own account settings only | Manage only with explicit access-control permissions |
| Audit logs | None by default | None by default | Read with explicit audit permission; append is system-controlled |
| School settings | None | None | Manage with explicit settings permission |

## 4. Teacher scope rules

For a subject-specific operation, the request must match an active Teaching Assignment on:

- teacher;
- academic session;
- class level;
- senior track for senior school, with no track for junior school; and
- subject.

This applies to result entry, subject assignments, subject-specific student access, and subject-targeted announcements. Assignment publication also requires the selected class and subject to be within this scope.

A Class Teacher Assignment is distinct. It may grant permitted class-wide visibility or class teacher tasks, such as a report-card remark, for its assigned class, applicable track, and academic session. It does not silently create subject-teaching authority.

V1 permits only one active Class Teacher Assignment per Academic Session, Class Level, and applicable Track. Co-class teachers are not supported.

Revoked, expired, future, inactive, or mismatched assignments do not authorize access.

## 5. Student access rules

An applicant account has only onboarding capabilities until approval completes atomically. Full student access requires an active account, an approved Student profile, and an authoritative initial Enrollment.

A student may access only records belonging to that student and intended for student visibility. Results and report cards require `PUBLISHED` state. Announcements must match the student's explicit identity or academic/audience membership.

## 6. Administrative access rules

There is no public administrator signup. The first `SUPER_ADMIN` is created through a secure, idempotent/safe, one-time server-side bootstrap that refuses ordinary duplicate bootstrapping, assigns the role, uses a secure temporary credential process, and requires password change at first login. The exact CLI mechanism is deferred to architecture. Later administrators or staff are created or invited by an authorized administrator.

Administrative operations require explicit permissions. Sensitive actions—registration decisions, teacher approval, assignment changes, promotion, result state transitions, result corrections, account suspension, and access-control changes—must be audited.

Role and permission changes take effect through the authorization system and must support session/token revocation where continued access would be unsafe.

## 7. Initial permission catalogue

The following permission codes are authoritative for the initial product. Permissions do not replace ownership, lifecycle, or scoped academic checks.

### Students and enrollment

- `students.read`
- `students.read_sensitive`
- `students.approve_registration`
- `students.update`
- `students.manage_corrections`
- `students.suspend`
- `students.withdraw`
- `students.graduate`
- `students.archive`
- `enrollments.read`
- `enrollments.manage`
- `enrollments.promote`

### Teachers

- `teachers.read`
- `teachers.invite`
- `teachers.create`
- `teachers.approve`
- `teachers.update`
- `teachers.suspend`
- `teachers.archive`
- `teachers.assign`

### Academic structure

- `sessions.manage`
- `terms.manage`
- `classes.manage`
- `tracks.manage`
- `subjects.manage`
- `subject_offerings.manage`

### Assignments and announcements

- `assignments.create`
- `assignments.update`
- `assignments.publish`
- `assignments.archive`
- `assignments.manage_all`
- `announcements.create_scoped`
- `announcements.create_schoolwide`
- `announcements.update_own`
- `announcements.manage_all`

### Results

- `results.enter`
- `results.submit`
- `results.review`
- `results.approve`
- `results.publish`
- `results.request_correction`
- `results.approve_correction`
- `results.configure`
- `results.read_all`

### Documents

- `documents.read`
- `documents.review`
- `documents.configure`

### Administration and system

- `admins.create`
- `admins.manage`
- `roles.manage`
- `permissions.manage`
- `users.suspend`
- `audit.read`
- `settings.manage`

Teacher operations involving classes, subjects, or students additionally require a matching active Teaching Assignment or Class Teacher Assignment. For Result Batches, the user who entered or submitted the batch cannot approve it. For published-result corrections, the requester cannot approve their own request.

## 8. Data sensitivity

- Medical and emergency information is least-privilege data and is not exposed merely because a user can view a student academically.
- Credentials, password hashes, refresh-token material, invitation/reset tokens, and secret keys are never returned as ordinary profile data or written to audit logs.
- Student documents and official biodata are limited to the subject and authorized staff.
- Audit-log access is itself privileged and does not allow audit records to be changed.

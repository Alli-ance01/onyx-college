# Authorization Model

## 1. Model

Authorization combines role-based grouping, permission-based decisions, resource ownership, academic scope, and lifecycle state. No single role name, frontend condition, Student ID, or client-supplied resource identifier is sufficient.

For every protected request, the server evaluates:

1. Is the authentication session valid and not revoked?
2. Is the User account in a state that permits this action?
3. Is the associated Student or Teacher profile in an eligible lifecycle state where required?
4. Does the user hold the explicit permission for the operation?
5. Does ownership or academic scope include the target resource?
6. Is the resource in a lifecycle state where the transition/action is legal?
7. Are sensitive-field restrictions and other invariants satisfied?

A denial at any step denies the operation.

## 2. Identity, roles, and permissions

`User` is the authentication identity. `Role` groups Permissions for administration, but authorization checks target permissions rather than scattered comparisons with role names. Initial roles are `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`, and `STUDENT`.

Role names do not bypass lifecycle, ownership, academic-scope, or state-transition checks. Changes to roles and permissions are audited and may revoke active Auth Sessions.

Account state is separate from Student/Teacher lifecycle. For example, an authenticated applicant may have onboarding access but no approved Student profile; an approved teacher with no active assignments has portal access but no class/subject authority.

Default role bundles are:

- **`SUPER_ADMIN`:** every system permission. It is the only initial unrestricted system-administration role, but cannot bypass invariants, separation of duties, lifecycle rules, or security checks.
- **`SCHOOL_ADMIN`:** broad operational permissions across students, teachers, academic structure, enrollments, assignments, announcements, results, documents, and ordinary settings. It cannot modify the protected `SUPER_ADMIN` role or invoke bootstrap to create another initial super administrator. Security-critical permissions remain explicit.
- **`PRINCIPAL`:** broad school/student/teacher/enrollment/result visibility, academic oversight, `results.review`, `results.approve`, and `announcements.create_schoolwide`. `results.publish` is available only when separately granted. Routine role/permission and privileged bootstrap management are absent by default.
- **`TEACHER`:** `students.read`, `enrollments.read`, `assignments.create`, `assignments.update`, `assignments.publish`, `announcements.create_scoped`, `announcements.update_own`, `results.enter`, `results.submit`, and `results.request_correction`, always restricted by applicable academic scope.
- **`STUDENT`:** no administrative permissions. Normal portal capabilities are ownership-based.

Defaults are initial grants, not substitutes for domain/resource authorization.

## 3. Student rules

A student can access only their own permitted records. Full portal access requires a valid account, approved Student profile, and initial Enrollment.

Students may edit permitted account preferences and registration data only in allowed onboarding states. They cannot directly change official name, date of birth, Student ID, enrollment, track, academic history, curriculum assignments, or results. They use Profile Correction Requests or dedicated academic correction workflows.

A rejected Student Registration is not student-editable and cannot be bypassed by creating a replacement registration. Only an administrator with `students.approve_registration` may explicitly reopen it, and the reopen requires an audit event.

Students use ownership-based capabilities to view their own profile, subjects, academic history, assignments, announcements, published results/report cards, documents, and notifications; submit their own Profile Correction Request; and manage allowed account preferences. These do not require or imply an administrative permission bundle.

Strong duplicate candidates are routed to authorized administrative review rather than automatically merged or rejected. Resolution requires `students.approve_registration` and audit. A fuzzy/partial warning cannot itself deny access, and email alone is never treated as proof of identity.

Results and Term Reports require `PUBLISHED` state. Announcements and Assignments must resolve to the student's identity or authoritative academic/audience membership.

## 4. Teacher rules

The `TEACHER` role provides no blanket academic access. Subject operations require an active Teaching Assignment matching:

- the authenticated Teacher;
- Academic Session;
- Class Level;
- Track for senior school, or no track for junior school; and
- Subject.

Depending on explicit permission, this scope governs access to students, result entry, assignment creation/publication, and subject/class announcements.

A Class Teacher Assignment matches Teacher, Academic Session, Class Level, and applicable Track. It may authorize class-level visibility or class-teacher tasks specifically granted by permission. It does not imply subject result-entry authority.

Only one active Class Teacher Assignment may exist for a given Academic Session, Class Level, and applicable Track in V1.

The target student's Enrollment must also match the requested academic context. A client cannot manufacture authority by submitting matching IDs; the server loads and verifies the relationships.

Subject access additionally requires the subject to be in the student's official curriculum: an applicable `REQUIRED` offering without a `REMOVE` override, or an applicable `OPTIONAL` offering with an `ADD` override. Teacher scope alone cannot add a subject to an Enrollment.

## 5. Administrator and principal rules

There is no universal `isAdmin` bypass. Administrative actions require specific permissions, including separate controls for student registration decisions, profile corrections, teacher invitations/approval, academic configuration, assignments, announcements, promotions, result review/approval/publication/correction, document review, user administration, permission management, audit viewing, and school settings.

The first `SUPER_ADMIN` is created only through a secure one-time server-side bootstrap. The process is idempotent/safe, refuses ordinary duplicate bootstrapping, assigns `SUPER_ADMIN`, uses a secure temporary credential process, and marks the account to require password change at first login. There is no public administrator signup endpoint. The exact bootstrap CLI is an architecture decision. Later administrator creation/invitation is restricted and audited.

The protected `SUPER_ADMIN` role cannot be modified by `SCHOOL_ADMIN`, regardless of a broad operational grant. Bootstrap is not an ordinary administrator-creation path and cannot be invoked again to create another initial `SUPER_ADMIN`.

## 6. Initial permission catalogue

The initial authoritative permissions are:

- **Students:** `students.read`, `students.read_sensitive`, `students.approve_registration`, `students.update`, `students.manage_corrections`, `students.suspend`, `students.withdraw`, `students.graduate`, `students.archive`.
- **Teachers:** `teachers.read`, `teachers.invite`, `teachers.create`, `teachers.approve`, `teachers.update`, `teachers.suspend`, `teachers.archive`, `teachers.assign`.
- **Academic structure:** `sessions.manage`, `terms.manage`, `classes.manage`, `tracks.manage`, `subjects.manage`, `subject_offerings.manage`.
- **Enrollments:** `enrollments.read`, `enrollments.manage`, `enrollments.promote`.
- **Assignments:** `assignments.create`, `assignments.update`, `assignments.publish`, `assignments.archive`, `assignments.manage_all`.
- **Announcements:** `announcements.create_scoped`, `announcements.create_schoolwide`, `announcements.update_own`, `announcements.manage_all`.
- **Results:** `results.enter`, `results.submit`, `results.review`, `results.approve`, `results.publish`, `results.request_correction`, `results.approve_correction`, `results.configure`, `results.read_all`.
- **Documents:** `documents.read`, `documents.review`, `documents.configure`.
- **Administrators and users:** `admins.create`, `admins.manage`, `roles.manage`, `permissions.manage`, `users.suspend`.
- **System:** `audit.read`, `settings.manage`.

Holding a permission is necessary but may not be sufficient. Teacher actions involving classes, subjects, or students also require a matching active Teaching Assignment or Class Teacher Assignment. Ownership, sensitive-field restrictions, resource lifecycle, and separation-of-duties rules continue to apply.

Changing the active Academic Session requires `sessions.manage`; changing the active Term requires `terms.manage`. Both are privileged audited operations and must preserve consistency with `SchoolSettings.currentAcademicSessionId` and `currentTermId`. Registration-form configuration requires `settings.manage` and remains bounded by the canonical/custom-field rules.

## 7. Resource and field-level protection

- Student and teacher self-access is based on the authenticated User-to-profile relationship, not an ID supplied by the client.
- Medical/emergency data requires `students.read_sensitive` for staff access; ordinary class visibility and `students.read` are insufficient.
- Student Documents require ownership or `documents.read`/`documents.review` as applicable and secure file delivery.
- Auth Session secrets, password hashes, refresh-token material, invitation/reset tokens, and keys are never exposed through authorization-protected DTOs.
- Audit Logs are append-only; an audit-view permission grants reading, not mutation.
- Published results and reports require correction workflow permissions rather than general edit permission.
- A user who entered data in or submitted a Result Batch cannot approve it, even when that user holds `results.approve`.
- A published-result correction requester cannot approve their own request, even when that user holds `results.approve_correction`.
- `SCHOOL_ADMIN` cannot modify the protected `SUPER_ADMIN` role even if assigned general role-management capability.

## 8. Lifecycle-aware authorization

Permissions authorize a kind of action; resource state determines whether that action is currently legal. Examples:

- only draft registration data is ordinarily applicant-editable;
- only a reviewable registration can be approved;
- only a `DRAFT` or `RETURNED_FOR_CORRECTION` Result Batch can receive ordinary score edits;
- only an approved result can be published;
- only `UNDER_REVIEW` can be returned for pre-publication correction, and a published batch can never be returned;
- published results require correction workflow;
- revoked academic assignments grant no access; and
- archived, withdrawn, transferred, graduated, suspended, or otherwise inactive profiles have only explicitly allowed capabilities.

## 9. Revocation and caching

Auth Sessions support revocation. Account suspension, high-risk role/permission changes, credential compromise, or staff separation can invalidate existing sessions.

Authorization data may be cached only if revocation and permission changes become effective within an explicitly accepted window. Long-lived client claims cannot be the sole source of current permissions or academic scope.

## 10. Audit and denial handling

Successful sensitive mutations generate Audit Logs. High-risk denied actions may also be security-audited without storing secrets or excessive sensitive request data.

Responses must not reveal whether an inaccessible sensitive record exists. Production errors expose a safe denial rather than internal stack traces or hidden authorization details.

## 11. Required authorization tests

Tests must cover permission allow/deny behavior, student ownership, rejected-registration reopening, teacher scope across subject/class/track/session, junior no-track rules, single-active-class-teacher enforcement, inactive/revoked assignments, returned-result editing, result approval separation of duties, correction-request separation of duties, unpublished result isolation, published-result protection, medical/document restrictions, role/permission revocation, bootstrap duplicate refusal, and attempts to substitute client-controlled identifiers.
Tests must also cover default role grants, student ownership without an administrative bundle, protected `SUPER_ADMIN` mutation denial, duplicate-review authorization, exactly one active session, at-most-one active term, and School Settings/current-state consistency.

## Timetable extension

`timetable.manage` authorizes term schedule publication. It is included in the standard school administrator catalogue; custom roles remain explicit. Student and teacher reads use server-side enrollment/curriculum and active teaching assignments. Timetable membership never grants academic authority. See [timetable invariants](timetable.md).

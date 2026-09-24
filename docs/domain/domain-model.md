# Domain Model

## 1. Modeling principles

This is the canonical conceptual domain model, not a Mongoose or database schema. Entities with independent lifecycle, history, authorization, or query needs remain separate and are related by stable identifiers.

Unless stated otherwise, records have an internal immutable identifier and created/updated timestamps. Records that participate in decisions also identify the relevant actor and decision time. Important academic and security records are retained through lifecycle states rather than hard deletion. Free-text snapshots are not substitutes for references, although published historical artifacts may intentionally snapshot display data.

Indexes listed below express required access paths and integrity constraints. Exact database index syntax belongs to later architecture.

## 2. Identity and access

### User

- **Purpose:** Authentication identity for an applicant, student, teacher, or administrator.
- **Important fields:** normalized login identifier(s), password hash, account state, verification state, linked role identifiers, password-change-required flag, last-authentication metadata, and security timestamps. Public profile data does not belong here unless required for identity.
- **Relationships:** has Roles; owns Auth Sessions; may link to one Student or Teacher profile and may be the actor/requester on domain records.
- **Lifecycle/statuses:** pending verification, active, suspended, disabled, or archived. Account state is independent of Student/Teacher lifecycle.
- **Uniqueness/invariants:** normalized login identifiers are unique; passwords are stored only as secure hashes; a User cannot be linked inconsistently to multiple profiles of the same kind; the bootstrapped `SUPER_ADMIN` must change the secure temporary credential at first login.
- **Important indexes:** unique normalized email/username as selected by authentication policy; account state; role membership where needed for administration.
- **Security:** never expose password hashes, reset secrets, or token material. Authentication and authorization decisions use server-loaded current state.

### Role

- **Purpose:** Named grouping of Permissions. Initial system roles are `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`, and `STUDENT`.
- **Important fields:** unique code, display name, description, default permission references, protected-role flag, system-managed flag, and lifecycle state.
- **Relationships:** contains Permissions; assigned to Users.
- **Lifecycle/statuses:** active or retired. Retiring a role does not erase historical assignments/audit context.
- **Uniqueness/invariants:** role code is unique; `SUPER_ADMIN` receives every system permission and is the only initial unrestricted system-administration role; `SCHOOL_ADMIN` cannot modify the protected `SUPER_ADMIN` role; protected roles cannot be silently renamed or deleted; `STUDENT` has no administrative permission bundle; role membership never replaces resource-scope checks.
- **Important indexes:** unique role code; lifecycle state.
- **Security:** role and permission mutations require dedicated permissions, audit events, and possibly Auth Session revocation. Even `SUPER_ADMIN` remains subject to invariants, separation of duties, and security controls.

### Permission

- **Purpose:** Atomic authorization capability checked by protected operations.
- **Important fields:** unique code, description, capability domain, sensitivity classification, and lifecycle state.
- **Relationships:** granted through Roles; evaluated alongside User/profile state, ownership, academic assignments, and resource state.
- **Lifecycle/statuses:** active or retired.
- **Uniqueness/invariants:** permission code is globally unique and stable; the initial codes are the authoritative catalogue in [Authorization Model](authorization-model.md#6-initial-permission-catalogue); retiring a permission must not accidentally widen access.
- **Important indexes:** unique permission code; capability domain; lifecycle state.
- **Security:** definitions and grants are privileged. Permission changes are audited and denied by default when state is missing or ambiguous.

### AuthSession

- **Purpose:** Revocable authenticated session for a User and device/client context.
- **Important fields:** User reference, hashed refresh/session token identifier, issued/expiry/revoked timestamps, revocation reason, rotation lineage, and limited device/network metadata.
- **Relationships:** belongs to User; may be invalidated by security or access-control events.
- **Lifecycle/statuses:** active, expired, revoked, or superseded/rotated.
- **Uniqueness/invariants:** plaintext refresh tokens are never stored; rotation prevents replay; expired or revoked sessions cannot authenticate.
- **Important indexes:** hashed token lookup (unique where applicable); User plus active/expiry; expiry for cleanup; rotation family.
- **Security:** token material is secret, metadata is access-restricted, and audit logs must not contain tokens.

## 3. Student domain

### StudentRegistration

- **Purpose:** Applicant-owned onboarding record and preserved administrative decision history before Student creation.
- **Important fields:** User reference, Registration Form Configuration version, typed canonical personal/contact/guardian/academic data, configurable/custom responses, normalized duplicate-match keys, duplicate candidate references/confidence, duplicate-review resolution, submitted snapshot/version, status, submission/review/decision/reopen metadata, change-request/rejection reasons, and created Student/Enrollment references after approval.
- **Relationships:** belongs to User and an immutable Registration Form Configuration version; references uploaded Student Documents and proposed/created Guardian data; approval creates Student, StudentGuardian links, StudentMedicalProfile, and Enrollment.
- **Lifecycle/statuses:** `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, or `REJECTED`.
- **Uniqueness/invariants:** mandatory canonical and conditional fields for the governing configuration are satisfied; only eligible states transition; one approval creates at most one Student; requested placement is never authoritative; approved/rejected submissions are retained; strong matches use normalized first name/surname/date of birth/primary guardian phone and require review; fuzzy matches warn but do not auto-reject; one applicant/User cannot create a replacement registration to bypass rejection; administrative reopening operates on the rejected record and is explicit and audited.
- **Important indexes:** User and canonical registration lineage; normalized strong-match fields for candidate lookup; duplicate-review state; status plus submitted time for review queues; reviewer; unique created Student reference when present.
- **Security:** applicant access is ownership-based; duplicate resolution/reopening requires `students.approve_registration`; match decisions and overrides are audited; email alone is not identity; no biometric, NIN, or external identity dependency is assumed; medical/document data is least privilege.

### RegistrationFormConfiguration

- **Purpose:** Immutable, versioned definition of the registration form fields and validation rules governing submitted Student Registrations.
- **Important fields:** version identifier, status, mandatory canonical field definitions, explicit known conditional rules, enabled optional canonical fields, custom field definitions, effective metadata, creator/publisher, and usage timestamp/count metadata. Each custom definition has type, key, label, help text, applicable placeholder, section, display order, enabled, required, and supported type-specific validation.
- **Relationships:** referenced by every Student Registration it governs; the current selectable version may be referenced by School Settings.
- **Lifecycle/statuses:** draft, active, superseded, or archived. A used version remains retained and interpretable.
- **Uniqueness/invariants:** version identifier is unique; once any registration is submitted under a version, its field definitions and validation rules are immutable; changes create a new version; administrators cannot disable mandatory canonical or conditional fields; custom types are limited to `TEXT`, `TEXTAREA`, `NUMBER`, `DATE`, `SELECT`, `MULTISELECT`, `BOOLEAN`, `EMAIL`, and `PHONE`; arbitrary custom files, executable validation, arbitrary regex, and a general conditional engine are prohibited.
- **Important indexes:** unique version identifier; status/effective time; lookup for the current active version.
- **Security:** configuration changes require `settings.manage` and audit; custom field definitions are validated and cannot weaken canonical requirements or expose sensitive responses broadly. Text lengths, number bounds, date bounds, configured select options, standard email/phone validation, and Boolean required semantics are the only V1 custom validations.

### Student

- **Purpose:** Approved institutional student profile with permanent identity and lifecycle, separate from login and placement history.
- **Important fields:** User reference, permanent Student ID, authoritative biodata, lifecycle status, approval origin, and profile-effective metadata. No authoritative mutable current-class field is stored.
- **Relationships:** belongs to User; created from StudentRegistration; has Enrollments, StudentGuardian links, StudentMedicalProfile, documents, corrections, results/reports, and notifications.
- **Lifecycle/statuses:** active, withdrawn, transferred, graduated, or archived.
- **Uniqueness/invariants:** Student ID and User link are unique; Student ID is permanent and never reused; its numeric sequence has a minimum four-digit width and grows naturally beyond 9999 without rollover; current placement derives from Enrollment.
- **Important indexes:** unique Student ID; unique User reference; lifecycle status; normalized official name only as a search aid, never identity.
- **Security:** students can read their own permitted profile but cannot directly edit authoritative biodata. Student ID is not a credential.

### Guardian

- **Purpose:** Reusable person record for a parent or guardian independently related to one or more students.
- **Important fields:** name, contact details, address where needed, identity/contact normalization, and record state.
- **Relationships:** connected to Students through StudentGuardian, never by embedding the entire relationship into Student.
- **Lifecycle/statuses:** active or archived.
- **Uniqueness/invariants:** duplicate detection may use normalized contact details but must not incorrectly merge different people; shared guardians remain one relationship-capable entity.
- **Important indexes:** normalized phone/email for lookup and deduplication; lifecycle state.
- **Security:** guardian data is sensitive and not a parent-portal login. Access is limited to the related student and authorized staff as policy permits.

### StudentGuardian

- **Purpose:** Explicit many-to-many relationship between a Student and Guardian, including relationship-specific responsibilities.
- **Important fields:** Student reference, Guardian reference, relationship type, primary-contact flag, emergency-contact flag, effective dates, and state.
- **Relationships:** belongs to one Student and one Guardian.
- **Lifecycle/statuses:** active, ended, or archived.
- **Uniqueness/invariants:** no duplicate active Student/Guardian relationship of the same meaning; primary/emergency contact rules must be enforced according to school policy.
- **Important indexes:** Student plus state; Guardian plus state; uniqueness across Student, Guardian, and relationship/effective context.
- **Security:** changing a relationship is an authoritative profile operation and must be permission-controlled and audited.

### StudentMedicalProfile

- **Purpose:** Restricted medical and emergency information associated with an approved Student.
- **Important fields:** Student reference, emergency notes/contacts, allergies or medical conditions required by approved policy, care instructions, last-reviewed metadata, and state.
- **Relationships:** one current profile per Student, created from approved registration data; may preserve controlled revision history.
- **Lifecycle/statuses:** active or archived/superseded.
- **Uniqueness/invariants:** one effective profile per Student; only necessary data is collected; history is not silently overwritten where safety or audit requires retention.
- **Important indexes:** unique effective Student reference; last-reviewed date.
- **Security:** highly restricted least-privilege data; ordinary teacher class access does not grant medical access; do not copy medical detail into logs or notifications.

### ProfileCorrectionRequest

- **Purpose:** Controlled request to change authoritative Student biodata after approval.
- **Important fields:** Student/requester, target field, current-value snapshot, proposed value, reason, supporting document references, status, reviewer/decision, applied-by/time, and audit correlation.
- **Relationships:** belongs to Student; initiated by User; may reference Student Documents; results in a controlled Student update.
- **Lifecycle/statuses:** submitted, under review, approved, rejected, or applied.
- **Uniqueness/invariants:** approved data remains unchanged until application; each applied request is applied once; Student ID, Enrollment, subject, and result changes are excluded.
- **Important indexes:** Student plus status/time; review queue by status; target field; reviewer.
- **Security:** ownership for student viewing; staff review/application requires explicit permissions; before/after values are audited safely.

## 4. Academic structure

### AcademicSession

- **Purpose:** School-year boundary for enrollment, assignments, offerings, results, and reporting.
- **Important fields:** label, start year, end year, dates, authoritative status, and activation/closure metadata.
- **Relationships:** has Terms, Enrollments, academic assignments, offerings/configurations, results, and reports.
- **Lifecycle/statuses:** `DRAFT`, `ACTIVE`, `CLOSED`, or `ARCHIVED`.
- **Uniqueness/invariants:** label is unique and formatted `YYYY/YYYY`; end year is start year plus one; exactly one Academic Session is `ACTIVE`; `SchoolSettings.currentAcademicSessionId` references that same session.
- **Important indexes:** unique label; unique/equivalent constraint for `ACTIVE` status; status/date range.
- **Security:** mutations require `sessions.manage`; activation/closure is privileged and audited; sessions used by history cannot be deleted or casually relabeled.

### Term

- **Purpose:** Ordered First, Second, or Third Term within an Academic Session.
- **Important fields:** Academic Session, term code/name, ordinal, start/end dates, lifecycle state, and activation/closure metadata.
- **Relationships:** belongs to AcademicSession; referenced by result batches, reports, assignments/announcements where term context is needed.
- **Lifecycle/statuses:** planned, active, completed, or archived.
- **Uniqueness/invariants:** exactly one of each term ordinal per session; at most one Term within the `ACTIVE` Academic Session is `ACTIVE`; an active Term belongs to the active session; `SchoolSettings.currentTermId` references that same Term; dates fall within/align with the session and do not conflict.
- **Important indexes:** unique AcademicSession plus ordinal/code; lifecycle/date range.
- **Security:** configuration and activation require `terms.manage`; active-state changes are audited; historical term references are preserved.

### ClassLevel

- **Purpose:** Reference catalogue of ordered school levels JSS1 through SS3.
- **Important fields:** unique code, display name, stage (`JUNIOR` or `SENIOR`), progression order, and active state.
- **Relationships:** referenced by Enrollments, Subject Offerings, Teaching Assignments, Class Teacher Assignments, results, and targeting.
- **Lifecycle/statuses:** active or retired.
- **Uniqueness/invariants:** code and progression order are unique; initial catalogue is JSS1, JSS2, JSS3, SS1, SS2, SS3; no class arms are modeled.
- **Important indexes:** unique code; unique progression order; stage plus active state.
- **Security:** only authorized academic configuration can mutate catalogue entries; used levels are retired rather than deleted.

### Track

- **Purpose:** Reference catalogue for senior-school specializations.
- **Important fields:** unique code, display name, and active state.
- **Relationships:** used by senior Enrollments, Subject Offerings, teaching/class-teacher assignments, results, and audiences.
- **Lifecycle/statuses:** active or retired.
- **Uniqueness/invariants:** initial values are Science, Arts, and Commercial; a Track is invalid in junior contexts.
- **Important indexes:** unique code; active state.
- **Security:** configuration requires permission; referenced tracks cannot be destructively removed from history.

### Enrollment

- **Purpose:** Authoritative historical placement of a Student in one Academic Session.
- **Important fields:** Student, Academic Session, Class Level, optional Track, lifecycle status, entry/progression source, effective/completion dates, and outcome metadata.
- **Relationships:** belongs to Student/session/class and optionally Track; anchors subject overrides, results, and academic history; may reference source/destination enrollment for progression traceability.
- **Lifecycle/statuses:** active, completed, repeated, withdrawn, transferred, graduated, or archived as applicable.
- **Uniqueness/invariants:** one authoritative Enrollment per Student/session; junior has no Track; senior requires Track; progression creates a new record and never rewrites prior placement.
- **Important indexes:** unique Student plus Academic Session; session/class/track/status for rosters; Student plus session chronology.
- **Security:** students read their own enrollment only; creation/outcome changes require permission, transaction, and audit.

### Subject

- **Purpose:** School-wide subject catalogue independent of any particular class or track.
- **Important fields:** unique code, name, description, and active state.
- **Relationships:** referenced by Subject Offerings, Teaching Assignments, Assignments, Result Batches, and overrides.
- **Lifecycle/statuses:** active or retired.
- **Uniqueness/invariants:** stable unique code; name uniqueness follows school naming policy; used subjects are retired rather than deleted.
- **Important indexes:** unique code; normalized name for search; active state.
- **Security:** catalogue mutation requires permission and audit where it changes academic availability.

### SubjectOffering

- **Purpose:** Defines that a Subject is offered to a Class Level and applicable Track, as required or optional, for an effective academic context.
- **Important fields:** Subject, Class Level, optional Track, classification (`REQUIRED` or `OPTIONAL`), Academic Session or effective-version scope, and active state.
- **Relationships:** references subject/class/track/session; determines curriculum for Enrollments and validates assignments/results.
- **Lifecycle/statuses:** planned, active, retired, or archived.
- **Uniqueness/invariants:** no duplicate active offering for the same subject/class/track/effective context; junior Track is absent and senior Track is valid; `REQUIRED` automatically enters matching curricula; `OPTIONAL` requires an individual `ADD` override; historical use is preserved.
- **Important indexes:** unique composite scope; class/track/session for curriculum lookup; subject/session; active state.
- **Security:** only authorized administrators configure offerings; changes affecting curricula are audited.

### EnrollmentSubjectOverride

- **Purpose:** Explicitly adds or removes a Subject for one student's Enrollment as an exception to standard offerings.
- **Important fields:** Enrollment, Subject, action (`ADD` or `REMOVE`), required reason, actor, timestamp, effective metadata, audit correlation, and state.
- **Relationships:** belongs to Enrollment and Subject; evaluated after standard Subject Offerings.
- **Lifecycle/statuses:** active, revoked, or archived.
- **Uniqueness/invariants:** at most one effective override per Enrollment/Subject; `ADD` is used to include an applicable `OPTIONAL` offering and `REMOVE` for an exceptional removal from required curriculum; actions cannot conflict; reason/actor/timestamp/audit event are mandatory; the override stays tied to its historical Enrollment; students do not choose official curriculum.
- **Important indexes:** unique effective Enrollment plus Subject; Enrollment/state; Subject/state.
- **Security:** students cannot create overrides; `enrollments.manage`, a reason, and an audit event are required.

## 5. Teacher domain

### Teacher

- **Purpose:** Approved staff profile for a teacher, distinct from authentication and academic assignments.
- **Important fields:** User reference, authoritative profile/contact data, employment/profile lifecycle state, approval metadata, and source invitation/registration.
- **Relationships:** belongs to User; may originate from TeacherInvitation and TeacherRegistration; has Teaching Assignments and Class Teacher Assignments.
- **Lifecycle/statuses:** pending approval, active, suspended, inactive, or archived.
- **Uniqueness/invariants:** one Teacher per User; activation requires the required approval; active profile alone grants no academic scope.
- **Important indexes:** unique User reference; unique staff identifier when present; lifecycle status; normalized name for administrative search.
- **Security:** self-service changes are limited; assignment/approval changes require permission and audit; sensitive staff data is not student-visible.

### TeacherInvitation

- **Purpose:** Private, administrator-issued invitation for an intended teacher to establish an account.
- **Important fields:** intended recipient identifier, hashed token, issuer, issue/expiry/accepted/revoked timestamps, status, and resulting User/Teacher references.
- **Relationships:** issued by User; accepted into User/Teacher Registration flow; may link to final Teacher.
- **Lifecycle/statuses:** pending, accepted, expired, or revoked.
- **Uniqueness/invariants:** token is high entropy, single-use, time-bound, and stored only as a hash; accepted/revoked/expired invitations cannot be reused.
- **Important indexes:** unique hashed token; recipient plus status; expiry for cleanup; issuer/time.
- **Security:** never expose stored token values; invitation issuance/revocation is permission-controlled and audited; responses should resist recipient enumeration.

### TeacherRegistration

- **Purpose:** Captures teacher-supplied or administrator-supplied profile information for approval before full Teacher activation.
- **Important fields:** User/invitation reference, typed staff/profile fields, submitted snapshot/version, status, submission/review/decision metadata, and resulting Teacher reference.
- **Relationships:** belongs to User and optionally TeacherInvitation; approval creates or activates Teacher.
- **Lifecycle/statuses:** draft, submitted, under review, changes requested, approved, or rejected.
- **Uniqueness/invariants:** one registration cannot create multiple Teachers; approval does not create academic assignments; decision history is retained.
- **Important indexes:** User; status/submitted time for queues; invitation; unique resulting Teacher when present.
- **Security:** applicant/teacher access is ownership-based; approval requires permission; sensitive decision data is restricted and audited.

### TeachingAssignment

- **Purpose:** Resource scope authorizing a Teacher to teach one Subject in a class/track/session context.
- **Important fields:** Teacher, Subject, Class Level, optional Track, Academic Session, effective dates, status, assigner, and revocation reason/metadata.
- **Relationships:** references Teacher, Subject, ClassLevel, Track, and AcademicSession; authorizes scoped Assignments, result work, student access, and announcements.
- **Lifecycle/statuses:** planned, active, revoked, completed, or archived.
- **Uniqueness/invariants:** no duplicate effective assignment for the same complete scope; junior Track absent and senior Track valid; only active/effective assignments authorize; teacher cannot self-assign.
- **Important indexes:** composite Teacher/session/class/track/subject/status; class/track/session/subject for staffing lookup; effective dates.
- **Security:** creation/change/revocation requires permission and audit; every scoped request reloads or reliably resolves current assignment state.

### ClassTeacherAssignment

- **Purpose:** Separately designates a Teacher as class teacher for a class/track/session without making Class Teacher a global role.
- **Important fields:** Teacher, Class Level, optional Track, Academic Session, effective dates, status, assigner, and revocation metadata.
- **Relationships:** references Teacher and academic context; may authorize class-wide capabilities such as permitted visibility or report remarks.
- **Lifecycle/statuses:** planned, active, revoked, completed, or archived.
- **Uniqueness/invariants:** junior Track absent and senior Track valid; only active/effective records authorize; exactly zero or one active record may exist per Academic Session/Class Level/applicable Track; co-class teachers are not supported; no subject authority is implied.
- **Important indexes:** Teacher/session/status; class/track/session/status; unique active Academic Session/Class Level/applicable Track scope.
- **Security:** changes require `teachers.assign` and audit; authorization distinguishes class-teacher capabilities from Teaching Assignment scope.

## 6. Assignments

### Assignment

- **Purpose:** Teacher-created learning task distributed for student reading/download in V1.
- **Important fields:** creator Teacher, originating Teaching Assignment, Subject, Class Level, optional Track, Academic Session, title, instructions, attachment references, due date, status, and publication metadata.
- **Relationships:** scoped by TeachingAssignment and academic references; visible to Students through matching Enrollments/curriculum.
- **Lifecycle/statuses:** draft, published, or archived.
- **Uniqueness/invariants:** creator must have active matching scope at creation/publication; publication target cannot exceed scope; no submission or grading relationship exists in V1.
- **Important indexes:** audience/session/status/publication date; Teacher/status; due date; Subject/class/track.
- **Security:** attachments use authorized delivery; students read only matched published items; file metadata/content is validated and audited as appropriate.

## 7. Announcements

### Announcement

- **Purpose:** Publishes information to an explicitly resolved school, role, academic, or user audience.
- **Important fields:** author, title, body, audience expression, resolved/effective targeting context, status, and publication/expiry metadata.
- **Relationships:** authored by User; may reference ClassLevel, Track, academic session, subject/assignment scope, roles, or specific Users.
- **Lifecycle/statuses:** draft, published, expired, withdrawn, or archived.
- **Uniqueness/invariants:** students cannot author; teacher target is contained within active assignment scope; administrator target requires permission; only published and unexpired items are generally consumable.
- **Important indexes:** status/publication/expiry; audience dimensions; author/time; specific user target where represented.
- **Security:** server resolves/validates audiences and sanitizes content; client-provided group IDs never broaden teacher scope; attachments require authorization.

## 8. Results and reports

### AssessmentScheme

- **Purpose:** Configurable definition of assessment components and maximum scores.
- **Important fields:** name/code, component definitions with stable keys and maximums, total maximum, version/effective academic context, status, and creator/approver metadata.
- **Relationships:** applied to Result Batches/Entries and captured by published reports.
- **Lifecycle/statuses:** draft, active, retired, or archived.
- **Uniqueness/invariants:** active version is unambiguous for its scope; component keys are unique; maximums are positive; component maximums equal the declared total; historical references remain stable.
- **Important indexes:** code/version uniqueness; effective session/scope/status; active configuration lookup.
- **Security:** configuration requires permission and audit; results never accept client-declared maxima.

### GradingScheme

- **Purpose:** Configurable mapping from authoritative total scores to grades and related descriptors.
- **Important fields:** name/code, ordered grade bands with inclusive/exclusive boundaries, optional remarks/points, version/effective scope, status, and approval metadata.
- **Relationships:** applied to Result Entries and snapshotted/referenced by Term Reports.
- **Lifecycle/statuses:** draft, active, retired, or archived.
- **Uniqueness/invariants:** bands do not overlap or leave unintended gaps in the configured range; an active version is unambiguous; historical scheme versions remain resolvable.
- **Important indexes:** code/version uniqueness; effective session/scope/status; active lookup.
- **Security:** only authorized administrators configure schemes; activation/change is audited; grade is calculated server-side.

### ResultBatch

- **Purpose:** Workflow and authorization boundary for a set of subject results in one class/session/term context.
- **Important fields:** Academic Session, Term, Class Level, optional Track, Subject, Teacher, originating Teaching Assignment, Assessment Scheme/version, Grading Scheme/version, workflow status, data-entry actor set, submit/review/return/approve/publish actors and timestamps, comments, and workflow revision.
- **Relationships:** has Result Entries; references academic context, Teacher/assignment, and configurations; contributes to Term Reports and correction requests.
- **Lifecycle/statuses:** `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `RETURNED_FOR_CORRECTION`, `APPROVED`, or `PUBLISHED`. The return branch is `UNDER_REVIEW → RETURNED_FOR_CORRECTION → SUBMITTED`.
- **Uniqueness/invariants:** only one effective batch per exact context/revision policy; transitions follow the canonical order/return branch; teacher scope matches context; only draft/returned batches are ordinarily editable; the approver cannot be any user who entered or submitted the batch; published batches cannot be returned or ordinarily edited.
- **Important indexes:** unique effective session/term/class/track/subject batch key; status/time review queues; Teacher/session; publication time.
- **Security:** transitions require permission plus scope where applicable; `results.approve` cannot override approval separation of duties; publishing requires `results.publish`; students cannot access batches directly before publication; all transitions are audited.

### ResultEntry

- **Purpose:** One student's authoritative component scores, computed total, and grade within a Result Batch.
- **Important fields:** Result Batch, Enrollment/Student, keyed components each resolved as `SCORED` with a decimal value or `ABSENT`, result-level `EXEMPT` state and authorizer, subject maximum, computed total, computed subject percentage, computed grade, validation state, entry/revision metadata, and correction lineage.
- **Relationships:** belongs to ResultBatch and Enrollment/Student; feeds TermReport; may be targeted by ResultCorrectionRequest.
- **Lifecycle/statuses:** normal or `EXEMPT` result state within the controlling batch workflow, with preserved revision/corrected state after approved corrections.
- **Uniqueness/invariants:** one entry per Student/Enrollment per batch; enrollment and subject applicability match batch; every required component is explicitly resolved; scores have at most two decimal places and stay within configured bounds; `ABSENT` contributes zero but is distinct from scored zero; missing components block submission; `EXEMPT` has no normal total/grade/percentage and is excluded from relevant aggregates; for eligible non-exempt results, subject percentage is `(subjectTotal / subjectMaximum) × 100`; total, percentage, and grade are server-calculated with decimal-safe arithmetic.
- **Important indexes:** unique ResultBatch plus Enrollment/Student; Student/session/term for retrieval; validation state.
- **Security:** only assigned/permitted staff can edit in an allowed batch state; applying/removing `EXEMPT` requires `results.enter` and, for teachers, matching Teaching Assignment scope; student visibility requires publication and ownership; correction history is retained.

### TermReport

- **Purpose:** Published, student-facing historical snapshot of a complete term report card.
- **Important fields:** Student/Enrollment, Student ID and identity snapshot, school identity snapshot, session/term/class/track snapshot, subject/result snapshots including maximums/percentages/exempt state, eligible-subject count, completeness state, authoritative two-decimal overall average, optional class-position value and cohort/completeness metadata, class teacher remark, principal/admin remark, publication/version metadata, and PDF artifact reference or generation metadata.
- **Relationships:** belongs to Student/Enrollment and Term; derived from published Result Entries and approved remarks/configuration; may be revised by correction workflow.
- **Lifecycle/statuses:** assembling/incomplete, complete, published, superseded by correction, or archived. Only published versions are student-visible.
- **Uniqueness/invariants:** one current published version per Student/session/term; overall average equals the sum of eligible non-exempt subject percentages divided by their count; exempt subjects affect neither numerator nor denominator; unresolved/missing required non-exempt results prevent completion; intermediate calculations are not repeatedly rounded and the final average is rounded once to two decimals using the architecture-approved decimal strategy; published content is immutable except through versioned correction; attendance is absent; historical display values do not drift; class position is absent by default and, when enabled, uses a complete same-session/term/class/track cohort with standard competition ranking (`1, 2, 2, 4`); incomplete cohorts cannot be positioned or published with an acknowledgement bypass.
- **Important indexes:** unique current Student/session/term publication; Student/publication date; session/class/track for authorized administration; version lineage.
- **Security:** students access only their own published report; PDF/file access is authorized; unpublished or superseded internal versions remain restricted.

### ResultCorrectionRequest

- **Purpose:** Controlled workflow for correcting a published result or dependent report.
- **Important fields:** target batch/entry/report, requester, existing-value snapshot, proposed value, reason/evidence, status, reviewer/approver decisions, applied revision, timestamps, and audit correlation.
- **Relationships:** references affected Result Entry/Batch/Term Report and Users performing workflow steps.
- **Lifecycle/statuses:** submitted, under review, approved, rejected, or applied.
- **Uniqueness/invariants:** application occurs once; the requester cannot approve the request; target published value remains effective until approved application; recalculation updates all dependent values consistently; original history remains traceable.
- **Important indexes:** target resource plus status; review queue by status/time; requester; affected Student where needed for notification.
- **Security:** each step requires explicit permission and target scope; request uses `results.request_correction`, approval uses `results.approve_correction`, and requester self-approval is denied; evidence and before/after values are sensitive and audited safely.

## 9. Documents

### DocumentRequirement

- **Purpose:** School-configured definition of a student document type and when it is required.
- **Important fields:** unique code, display label, description/instructions, required flag, accepted file constraints, applicability/effective context, sort order, and status.
- **Relationships:** drives Student Registration document collection and classifies Student Documents.
- **Lifecycle/statuses:** draft, active, retired, or archived.
- **Uniqueness/invariants:** code is unique; passport photograph is a canonical mandatory requirement and cannot be disabled; other initial supported examples are birth certificate, admission document, and custom requirements; former-school result is excluded; historical submissions retain their requirement context.
- **Important indexes:** unique code; status/applicability; sort order.
- **Security:** configuration requires permission; file restrictions are server-enforced and cannot authorize unsafe content.

### StudentDocument

- **Purpose:** Metadata and review record for a student/applicant-provided document whose file lives in secure storage.
- **Important fields:** User/registration and later Student reference, Document Requirement, storage reference, safe original-name/media metadata, integrity hash, review status, uploader, upload time, reviewer/decision time, rejection reason, and replacement/version lineage.
- **Relationships:** belongs to StudentRegistration and/or approved Student; satisfies DocumentRequirement; may support correction evidence.
- **Lifecycle/statuses:** `PENDING_REVIEW`, `VERIFIED`, or `REJECTED`, with superseded/archived version handling where replaced.
- **Uniqueness/invariants:** effective submission cardinality follows the requirement; replacements preserve prior review history; storage reference and integrity metadata identify the correct file.
- **Important indexes:** registration/student plus requirement/status; review queue status/time; storage reference uniqueness; integrity hash for operational checks, not identity.
- **Security:** files are private, malware/type/size validated, delivered through authorization, and never exposed by public predictable URLs. Logs avoid document contents.

## 10. System domain

### Notification

- **Purpose:** In-app notification generated from a business event, designed to allow future delivery channels without coupling domain workflows.
- **Important fields:** recipient User, type, title/body or template data, safe resource reference, created/read timestamps, delivery state, deduplication key, and source event/correlation.
- **Relationships:** belongs to User and references the originating domain event/resource without granting access to it.
- **Lifecycle/statuses:** pending, delivered/available, read, failed, or archived.
- **Uniqueness/invariants:** a deduplication key prevents duplicate effects for idempotent workflows; notification existence never bypasses authorization to the target resource.
- **Important indexes:** recipient plus read state/time; delivery state; unique deduplication key where supplied; expiry/archive time.
- **Security:** content excludes secrets and minimizes sensitive data; opening a link reauthorizes the resource; recipients access only their notifications.

### AuditLog

- **Purpose:** Append-only evidence of important academic, administrative, and security actions.
- **Important fields:** actor identity/type, action code, target type/id, timestamp, outcome, safe before/after or change metadata, request/correlation identifier, reason, and limited source context.
- **Relationships:** references Users and domain resources logically while remaining durable if display data changes.
- **Lifecycle/statuses:** append-only active record with retention/archive handling; no ordinary update/delete lifecycle.
- **Uniqueness/invariants:** events are immutable, ordered sufficiently for investigation, and emitted for specified mutations; audit failure handling must not silently lose critical events.
- **Important indexes:** target type/id/time; actor/time; action/time; correlation/workflow id; retention/archive partitioning.
- **Security:** read access is privileged; no passwords, tokens, secret keys, full document content, or unnecessary medical data; tamper resistance is an architecture requirement.

### SchoolSettings

- **Purpose:** Controlled school-wide operational and identity configuration not better represented by a dedicated domain entity.
- **Important fields:** school identity/contact/branding values, `currentAcademicSessionId`, `currentTermId`, current Registration Form Configuration reference, class-position configuration by reporting context, feature/policy values approved for V1, configuration version, and update metadata.
- **Relationships:** references the authoritative `ACTIVE` Academic Session, optional `ACTIVE` Term within that session, Registration Form Configuration, and other configuration entities; supplies school identity snapshots for Term Reports.
- **Lifecycle/statuses:** versioned active configuration with superseded/archived versions where historical interpretation requires it.
- **Uniqueness/invariants:** one effective settings set for the single school system; `currentAcademicSessionId` always equals the sole `ACTIVE` Academic Session and `currentTermId`, when present, equals the at-most-one `ACTIVE` Term in that session; silent disagreement is invalid; class-position publication is disabled per reporting context when an eligible cohort cannot be completed; dedicated entities remain dedicated rather than being collapsed into an unstructured settings object.
- **Important indexes:** effective/current version; configuration version uniqueness.
- **Security:** mutation requires explicit permission and audit; active session/term changes additionally require their respective management permissions and consistency checks; public exposure is allowlisted field-by-field; secrets do not belong in ordinary settings.

### SequenceCounter

- **Purpose:** Atomically allocates monotonic values for permanent Student IDs.
- **Important fields:** sequence key, last allocated numeric value, update/version metadata, and optional allocation audit correlation.
- **Relationships:** used transactionally by student approval to create `ONYX/` identifiers.
- **Lifecycle/statuses:** active; sequences are not reset, reused, or deleted after allocation begins.
- **Uniqueness/invariants:** one counter per sequence key; increments are atomic under concurrency; allocated numbers are never decremented, rolled over, or reissued; formatting uses at least four numeric digits and expands naturally (`9999` to `10000`); formatted Student ID remains unique independently.
- **Important indexes:** unique sequence key.
- **Security:** only the controlled allocation service may mutate it; direct administrative editing is prohibited; counter values are not authorization data.

## 11. Cross-entity transactional boundaries

Transactions are required wherever partial success would violate authoritative state, including:

- registration approval, Student ID allocation, Student/profile relationships, initial Enrollment, access activation, notification intent, and audit event;
- promotion/repeat and destination Enrollment creation;
- result publication, student visibility, Term Report snapshot/version, notifications, and audit events;
- approved result-correction application and dependent recalculation/report revision; and
- sensitive role/permission changes with required session revocation and audit evidence.

Rejected-registration reopening is a permission-controlled, audited state transition on the existing registration and cannot create a replacement lineage. Result workflow transitions use conditional/idempotent state changes so return, resubmission, approval, publication, and correction actions cannot race around lifecycle or separation-of-duties checks.

Activating an Academic Session or Term and updating the corresponding School Settings references is one consistency boundary: partial success cannot leave authoritative states and settings references in disagreement. Duplicate-registration resolution and subject overrides are audited authoritative decisions with explicit actor, reason/resolution, and timestamp.

Where external file or notification delivery cannot participate in a database transaction, durable intent/outbox-style coordination is an architecture concern to be decided later; business records must still be recoverable and idempotent.

## 12. Global retention and security rules

- Important academic/history records are not permanently deleted.
- All client input is validated server-side.
- Identifiers locate candidate resources but never authorize access.
- Sensitive relations are loaded according to least privilege rather than returned through oversized User or Student documents.
- Published historical artifacts retain the configuration and display context needed to remain correct over time.
- Audit and notifications contain no credentials or token secrets.
- Exact field types, embedded value-object boundaries, persistence technology, and API representation are architecture decisions and are intentionally not specified here.

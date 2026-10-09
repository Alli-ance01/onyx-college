# Student Flow

## 1. Public account creation

1. A prospective student opens the public student signup flow.
2. The student creates a User account using the required identity and authentication details.
3. The system creates an applicant context and starts a Student Registration.
4. The account can access onboarding only; it is not yet an approved Student and has no permanent Student ID or authoritative Enrollment.

Public signup is not available for teachers or administrators.

## 2. Registration

Registration is configurable, but mandatory core fields remain strongly typed and validated. The default journey contains:

1. Personal Information
2. Contact Information
3. Parent / Guardian
4. Academic Information
5. Medical / Emergency
6. Documents
7. Review & Submit

Administrators cannot disable surname, first name, date of birth, gender, nationality, residential address, primary guardian name, guardian relationship, guardian phone, requested class, or passport photograph. State of origin and LGA are additionally mandatory when nationality is Nigerian. Senior track is mandatory when the requested class is SS1, SS2, or SS3 and must be Science, Arts, or Commercial.

Configurable/optional canonical fields may include middle name, student phone, student email, guardian alternate phone, guardian email, guardian occupation, guardian address, blood group, genotype, allergies, medical conditions, medications, and emergency instructions.

Administrators may add custom `TEXT`, `TEXTAREA`, `NUMBER`, `DATE`, `SELECT`, `MULTISELECT`, `BOOLEAN`, `EMAIL`, and `PHONE` fields. They may configure key, label, help text, applicable placeholder, section, display order, enabled state, required state, and the supported type-specific bounds/options. V1 does not support custom file fields, executable validation, arbitrary regular expressions, or a general conditional-form engine. Nigerian State/LGA and senior-track conditions remain explicit domain rules.

The form configuration is versioned. A configuration version becomes immutable once used by a submitted registration; changes create a new version. Each Student Registration retains its governing configuration version and submitted answers so its data remains interpretable after later changes.

The student may save progress before submission. Requested class and senior track are applicant information, not authoritative placement.

Required documents are driven by active Document Requirements. Initial examples are a passport photograph, birth certificate, admission document, and school-configured custom documents. A former-school result is not required by this specification.

## 3. Submission and review

Before submission, the applicant can review and amend the draft. On submission:

- the submitted data becomes a reviewable snapshot;
- the registration leaves editable draft state;
- an authorized administrator reviews core data, guardian information, medical/emergency information subject to least privilege, and required documents; and
- document reviews record `PENDING_REVIEW`, `VERIFIED`, or `REJECTED` independently as appropriate.

An administrator may approve, reject, or request changes. `CHANGES_REQUESTED` applies when the application is generally valid but specified corrections are required; it returns only the intended fields to an editable state and records the reason.

`REJECTED` is terminal from the student's perspective. Rejection preserves the registration and decision history and does not delete the account or application. The student cannot create another registration to bypass it. An authorized administrator may explicitly reopen the rejected registration; the actor, reason, time, and transition are audited.

During registration, deterministic duplicate detection compares normalized first name, surname, date of birth, and primary guardian phone. A strong match to a pending, approved, or rejected registration is routed to administrative duplicate review. A strong match to a rejected registration does not grant a clean application path. Partial/fuzzy matches create warnings but do not automatically reject the applicant. Email alone is not treated as identity, and no biometric, NIN, or external identity requirement is introduced.

## 4. Approval transaction

Approval is a multi-record authoritative workflow and must complete atomically. The operation:

1. verifies that the registration is eligible for approval;
2. confirms the administrator's permission;
3. validates the final class level and senior track rules;
4. allocates the next permanent Student ID using `SequenceCounter`;
5. creates the Student profile from approved authoritative data;
6. creates or links Guardian records and Student Guardian relationships;
7. creates the Student Medical Profile;
8. creates the initial Enrollment for the selected academic session and placement;
9. marks the registration approved;
10. activates full Student Portal access;
11. creates an in-app approval notification; and
12. appends audit events for the decision and authoritative records created.

Failure at any authoritative step must not leave a partly approved student. A consumed Student ID is never assigned to another student, even when recovery from an exceptional failure is required.

Student IDs use a minimum four-digit numeric width. The sequence progresses from `ONYX/0001` through `ONYX/9999` to `ONYX/10000`, never rolls over, and never reuses a value.

## 5. Full Student Portal

After successful approval, the student can use:

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

The student can view and download published assignments, read targeted announcements, view their curriculum, inspect historical enrollments, manage permitted account settings, and view/print/download published results and report cards.

These are ownership-based self-service capabilities rather than administrative permissions. Students receive no administrative permission bundle.

The displayed official curriculum includes applicable `REQUIRED` Subject Offerings, removes any administrator-authorized `REMOVE` exception, and includes an `OPTIONAL` offering only when an administrator has created an `ADD` Enrollment Subject Override. The student does not make these selections.

Published report averages are calculated from eligible non-exempt subject percentages. If class position is enabled, it is shown only after the entire eligible session/term/class/track cohort is complete; there is no incomplete-cohort bypass.

The student cannot directly change Student ID, official name, date of birth, class, track, academic history, results, or subject assignments.

## 6. Profile correction

For authoritative biodata changes:

1. The student creates a Profile Correction Request identifying the field, requested value, reason, and any supporting document.
2. The original authoritative value remains in force while the request is pending.
3. An authorized administrator reviews the request and supporting evidence.
4. The administrator approves or rejects the request with a recorded decision.
5. If approved, the system applies the authorized change through a controlled operation.
6. The system notifies the student and appends an audit event containing safe before/after context.

Student ID, enrollment history, and results are not ordinary profile-correction fields. They use their dedicated controlled workflows and must never be silently rewritten.

## 7. Academic progression

The student's current placement is derived from Enrollment. At the next academic session, an authorized administrator records one of these outcomes:

- Promote: create a new enrollment at the next level.
- Repeat: create a new enrollment for the new session at the repeated level.
- Withdraw: retain history and change lifecycle state.
- Transfer: retain history and change lifecycle state.
- Graduate: complete SS3 and set the Student lifecycle to `GRADUATED`.

Promotion from JSS3 to SS1 requires Science, Arts, or Commercial track selection. Junior enrollments never have a track.

## 8. Notifications

The student may receive in-app notifications for registration decisions or requested changes, assignment and announcement publication, result publication, and correction decisions. Notification delivery does not itself determine whether the underlying resource is authorized; access is rechecked when the student opens it.

## Daily portal and readiness extension — 8 October 2026

See [Timetable and daily work](../domain/timetable.md) for the approved weekly schedule, ownership rules and daily student agenda. Staff forms preserve failed submissions and warn before discarding unsaved work; result entry must be saved before submission. The [pilot checklist](../operations/pilot-checklist.md) defines acceptance tasks for this role.

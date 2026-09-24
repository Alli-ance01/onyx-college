# Registration Workflow

## 1. Boundary

Student account creation, Student Registration, administrative approval, Student profile creation, Student ID allocation, and initial Enrollment are distinct stages. A User account before approval represents an applicant, not an approved student.

## 2. Registration data

Registration supports school configuration while preserving strongly typed mandatory core fields. Default sections are Personal Information, Contact Information, Parent/Guardian, Academic Information, Medical/Emergency, Documents, and Review & Submit.

Administrators cannot disable these mandatory canonical fields:

- surname;
- first name;
- date of birth;
- gender;
- nationality;
- residential address;
- primary guardian name;
- guardian relationship;
- guardian phone;
- requested class; and
- passport photograph.

Conditional mandatory fields are:

- state of origin and LGA when nationality is Nigerian; and
- senior track when requested class is SS1, SS2, or SS3. Its allowed values are Science, Arts, and Commercial.

Potential configurable/optional canonical fields include middle name, student phone, student email, guardian alternate phone, guardian email, guardian occupation, guardian address, blood group, genotype, allergies, medical conditions, medications, and emergency instructions. Administrators may also define custom fields.

V1 supports these custom field types:

- `TEXT`
- `TEXTAREA`
- `NUMBER`
- `DATE`
- `SELECT`
- `MULTISELECT`
- `BOOLEAN`
- `EMAIL`
- `PHONE`

Every custom field may configure key, label, help text, section, display order, enabled state, and required state. Placeholder is supported where applicable. Type-specific validation is limited to:

- `TEXT`/`TEXTAREA`: minimum and maximum length;
- `NUMBER`: minimum and maximum;
- `DATE`: earliest and latest date;
- `SELECT`/`MULTISELECT`: configured allowed options;
- `EMAIL`: standard application email validation;
- `PHONE`: standard application phone validation; and
- `BOOLEAN`: required/optional semantics.

V1 does not support arbitrary custom file fields, administrator-provided executable validation, arbitrary regular expressions, or a general conditional-form engine. Documents remain in the document-management domain. Known Nigerian State/LGA and senior-school track conditions remain explicit domain rules.

Configurable additions must not replace, weaken, or hide validation of mandatory canonical or conditional fields. Sensitive medical data and uploaded documents receive least-privilege access. Applicant-supplied placement is an expectation only.

Registration form configuration is versioned. Once a version has governed any submitted registration, that version is immutable. A change creates a new version rather than modifying the used version. Each Student Registration retains the version that governed its submission, together with interpretable submitted values and field definitions.

## 3. Duplicate detection and review

The system performs deterministic duplicate detection without claiming to prove human identity. A strong candidate match uses normalized:

- first name;
- surname;
- date of birth; and
- primary guardian phone.

A new registration that strongly matches an existing pending, approved, or rejected registration is flagged for administrative duplicate review. A strong rejected match cannot receive an entirely clean path around the rejected record. Partial/fuzzy matches produce warnings for review but never automatically reject a legitimate person.

An authorized administrator may reopen the original rejected registration, confirm that the registrations represent different people, or reject the duplicate attempt. The match evidence, resolution, actor, timestamp, and any override are audited. Email alone is not used as student identity. V1 does not require biometrics, NIN, or external identity infrastructure.

## 4. Lifecycle

The workflow uses these authoritative states:

- `DRAFT`: applicant may complete and revise the registration.
- `SUBMITTED`: frozen submission is awaiting administrative review.
- `UNDER_REVIEW`: an authorized reviewer is processing the submission.
- `CHANGES_REQUESTED`: specified fields may be corrected and resubmitted.
- `APPROVED`: the approval transaction completed and authoritative student records exist.
- `REJECTED`: the application was declined with a recorded decision.

Allowed business transitions are:

`DRAFT → SUBMITTED → UNDER_REVIEW`

From review:

- `UNDER_REVIEW → CHANGES_REQUESTED → SUBMITTED`
- `UNDER_REVIEW → APPROVED`
- `UNDER_REVIEW → REJECTED`
- `REJECTED → UNDER_REVIEW`, only through an explicit authorized administrative reopen

Submission, review decisions, change requests, rejection, and reopening record actor and time. `REJECTED` is terminal from the student's perspective: the student cannot edit it or create a replacement registration to bypass the decision. An administrator with `students.approve_registration` may explicitly reopen it for review, with a required reason and audit event. `CHANGES_REQUESTED`, not rejection, is used when an otherwise valid application requires applicant corrections. An approved registration is never returned to an ordinary editable draft.

## 5. Document review

Active Document Requirements determine what the applicant must provide. Each Student Document is reviewed independently as `PENDING_REVIEW`, `VERIFIED`, or `REJECTED`.

Document rejection is not equivalent to registration rejection. The administrator may request a replacement or correction through the registration workflow. File access must be authorized and must not rely on a guessable storage path.

## 6. Approval preconditions

Before approval, the server verifies:

- the registration is in a reviewable state and has not already been decided;
- the actor has the required permission;
- mandatory core data is valid;
- the registration's immutable form-configuration version is resolvable and all mandatory/conditional rules for that version are satisfied;
- any strong duplicate candidate has an explicit administrative resolution that permits this registration to proceed;
- required documents satisfy the configured approval policy;
- the chosen Academic Session and Class Level are valid;
- a senior placement has a valid Track and a junior placement has none;
- the User is not already linked to another Student profile; and
- no conflicting Enrollment or Student ID assignment exists.

## 7. Approval transaction

The following operation is atomic:

1. lock or conditionally claim the eligible registration to prevent double approval;
2. allocate the next value from `SequenceCounter`;
3. format the permanent Student ID as `ONYX/` plus its numeric sequence with a minimum four-digit width (`ONYX/0001`, `ONYX/0042`, `ONYX/9999`, `ONYX/10000`);
4. create the Student profile;
5. create or link Guardian and StudentGuardian records;
6. create the StudentMedicalProfile;
7. create the initial Enrollment in the administrator-selected placement;
8. mark the registration `APPROVED` and associate created records;
9. grant/activate the student's full portal eligibility without using the Student ID as a credential;
10. append audit events; and
11. enqueue/create the in-app approval Notification.

If the transaction fails, no partially approved institutional profile or enrollment becomes visible. Student ID allocation must guarantee uniqueness under concurrency. The sequence grows naturally beyond four digits, never rolls over, and an allocated identifier is never reused.

## 8. Change request and rejection

A change request records the reason and the fields/sections requiring action. The applicant may update only the allowed registration data, after which resubmission creates a new reviewable version or equivalent preserved history.

A rejection records the reviewer, time, reason, and decision state. It does not hard-delete the User, registration, documents, or audit history. It cannot be bypassed with a new registration. Only an authorized, audited administrative reopen can return the same record to review.

## 9. Idempotency and concurrency

Approval must be idempotent from the caller's perspective. Repeated or concurrent approval attempts for one registration cannot create multiple Students, Student IDs, or Enrollments. Database uniqueness constraints and transactional conditional updates enforce this in addition to service-level checks.

## 10. Profile changes after approval

Approved authoritative biodata is not edited by the student. A Profile Correction Request records the targeted field, current value, requested value, reason, supporting evidence, requester, reviewer, decision, and application status.

Approval and application are controlled operations with audit events. Student ID, enrollment, subjects, and result corrections remain outside generic profile correction and use their dedicated workflows.

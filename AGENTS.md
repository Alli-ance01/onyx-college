# Onyx College Portal — Repository Instructions

## Product

This repository contains the production Onyx College Portal.

Onyx College Portal is a role-based school information and academic management platform with three primary experiences:

- Student Portal
- Teacher Portal
- Admin Portal

This is not a tutorial project, demo, prototype, coding exercise, or generic CRUD application.

All implementation decisions must be made with production use, maintainability, security, data integrity, historical correctness, and long-term extensibility in mind.

---

## Authoritative Documentation

Before implementing or modifying a feature, read the relevant documents under `docs/`.

The product and domain documentation is authoritative.

Do not silently simplify, combine, reinterpret, or remove documented domain concepts merely to reduce implementation effort.

If implementation reveals a conflict or a better architectural option, stop and raise the issue before changing the documented architecture.

Architectural decisions must be documented.

---

## Core Product Rules

### Students

Students may create accounts through the public student signup flow.

Creating an account does not automatically make a user an approved Onyx College student.

The flow is:

Account Creation
→ Registration
→ Submission
→ Admin Review
→ Approval
→ Student Profile Creation
→ Permanent Portal Student ID
→ Initial Enrollment
→ Full Portal Access

Student IDs use the format:

`ONYX/0001`

The year must not be included.

Student IDs are permanent and must never be reused.

A Student ID is an identifier, not an authentication or authorization mechanism.

Students must not directly modify authoritative academic records.

Official profile corrections must use the documented correction-request workflow.

---

### Teachers

There is no public teacher signup route.

Teachers are invited or created by an authorized administrator.

Teachers do not assign their own classes, subjects, permissions, or responsibilities.

Teacher academic authority comes from explicit assignments made by authorized administrators.

A teacher may teach:

- multiple subjects
- multiple classes
- multiple senior-school tracks

Class Teacher and Subject Teacher are academic assignments, not global system roles.

---

### Administrators

There is no public admin signup route.

The initial privileged administrator is bootstrapped securely.

Authorized administrators may create/invite other staff according to their permissions.

Administrative power must still be permission-controlled rather than implemented as scattered `if role === admin` checks.

---

## Academic Structure

The initial school levels are:

- JSS1
- JSS2
- JSS3
- SS1
- SS2
- SS3

Senior-school tracks are:

- Science
- Arts
- Commercial

Junior school does not use senior tracks.

There are no A/B/C arms in the current product specification.

Academic sessions follow formats such as:

`2026/2027`

Each session has:

- First Term
- Second Term
- Third Term

Do not hard-code current academic sessions into application logic.

---

## Enrollment Is Historical

Never model student academic progression using a mutable field such as:

`student.currentClass = "SS2"`

The authoritative relationship between a student and their academic placement is `Enrollment`.

A promotion creates a new Enrollment for a new academic session.

Historical enrollment records must never be overwritten.

Example:

2024/2025 → JSS3  
2025/2026 → SS1 Science  
2026/2027 → SS2 Science

---

## Subjects

Students do not manually choose their standard curriculum.

Administrators configure subjects and subject offerings for classes/tracks.

Individual student exceptions may be explicitly managed when required.

Do not store all curriculum logic directly inside Student documents.

---

## Teacher Authorization

Teacher authorization is resource-scoped.

The global `TEACHER` role alone is not sufficient to authorize academic operations.

For example, a teacher may only enter results, create assignments, or access students when an active academic assignment authorizes the requested subject/class/track/session combination.

Authorization must always be enforced server-side.

Frontend visibility is not security.

---

## Results

Results are sensitive academic records.

The result workflow is:

DRAFT
→ SUBMITTED
→ UNDER_REVIEW
→ APPROVED
→ PUBLISHED

Students may only view published results.

Published results must not be silently edited.

Corrections must use the documented result-correction workflow and produce audit records.

Authoritative totals and grades must be calculated server-side.

Assessment and grading structures must be configurable.

Do not hard-code CA/exam grading logic throughout the codebase.

---

## Assignments

V1 supports teacher-created assignments for students to read/download.

Students do not submit assignments through the portal in V1.

Do not build assignment submission, grading, or LMS functionality unless the product specification is explicitly changed.

---

## Announcements

Administrators may target broad audiences.

Teachers may only target audiences that fall within their authorized academic scope.

Students only consume announcements.

---

## Data Integrity

Do not permanently delete important academic/history records.

Prefer explicit lifecycle states such as:

- active
- completed
- archived
- withdrawn
- revoked
- graduated

where appropriate.

Use transactions for workflows involving multiple authoritative documents where partial completion would create inconsistent state.

Examples include:

- approving student registration
- generating Student ID
- creating Student record
- creating initial Enrollment
- promotion
- publishing results

---

## MongoDB Modeling

Do not put the entire system inside giant Student or User documents.

Use references for entities with independent lifecycle/history.

Examples include:

- Enrollment
- Guardian relationships
- AcademicSession
- Term
- Subject
- SubjectOffering
- TeachingAssignment
- ResultBatch
- ResultEntry
- Documents
- Notifications
- AuditLog

Embed only bounded value objects where appropriate.

---

## Authentication

Passwords must never be stored in plaintext.

Refresh tokens must never be stored in plaintext.

Use secure password hashing.

Authentication/session architecture must support token/session revocation.

Account state and student/teacher lifecycle state are separate concepts.

Do not make authorization decisions based on frontend state or identifiers supplied by the client.

---

## Security

Treat all client input as untrusted.

Validate API input server-side.

Use backend authorization for every protected operation.

Do not expose:

- passwords
- password hashes
- refresh tokens
- invitation tokens
- reset tokens
- secret keys
- internal stack traces in production
- unrestricted sensitive medical information

Sensitive data access must follow least privilege.

---

## Auditability

Important administrative and academic mutations must generate audit events.

Examples:

- registration approval/rejection
- profile corrections
- teacher assignment changes
- promotions
- account suspension
- result submission
- result approval
- result publication
- result correction
- permission changes

Audit logs must not contain secrets.

---

## Frontend Architecture

The frontend must not contain authoritative business rules that are absent from the backend.

Pages should not become giant components.

Separate:

- page composition
- reusable UI
- feature/domain components
- forms
- API access
- client state
- validation
- permissions/display logic

The visual design may evolve later.

Therefore, UI components and business/domain behavior must remain cleanly separated.

Do not tightly couple application behavior to the first visual design.

---

## Initial UI Direction

Until a separate approved design system exists, use a professional school administration SaaS visual direction:

- dark navy navigation
- restrained amber/gold accent
- neutral light backgrounds
- strong information hierarchy
- compact professional spacing
- accessible typography
- responsive layouts
- restrained borders/shadows
- clear tables/forms
- consistent states

Avoid:

- glassmorphism
- excessive gradients
- huge cards
- unnecessary charts
- giant greeting banners
- excessive animations
- decorative UI with no product value
- generic AI dashboard styling

The first UI is replaceable.

Architecture is not.

---

## Code Quality

Use TypeScript with strict settings.

Avoid `any` unless technically unavoidable and explicitly justified.

Avoid:

- giant controllers
- giant services
- giant React components
- business logic inside routes
- duplicated validation
- scattered role checks
- unstructured utility dumping grounds
- circular module dependencies
- magic strings
- unnecessary abstractions
- premature microservices

Prefer explicit domain-oriented modules.

---

## Testing

Business-critical invariants require tests.

Examples:

- Student ID uniqueness
- enrollment uniqueness
- promotion behavior
- teacher scope authorization
- result score validation
- result state transitions
- published result protection
- registration approval
- correction workflows
- permission enforcement

Do not write tests merely to increase test count.

Test behavior and invariants.

---

## Scope Discipline

These are OUT OF SCOPE for V1 unless documentation is intentionally changed:

- school fees
- payments
- attendance
- timetable
- parent portal
- CBT/examinations
- student assignment submission
- messaging/chat
- library management
- discipline management

Do not quietly add these modules.

---

## Development Workflow

Before implementing a substantial feature:

1. Read the relevant documentation.
2. Identify affected domain entities.
3. Identify authorization requirements.
4. Identify invariants.
5. Identify failure and edge cases.
6. Identify audit requirements.
7. Identify transaction boundaries.
8. Plan implementation.
9. Implement.
10. Validate with appropriate tests.
11. Update documentation when behavior changes.

Do not continue automatically into unrelated features.

---

## Architectural Changes

Never silently make a substantial architectural change.

Examples:

- merging documented entities
- changing authentication architecture
- replacing Enrollment with mutable student fields
- changing result workflows
- introducing multi-tenancy
- changing authorization model
- replacing repository structure
- adding major infrastructure dependencies

Raise the proposal, explain benefits/tradeoffs, and wait for approval.
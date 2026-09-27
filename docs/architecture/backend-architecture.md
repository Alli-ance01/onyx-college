# Onyx College Portal — Backend Architecture

## Purpose

The backend is a strict TypeScript Node.js/Express modular monolith. It owns authentication, authorization, validation, business workflows, calculations, persistence, auditing, and side-effect coordination. Express is an HTTP adapter, not the location of business logic.

## Module layout

Each domain module follows this shape where the layer is useful:

```text
modules/<module>/
  domain/
    entities-and-value-objects/
    policies/
    errors/
  application/
    commands/
    queries/
    ports/
    dto/
  infrastructure/
    persistence/
    integrations/
  http/
    routes/
    handlers/
    schemas/
    presenters/
```

Small modules should not create empty layers for ceremony. The dependency direction is inward: HTTP and infrastructure depend on application/domain contracts; domain code does not import Express, Mongoose, object-storage clients, or environment configuration.

### Module responsibilities

| Module                  | Primary responsibility                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Identity/authentication | Credentials, login, reset, access issuance, refresh sessions, bootstrap authentication controls |
| Users/access control    | Users, roles, permissions, account state, role assignment                                       |
| Student registration    | Form versions, submissions, duplicate review, approval/rejection/reopening                      |
| Students                | Student profile, lifecycle, correction requests, sensitive-profile policy                       |
| Guardians               | Guardians and historical student-guardian relationships                                         |
| Academics               | Sessions, terms, class levels, tracks, active-context rules                                     |
| Enrollments             | Placement history, promotion/repeat/withdraw/transfer/graduate workflows                        |
| Subjects                | Catalogue, offerings, individual enrollment overrides                                           |
| Teachers                | Teacher profile, invitations, registration, lifecycle                                           |
| Teaching assignments    | TeachingAssignment and ClassTeacherAssignment scope                                             |
| Assignments             | Teacher-created assignment lifecycle and attachments                                            |
| Announcements           | Audience definitions, scope validation, publication                                             |
| Results                 | Schemes, entry batches, workflow, calculations, reports, corrections                            |
| Documents               | Requirements, metadata, review, secure object access                                            |
| Notifications           | Recipient fan-out, in-app inbox/read state, channel adapters                                    |
| Audit                   | Append-only audit persistence and privileged querying                                           |
| Settings                | School identity and ordinary settings; current academic context synchronization                 |

## HTTP and application flow

- Routes declare method, path, middleware, validation schema, and handler.
- Middleware handles request ID, authentication, rate limits, parsing limits, and boundary concerns.
- Handlers receive already validated input, construct a command/query, invoke one use case, and map the result through a presenter.
- Application services/use cases define transaction boundaries and orchestrate policies and repositories.
- Domain policies implement deterministic invariants and state transitions without transport concerns.
- Repositories expose intent-oriented methods and hide Mongoose documents, sessions, and query construction.
- Presenters explicitly map fields. Returning a Mongoose object directly is prohibited.

Cross-module mutation must go through that module's application interface. Direct imports of another module's persistence model are prohibited. Read-heavy joins may use documented query ports or aggregation projections owned by the consuming query service without acquiring mutation authority.

## Validation

Zod is the preferred runtime schema library for:

- headers, parameters, query strings, and bodies at the API boundary;
- configuration at process startup;
- client-safe request/response contracts when sharing is appropriate;
- future worker job payloads, once a concrete asynchronous feature exists, and external integration responses.

Schemas strip or reject unknown fields according to endpoint policy; mutation endpoints should be strict. DTOs are allowlists, preventing mass assignment.

Syntactic validation includes type, shape, length, enum, format, and the fixed two-decimal score representation. Business validation remains in application/domain policies: permissions, academic scope, uniqueness intent, resource state, scheme totals, separation of duties, cohort completeness, and historical rules. Database constraints are the final concurrency-safe guard where an invariant can be represented there.

## Persistence and MongoDB strategy

Mongoose may be used only inside persistence adapters. Domain/application code works with domain records and repository ports. MongoDB is deployed as a replica set; production write concern for authoritative transactions is `majority`, with a suitable read concern and bounded transaction retries for transient errors.

### References and embedding

Use references for entities with independent identity, lifecycle, authorization, history, or query patterns: User, Student, Guardian, Enrollment, AcademicSession, Term, Subject, SubjectOffering, teacher assignments, results, documents, notifications, and audits.

Embed only bounded values that are owned by one aggregate and are not independently queried, such as a normalized address value, assessment component values within a result entry when bounded, and immutable report snapshot lines. A reference plus a snapshot can coexist where historical readability requires both.

`TermReport` is a deliberate immutable snapshot. It copies publication-time student display identity, placement, subject result details, scheme/grading labels and versions, remarks, aggregate values, and position. Its references support traceability but do not control how an old report renders.

### Core indexes and constraints

The exact index names will be specified with the schemas, but the architecture requires:

- User: unique normalized username/login identifiers; unique verified contact identifiers only where policy requires uniqueness.
- Student: unique `studentId`, unique `userId`; Student ID is required only after approval and belongs on Student, avoiding nullable uniqueness on pre-approval registrations.
- AcademicSession: unique normalized session label; a partial unique active-slot constraint for the one ACTIVE session.
- Term: unique `(academicSessionId, ordinal)`; partial unique active slot ensuring at most one ACTIVE term within the ACTIVE session context.
- Enrollment: unique `(studentId, academicSessionId)` and query indexes by session/class/track/status.
- SubjectOffering: unique logical placement key `(session or effective-version scope, subjectId, classLevelId, normalizedTrackKey)` as defined by the domain model.
- EnrollmentSubjectOverride: unique `(enrollmentId, subjectId)` for the effective override, or explicit versioning if override history is kept in-record; every mutation is audited.
- TeachingAssignment: a uniqueness key that prevents duplicate active authority for the same teacher/subject/placement/session while allowing legitimate multi-assignment.
- ClassTeacherAssignment: a partial unique key for one active assignment per `(sessionId, classLevelId, normalizedTrackKey)`.
- ResultBatch: unique effective `(academicSessionId, termId, classLevelId, normalizedTrackKey, subjectId)` key, with any correction/revision lineage represented explicitly rather than by a duplicate live batch; indexes by state/term/reviewer and Teacher/session.
- ResultEntry: unique `(resultBatchId, enrollmentId)`.
- TermReport: unique `(enrollmentId, termId, publicationVersion)` and one partial-current marker if needed.
- AuthSession, invitation, password-reset, upload-intent, outbox, and job records: lookup indexes plus appropriate expiry indexes for ephemeral records.
- Notification: `(recipientUserId, readAt, createdAt)` and recipient/category/time indexes.
- AuditLog: `(targetType, targetId, occurredAt)`, `(actorUserId, occurredAt)`, `(action, occurredAt)`, and request ID.

Optional values must not be placed under a naive unique sparse index. For placement uniqueness, junior records use a canonical internal track key such as `NONE` in the computed unique key while the domain-facing `trackId` remains absent. Partial indexes are used only when their inclusion predicate precisely represents the invariant.

Indexes are reviewed against real query plans. Unbounded arrays, large document growth, and duplicate low-value indexes are avoided.

### Historical data and deletion

Academic and administrative history is never hard-deleted through ordinary application flows. Lifecycle state, archive timestamp, and actor are used. Published result/report snapshots, enrollments, Student IDs, audit logs, and applied corrections are immutable historical records.

Ephemeral security records can expire by TTL. Notification retention and object deletion use explicit policies. MongoDB TTL deletion is not used for authoritative records because it is asynchronous and unaudited at the domain level.

## Concurrency control

Mutation aggregates include an integer `version`. Commands update with both ID and expected version/state; zero matched records produce a precondition or domain-state conflict. This protects registration review, configuration editing, assignment publication, result transitions, and corrections from lost updates.

Unique database indexes resolve races after friendly prechecks. Known transient transaction failures and unknown commit results are retried by a bounded transaction runner according to MongoDB guidance. Commands with externally retryable consequences use idempotency keys.

### Atomic Student ID generation

`SequenceCounter` owns a monotonically increasing `studentId` sequence. Registration approval increments the counter with an atomic `findOneAndUpdate($inc)` inside the same transaction that creates the Student and initial Enrollment. The committed number is formatted with a minimum width of four; values beyond 9999 expand naturally.

The transaction checks whether the registration was already approved before allocating. A rolled-back allocation is not committed; a committed allocation is never reclaimed. A unique index on Student.studentId is the final safeguard. Idempotency and commit-result recovery return the existing approved outcome rather than allocating again.

The single counter is acceptable at one-school approval volume. Its contention is monitored; range allocation is deliberately rejected because it complicates the never-reuse guarantee.

### Active academic context

An ACTIVE AcademicSession carries a derived constant active slot guarded by a partial unique index, so at most one can be active. A comparable constrained slot prevents more than one ACTIVE Term in the authoritative active session. Application policy also prevents a term outside the active session from becoming active.

Switching context is one transaction: close/change prior state, activate the new session/term, synchronize `SchoolSettings.currentAcademicSessionId/currentTermId`, record audit and outbox events, and verify postconditions. SchoolSettings is a projection/convenience pointer, not an independent authority. Reads that encounter disagreement fail safely and raise an operational alert; they never silently choose one value.

## Required transaction boundaries

### Registration approval

One transaction includes:

1. lock-by-condition/read submitted registration and configuration reference;
2. revalidate reviewer permission, state, duplicate resolution, documents, and placement;
3. increment `SequenceCounter`;
4. create Student and copy authoritative profile data;
5. create/reuse Guardian records and StudentGuardian links;
6. create StudentMedicalProfile under sensitive-access rules where applicable;
7. create initial Enrollment and subject overrides if explicitly authorized;
8. update registration and student/user lifecycle state;
9. append audit events;
10. insert a durable notification/outbox event.

No file copy is performed inside the transaction. Existing verified object metadata is linked. A failure commits none of the authoritative steps.

### Promotion and lifecycle transitions

One transaction conditionally closes/completes the source Enrollment, creates the destination Enrollment (or creates the explicit repeat outcome), applies required SS1 track rules, updates Student lifecycle for withdrawal/transfer/graduation where applicable, and appends audits/outbox events. The uniqueness constraint prevents duplicate destination enrollment. Bulk promotion invokes the same idempotent per-student command in bounded jobs; it is not one unbounded transaction.

### Results

- Submission and return-for-correction each conditionally transition the batch, validate component resolution, and audit.
- Approval conditionally transitions the batch, enforces that approver differs from submitter/entry actor as specified, freezes calculation/configuration references, and audits.
- Publication revalidates approval, configuration, report completeness, and optional cohort completeness; creates immutable TermReport snapshots; marks the publication atomically; audits; and writes notification/PDF outbox work.
- A published correction transaction approves/applies an authorized correction, preserves original values and linkage, creates a new result/report version, marks supersession without deletion, audits every action, and queues replacement delivery/PDF work. Requester and approver must differ.

If a cohort cannot fit safely in one bounded publication transaction, the system stages versioned candidate snapshots and uses a final atomic publication marker only after every member has passed validation. Students never observe a partially published cohort. The concrete batching threshold will be tested against Atlas limits before implementation.

### Academic context switch

Session state, term state, SchoolSettings pointers, audit, and outbox records commit together. The command requires an expected version and privileged permission.

External calls are never made while a transaction is open. The current bounded document upload, replacement, and removal operations coordinate Cloudinary calls outside MongoDB transactions using explicit metadata lifecycle states, verified provider responses, compensating cleanup, and idempotent retry. Effects that must be delivered after an authoritative business commit—such as email, PDF rendering, future push delivery, or later storage cleanup—are recorded in the durable outbox and remain unprocessed until a concrete worker is approved.

## Result calculation engine

The result engine is a pure, versioned domain service with no Mongoose or HTTP dependency. Its inputs are:

- the applicable AssessmentScheme snapshot/version;
- the applicable GradingScheme snapshot/version;
- a bounded list of component resolutions;
- enrollment/subject eligibility and any exemption authority;
- reporting-context configuration.

### Decimal representation

API scores are accepted as decimal strings with at most two fractional digits. They are parsed into integer hundredths for storage and validation; BSON doubles and native JavaScript floating-point arithmetic are not used for authoritative scores.

Totals are exact sums of integer hundredths. Percentage division and averages use a decimal-arithmetic library such as `decimal.js` with an explicitly configured precision and `ROUND_HALF_UP`. Intermediate subject percentages are not repeatedly rounded. The engine retains exact operands and rounds only the final authoritative/displayed overall average to two decimal places. Snapshots preserve calculation version, exact operands, and the final formatted value so a later library/configuration change cannot rewrite history.

### Component and result states

- `SCORED` requires an in-range score and contributes that score.
- `ABSENT` is explicit, contributes zero to that component, and remains distinguishable from a scored zero.
- An unentered component is unresolved and blocks submission.
- `EXEMPT` is a result-level state set only by authorized staff. It has no normal total or grade and is omitted from aggregate numerator and denominator.

The server calculates subject total, maximum, percentage, and grade. A required non-exempt subject lacking a complete result prevents report completion.

Overall average is the sum of eligible, non-exempt subject percentages divided by their count. If position is enabled, ranking uses the final authoritative overall average across exactly the documented cohort with standard competition ranking. The publication policy rejects an incomplete eligible cohort; there is no bypass. Administrators must complete it or disable position for that reporting context before publication.

Every workflow transition uses an explicit state machine. `PUBLISHED` has no edit or return transition. Corrections use ResultCorrectionRequest and create versioned outputs.

## Audit and outbox atomicity

Use cases receive a `UnitOfWork` abstraction backed by a MongoDB client session. Repositories, audit writer, idempotency store, and outbox writer share that session. A use case cannot claim success unless its authoritative mutation and required audit/outbox records commit together.

Low-risk reads and personal notification read markers do not need multi-document transactions. Transaction use is based on consistency boundaries, not applied indiscriminately.

## Deferred background worker

No background worker is currently created or deployed. The backend remains worker-ready, but a second process type is introduced only when the first concrete asynchronous feature requires it. At that point it is built from `apps/api`, shares application ports but not HTTP routes, and may handle:

- malware scanning and orphan reconciliation when approved;
- notification fan-out;
- report-card PDF rendering;
- retryable cleanup of unclaimed/quarantined/orphaned objects;
- bounded bulk promotion orchestration when introduced.

Future jobs contain opaque resource IDs rather than sensitive payload copies. Each handler is idempotent, lease-based, observable, and safe after process interruption. Operator tooling can inspect and retry terminal failures with an audit record. Worker directories, dependencies, persistence, and deployment configuration are not created before this trigger.

## Error handling

Application code throws typed errors with a stable code, safe message, HTTP mapping, optional field issues, and internal cause. Categories are:

| Category              | HTTP | Examples                                                    |
| --------------------- | ---: | ----------------------------------------------------------- |
| Validation            |  400 | malformed input, invalid filter                             |
| Authentication        |  401 | missing/expired access token                                |
| Authorization         |  403 | missing permission, ownership, or scope                     |
| Not found             |  404 | absent or deliberately concealed resource                   |
| Conflict              |  409 | unique conflict, duplicate registration resolution required |
| Domain state conflict |  409 | invalid result transition, closed session                   |
| Precondition failed   |  412 | stale `If-Match`/version                                    |
| Rate limited          |  429 | login or mutation throttling                                |
| Unexpected            |  500 | safe generic response with request ID                       |

The global error boundary logs internal details once with redaction. Production responses never expose stack traces, queries, collection names, filesystem paths, object keys, or secrets.

## Expected backend dependencies

The backend runs on the repository-standard Node.js `22.19.0` runtime. The implementation is expected to evaluate compatible stable releases of Express, Mongoose/the MongoDB driver, Zod, `jose`, Argon2, `decimal.js`, Pino, Helmet, an S3-compatible SDK, and OpenTelemetry or Sentry adapters only as needed. Libraries are selected and pinned during implementation after compatibility and maintenance review; this document does not install them.

## References

- [MongoDB transaction production considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)
- [MongoDB unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/)
- [Express production best practices](https://expressjs.com/en/advanced/best-practice-performance.html)

# Onyx College Portal — Testing Strategy

## Objectives

Testing protects business invariants, permissions, historical correctness, and transaction behavior. The goal is confidence in meaningful behavior, not a coverage percentage. Tests are deterministic, isolated, readable as domain examples, and placed at the lowest layer that provides adequate confidence.

## Test layers

### Unit tests

Fast tests cover pure functions and value objects: normalization, Student ID formatting, date-only handling, permission composition, ranking, decimal conversion, error mapping, configuration parsing, and safe redaction. They do not mock entire frameworks merely to execute implementation details.

### Domain-policy tests

Table-driven tests exercise state machines and policy matrices without HTTP or MongoDB:

- registration transitions, rejection reopening, duplicate resolution;
- enrollment placement and promotion/repeat/withdraw/transfer/graduate rules;
- required/optional offerings and overrides;
- teaching/class-teacher scope matching;
- result component resolution, workflow transitions, separation of duties;
- profile and published-result correction rules;
- ownership, resource state, and permission composition.

Every denied case is as important as the permitted case. Tests use explicit actors, resource states, sessions, levels, tracks, and subjects.

### Application/use-case tests

Use cases are tested through ports with small fakes for repositories, clock, ID generation, audit, and outbox. These verify orchestration, ordering only where semantically meaningful, rollback intent, idempotency behavior, and that required audit/events are requested. Application tests do not replace real transaction tests.

### Repository and integration tests

Persistence adapters run against a real MongoDB-compatible replica-set test environment, preferably Testcontainers with the same major MongoDB version as production. A replica set is essential because transaction behavior cannot be validated against a standalone or simplistic mock.

These tests cover:

- every unique and partial index;
- reference mapping and projections;
- transaction commit/rollback;
- optimistic concurrency and conditional transitions;
- transient retry/idempotency behavior;
- TTL behavior for ephemeral records where relevant;
- active session/term constraints;
- Student ID counter races;
- query scoping and pagination.

An in-memory MongoDB replica-set helper may be used for fast local feedback if its behavioral differences are documented; CI must still run the high-risk suite against a production-representative MongoDB process.

### API integration tests

Supertest (or an equivalent in-process HTTP client) calls the composed Express application with real validation, authentication, authorization policies, repositories, error mapping, and database. External storage/delivery adapters are controlled fakes or local emulators.

Tests assert status, stable error code, response contract, state effects, audit record, outbox work, and absence of forbidden fields. Authentication tests use real token/session behavior rather than bypass middleware for security-critical routes.

### Contract tests

Shared Zod DTO schemas are tested against representative server responses and frontend fixtures. OpenAPI generation, if introduced, is checked for drift. The Cloudinary adapter has deterministic gateway-level tests for authenticated upload metadata, resource-type mapping, signed access, exact deletion, and safe provider failures. A credentialed pre-production or scheduled provider smoke suite must additionally exercise the selected Cloudinary cloud so SDK/signing or account-policy drift is detected without calling production storage from ordinary unit tests.

### Frontend tests

Testing Library tests user-observable behavior for forms, permission-aware affordances, loading/error/empty states, accessible interactions, and registration configuration rendering. MSW provides typed API behavior at the network boundary. Tests avoid snapshots of large DOM trees and avoid asserting internal component state.

Accessibility checks combine linting, automated axe checks on important screens, keyboard interaction tests, and manual screen-reader review for critical flows.

### End-to-end tests

Playwright covers a small, high-value suite against a production-like built web application, API, replica-set database, and controlled storage/delivery services:

1. initial SUPER_ADMIN bootstrap and forced password change;
2. student account, configured registration, document upload, submission, review, approval, generated Student ID, and portal access;
3. rejected/changes-requested/duplicate registration paths;
4. teacher invitation, approval, assignment, and scope boundaries;
5. assignment and scoped announcement publication/visibility;
6. result entry through return, approval by a different user, publication, student report view, and PDF;
7. published-result correction with different requester/approver;
8. promotion including JSS3 to SS1 track and SS3 graduation;
9. session/term switch consistency;
10. session revocation/logout and protected-route behavior.

E2E tests assert critical outcomes rather than exhaustively repeating lower-layer combinations.

## Mandatory invariant suites

### Student IDs and approval

- minimum four-digit formatting and expansion beyond 9999;
- concurrent approvals allocate unique values;
- transaction failure creates no Student/Enrollment and does not commit allocation;
- command replay returns the original outcome;
- approved IDs cannot be reassigned or changed.

### Registration

- immutable used form versions and interpretable old submissions;
- Nigerian state/LGA and senior track conditional requirements;
- allowed custom field types/validation only;
- strong duplicates route to review without pretending certainty;
- fuzzy matches warn but do not auto-reject;
- rejected applicants cannot bypass state, while audited admin reopening works;
- authoritative placement remains the administrator's decision.

### Enrollment and curriculum

- one enrollment per student/session;
- previous enrollment history never changes during promotion;
- junior placements reject a track; senior placements require one;
- required offerings apply automatically;
- optional offerings require ADD, required removals require REMOVE;
- each override requires actor, reason, timestamp, and audit;
- promotion/repeat/withdraw/transfer/graduate behaviors and rollback.

### Teacher scope and access

- permission without academic assignment is denied;
- assignment matching includes session, subject, class, and applicable track;
- inactive/revoked assignments deny access;
- class teacher receives only documented broader scope;
- only one active class teacher per placement/session;
- ID substitution never exposes another scope;
- sensitive student data requires its additional permission/policy.

### Results

- score decimal and range validation using exact arithmetic;
- unentered component blocks submission;
- ABSENT contributes zero but remains distinct from SCORED zero;
- authorized EXEMPT has no total/grade and leaves average numerator/denominator;
- server totals, percentages, grades, and final two-decimal average;
- no intermediate-rounding drift;
- every state transition including RETURNED_FOR_CORRECTION;
- submitter/entry actor cannot approve own batch;
- correction requester cannot approve own correction;
- PUBLISHED cannot be edited or returned;
- incomplete cohort blocks position publication;
- standard competition ties produce `1, 2, 2, 4`;
- immutable report snapshot remains unchanged when source/profile/config changes;
- correction creates linked versions and complete audit history.

### Authentication and permissions

- refresh rotation, replay detection, revocation, expiration, and concurrent refresh;
- CSRF protections on cookie-authorized endpoints;
- forced first-login password change;
- suspended/revoked account behavior;
- no public teacher/admin creation routes;
- idempotent one-time bootstrap and duplicate refusal;
- permission catalogue/default bundles plus protected SUPER_ADMIN restrictions;
- ownership and resource-state checks for student self-service;
- no secret or sensitive field in responses/logs.

## Transaction and failure testing

For each critical transaction, inject a failure after every meaningful write and verify no partial authoritative state is visible. Repeat selected tests under concurrency. Registration approval, promotion, context switching, result publication, and correction application receive this treatment.

Outbox tests prove that a committed mutation has durable pending work, a rolled-back mutation has none, duplicate delivery is harmless, an interrupted lease is recovered, and terminal failures are observable. External services are never assumed to be atomic with MongoDB.

## Security testing

Automated suites include object-level authorization, cross-role and cross-owner resource-ID substitution, mass-assignment attempts, Mongo operator injection, malicious pagination/filter values, malicious filenames/MIME mismatches, XSS payload rendering, CSRF, brute-force thresholds, token tampering, expired signed operations, and redaction.

Dependency, secret, and static analysis run in CI. A focused manual threat-model review is required before production and for authentication, upload, permission, and result-publication changes. Independent penetration testing is recommended before broad production enrollment or after material security changes.

## Performance and capacity checks

V1 does not need a large performance program, but release checks should measure:

- login/refresh and common dashboard queries;
- student/admin list query plans and cursor pagination;
- concurrent registration approval counter behavior;
- result entry and cohort publication at expected maximum class size;
- notification fan-out;
- PDF memory/time and worker concurrency;
- audit and notification index growth.

Performance tests use anonymized generated data, never production exports.

## Test data and isolation

Factories create valid domain states through approved builders rather than giant fixtures. Each test owns its database namespace or cleans explicit collections safely. Clocks, randomness, and IDs are controllable. No ordinary test calls real email/push services or production storage. Provider smoke tests use an isolated non-production Cloudinary configuration and explicit cleanup. Sensitive example data is fictional.

## CI quality gates

Pull requests run formatting/type checking, unit/domain/application tests, component tests, API/integration tests, migration/index verification when applicable, dependency/secret scans, and a small browser smoke suite. Longer concurrency, provider-contract, and full E2E suites can run on the main branch or release candidate.

A release is blocked by failed critical invariant tests, contract drift, high-confidence secret exposure, or unreviewed high-severity dependency findings. Flaky critical tests are fixed or quarantined with an owner and deadline; they are not retried until green without investigation.

## Completion standard

A feature is complete when its positive, negative, boundary, authorization, audit, transaction, and observable failure behaviors are tested at appropriate layers. Coverage reports identify untested risk but do not set the definition of quality.

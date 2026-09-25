# ADR 0006: Composable Server-Side Authorization Policies

**Status:** Accepted

## Context

Global roles and permissions do not express student ownership, sensitive-field access, teacher academic scope, result state, or separation of duties. Scattered controller checks are difficult to audit and easy to omit.

## Decision

Authorize each protected use case with a named, deny-by-default policy composed from authenticated session, account/lifecycle state, permission, ownership, TeachingAssignment or ClassTeacherAssignment scope, resource state, sensitivity, and separation-of-duties rules. Resolve authoritative data server-side. Policies live in domain/application modules and are reusable by commands and queries; HTTP middleware supplies identity but does not replace resource authorization.

Frontend guards are for navigation and display only. Tokens do not embed durable permissions or academic scopes. Repository queries should constrain candidate data to the allowed scope while policy checks remain authoritative.

## Alternatives Considered

- Role-only checks: rejected because they contradict teacher scope and student ownership rules.
- Permission-only RBAC: rejected because `results.enter` without assignment scope is unsafe.
- Controller-specific conditionals: rejected because behavior becomes inconsistent and untestable.
- A standalone policy microservice: rejected as unnecessary operational complexity for V1.

## Consequences

- Policy inputs and decisions can be tested as matrices and logged safely.
- Every new use case must declare its authorization policy and sensitive-field projection.
- Some reads need purpose-built scoped query ports to avoid loading unauthorized data.
- SUPER_ADMIN remains subject to invariants, security checks, and separation of duties.

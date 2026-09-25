# ADR 0001: Modular Monolith

**Status:** Accepted

## Context

Onyx College Portal has several business domains but one school, one operational team, one shared data model, and workflows that require atomic changes across registration, identity, enrollment, results, audit, and notifications. V1 needs strong consistency and manageable deployment more than independent service scaling.

## Decision

Build one Express modular monolith with explicit domain modules and one MongoDB database. Modules own their application services, policies, persistence adapters, and HTTP endpoints. Cross-module access occurs through application interfaces, narrow read ports, or typed events—not direct access to another module's models. No worker exists initially. When a concrete asynchronous feature requires one, it is a separate process from the same codebase, not a separate business service.

## Alternatives Considered

- Microservices: rejected because distributed transactions, duplicated operations, service security, and observability would add risk without demonstrated scale or team need.
- Unstructured layered monolith: rejected because generic controllers/services/models encourage cross-domain coupling and giant services.
- Serverless functions per endpoint: rejected as the primary backend because transaction coordination, connection management, jobs, and PDF generation benefit from a long-running application.

## Consequences

- Deployment and transactional workflows remain simple.
- Domain boundaries must be enforced through imports, reviews, and tests rather than network boundaries.
- A future worker releases with compatible API code and keeps job payloads backward-compatible.
- A module can be extracted later only if measured scale or organizational ownership justifies it.

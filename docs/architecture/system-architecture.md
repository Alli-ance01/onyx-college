# Onyx College Portal — System Architecture

## Status and scope

This document defines the production architecture for V1. It does not change the authoritative product or domain specification. The system is a modular monolith: one React web application, one Node.js/Express application, one MongoDB database, and supporting object storage and operational services.

The design optimizes for a school-scale production system: explicit domain boundaries, strong data integrity, simple operations, and room to grow without introducing distributed-system complexity prematurely.

The repository, local development, CI, builds, and deployed Node.js processes use Node.js `22.19.0`. Runtime upgrades are explicit repository decisions and must update the version pins, package engines, dependency compatibility review, and delivery configuration together.

## Repository structure

The repository will use a `pnpm` workspace without Nx or Turborepo:

```text
apps/
  web/
    src/
      app/                 # router, providers, layouts, error boundaries
      features/            # domain/experience-oriented frontend features
      components/
        ui/                # replaceable visual primitives
        domain/            # shared domain-facing presentation components
      lib/                 # API client, auth client, validation, observability
      styles/              # tokens and global styling
  api/
    src/
      app/                 # server composition, HTTP router, middleware
      bootstrap/           # secure operational entry points
      config/              # validated runtime configuration
      modules/             # domain modules
      platform/            # database, storage, events, jobs, logging, time
packages/
  contracts/               # client-safe API DTOs, enums, and syntax schemas
  config/                  # shared TypeScript/lint configuration only
docs/
  product/
  domain/
  architecture/
  api/
```

`packages/contracts` must not contain Mongoose models, repositories, secrets, server-only policies, or authoritative business rules. A type is shared only when it is genuinely part of the client/server contract. `packages/config` is limited to tool configuration actually consumed by more than one workspace. New shared packages require a clear owner and reason; `shared`, `common`, and general utility dumping grounds are prohibited.

`pnpm` is preferred for deterministic workspace dependency management, strict dependency visibility, and efficient installs. Plain workspace scripts are sufficient for V1. A task orchestrator can be considered only when build scale or caching data demonstrates a need.

## Runtime topology

```text
Browser / future installed PWA
        |
        | HTTPS JSON API; bounded document uploads; signed protected downloads
        v
React single-page application
        |
        v
Express modular monolith
        |       |
        |       +---- private Cloudinary object storage through an adapter
        v
MongoDB replica set / Atlas
        |
        +---- application data and, when needed, durable outbox/job records

Application ----> structured logs and optional error monitoring

Future concrete asynchronous feature ----> same-codebase worker process
```

The web application never connects to MongoDB. The API is the only authority for business rules, authorization, calculations, and state transitions. Object storage access is mediated by short-lived, operation-specific signed URLs after API authorization.

## Modular-monolith boundaries

The API is deployed as one application but divided into independently owned modules:

- identity and authentication
- users and access control
- student registration
- students
- guardians
- academics (sessions, terms, class levels, tracks)
- enrollments and promotion
- subjects and offerings
- teachers and teacher onboarding
- teaching and class-teacher assignments
- assignments
- announcements
- results and report cards
- documents
- notifications
- audit
- settings

Modules own their application services, policies, persistence adapters, and HTTP surface. A module must not query another module's collections through imported Mongoose models. It uses an exposed application interface, a narrow read port, or a typed application event. This keeps a future extraction possible without accepting the cost of microservices now.

Identity/account state remains separate from student and teacher lifecycle state. Enrollment remains the authority for historical academic placement. The results module owns result state and calculations; no other module may update its collections directly.

## Request and command flow

For a normal protected operation:

1. HTTP middleware assigns or accepts a valid request ID and authenticates the session.
2. The route validates path, query, headers, and body against an explicit schema.
3. A thin handler maps the validated request to an application command or query.
4. A named authorization policy evaluates permission, ownership, academic scope, resource state, and sensitivity.
5. The use case executes domain rules and coordinates repositories within a transaction when required.
6. Audit and durable outbox records are committed with the authoritative mutation.
7. A presenter returns the versioned API envelope without exposing persistence objects.

Read models may be optimized for portal views, but they are projections of canonical data and do not become competing sources of truth.

## Application events and background work

Business modules publish typed application events such as `RegistrationApproved`, `AssignmentPublished`, and `ResultPublished`. Events express completed facts, not requests to bypass module APIs.

Student onboarding introduces transactional outbox persistence because registration decisions and profile-correction decisions must durably record future notification facts in the same commit as their authoritative mutations. No process consumes those records yet. When a concrete feature first requires asynchronous delivery, a worker from the same repository will lease and process outbox/job records with idempotent handlers, bounded retries, exponential backoff, and a terminal failed state for operator review. Likely triggers include notification fan-out, virus scanning, report-card PDF generation, orphan cleanup, or later push/email delivery. Until then, no worker process or worker deployment is created.

In-process handlers may be used only for non-critical work that can safely be lost. Anything that must occur after a committed business mutation is recorded durably in the same database transaction.

## Data and consistency principles

- MongoDB must run as a replica set so multi-document transactions are available.
- Historical records are immutable or versioned. Corrections create explicit records and audit history.
- Independent lifecycle entities are referenced; only bounded value objects and deliberate snapshots are embedded.
- Every important state change uses a conditional write or optimistic version to prevent lost updates.
- Database unique constraints back application validation for identities and domain combinations.
- Files live in object storage; MongoDB stores metadata and lifecycle state only.
- Timestamps are UTC instants. Business dates such as date of birth remain date-only values.
- All externally visible identifiers are opaque strings. Student ID is a human identifier, never authorization proof.

Detailed persistence and transaction design is in [backend-architecture.md](backend-architecture.md).

## Result and report-card architecture

The results module contains a deterministic calculation engine that consumes versioned assessment/grading configuration and resolved result components. It uses decimal-safe arithmetic, represents `SCORED`, `ABSENT`, and `EXEMPT` distinctly, and calculates all authoritative values server-side.

Publishing creates immutable `TermReport` snapshots. A snapshot records the student/enrollment identity, subject results, scheme references and versions, calculated values, remarks, optional position, and the source result versions. Subsequent corrections create a new report version linked to the superseded version; they never rewrite the historical publication silently.

Report-card PDFs are rendered asynchronously from the immutable snapshot, stored privately, and versioned by report and template version. Authorized users can also use a print-focused HTML view while generation is pending.

## File storage

Cloudinary is the approved production provider behind the existing document-storage port. Sensitive student assets use Cloudinary's `authenticated` delivery type; private access never depends on an obscure public URL. The API keeps provider credentials and signing authority, authorizes each protected read, and issues a short-lived signed URL. The local private-filesystem adapter remains available only for development and tests, and production configuration refuses it.

The implemented onboarding upload flow is intentionally bounded and server-mediated: the client sends a raw JPEG, PNG, or PDF body to the API; the API checks the document requirement, ownership, declared MIME type, file signature, and effective size limit before uploading it through the adapter. It verifies the provider response before committing an available metadata record. This avoids exposing unrestricted upload credentials and keeps current file-policy enforcement authoritative. A future direct-upload optimization, if operational measurements justify one, must preserve the same intent, validation, completion, and authorization boundaries.

Private documents and future assignment attachments require authorization before each short-lived download URL is issued. Public school assets, when implemented, use an explicitly separate public classification. Logical object identifiers contain internal opaque IDs, never student names, Student IDs, phone numbers, original filenames, or other sensitive data.

Current and reserved logical patterns are:

```text
private/student-documents/{registrationInternalId}/{studentDocumentId}/{opaqueObjectId}.{ext}
private/assignment-attachments/{assignmentId}/{attachmentId}/{opaqueObjectId}.{ext}
private/report-cards/{enrollmentId}/{termId}/{termReportId}/v{version}.pdf
public/school-assets/{settingsVersion}/{assetId}/v{version}.{ext}
```

The adapter maps logical keys to Cloudinary resource/public IDs; image public IDs omit their extension while raw-file public IDs retain the format required by Cloudinary. MongoDB stores only metadata and lifecycle state, including provider, protected provider identifier, resource/delivery type, original display filename, MIME type, size, checksum, requirement/type, upload status, verification status, and provider version/asset ID when available.

Replacement always creates a new asset and metadata version; it never overwrites prior evidence in place. Explicit removal first records a pending state, performs an idempotent provider delete outside any MongoDB transaction, and then records completion so an interruption is visible and retryable. The current implementation does not create a cleanup worker. Future report PDFs may use the same port and are generated only from immutable TermReport snapshots and recorded template versions.

Detailed controls are in [security.md](security.md) and [ADR 0009](decisions/0009-cloudinary-production-storage.md).

## Notifications

`Notification` is the in-app delivery/read model. Business modules do not create notification documents directly; they emit typed events. Notification policies turn events into recipients and notification records. Delivery-channel adapters can later add Web Push, native push, or email without modifying the originating business modules.

When notification fan-out is implemented, it is a concrete trigger for the deferred database-backed worker. Unread queries use recipient/status/time indexes. Old read notifications may be archived according to an approved retention policy; they must not be used as the audit record.

## Audit

`AuditLog` is append-only and written as part of the same transaction as important administrative, security, and academic changes. It records actor/session, action, target type and ID, outcome, reason where applicable, allowlisted before/after changes, timestamp, request ID, and carefully minimized request context.

Audit records are generated by backend use cases, not by UI events. Secrets, credentials, tokens, raw uploaded content, and sensitive medical detail are excluded or redacted. Normal application roles cannot update or delete audit records. Initial indexes support actor/time, target/time, action/time, and request ID queries. Audit data has no automatic TTL; any future archival or deletion policy requires an explicit legal/operational decision.

## Observability

V1 uses structured JSON logs with request IDs and consistent fields for service, environment, severity, route template, status, duration, and safe actor/session identifiers. Logs cover process lifecycle, database connectivity, transaction failures, unexpected errors, authentication anomalies, rate-limit events, and privileged changes. Worker health is added only when a worker is introduced. Request bodies and sensitive domain data are not logged by default.

The API exposes separate liveness and readiness endpoints. Readiness checks configuration and critical dependencies without leaking details. The design supports adding Sentry and hosted log aggregation through platform adapters; a full metrics/tracing platform is not required initially.

## Configuration

Backend configuration is loaded once at startup, validated with a typed schema, and passed explicitly. Invalid or missing production configuration prevents startup. Development, test, and production use separate environment values and databases.

Backend-only configuration includes database URI, signing keys, refresh-token pepper, cookie settings, bootstrap controls, storage credentials, upload limits, monitoring credentials, and allowed origins. Browser bundles receive only an explicit public allowlist such as API base URL and release identifier. A variable having a frontend prefix is a deliberate declaration that it is non-secret.

Secrets are supplied by the deployment platform or secret manager, rotated independently, and never committed. Tests use dedicated generated credentials and isolated infrastructure.

## Scalability and evolution

The initial API can scale horizontally because durable state is in MongoDB/object storage and access credentials are not process-bound. If a worker is later introduced, its instances coordinate through leases. Stateful scheduled work must also use leases so multiple instances do not duplicate execution.

Likely early scale constraints are result/report queries, notification fan-out, PDF rendering, and audit growth—not request routing. Address these with indexes, projections, workers, archival, and measured capacity before considering service extraction.

The web structure reserves clean integration points for a manifest, service worker, Web Push subscription management, and Android packaging. Service workers must never cache authenticated API responses or sensitive files by default.

## Architectural invariants

- One system and shared backend/database serve all three portals.
- No domain operation relies on frontend authorization.
- No role alone grants teacher academic authority.
- No student academic history is overwritten.
- No published result or report is silently edited.
- No important business transaction depends on an unreliable post-response side effect.
- No uploaded binary is stored in MongoDB.
- No external platform or UI component becomes the source of domain truth.

## References

- [pnpm workspaces](https://pnpm.io/workspaces)
- [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [Cloudinary access-controlled media](https://cloudinary.com/documentation/control_access_to_media)
- [Cloudinary upload API](https://cloudinary.com/documentation/image_upload_api_reference)
- [Cloudinary asset deletion](https://cloudinary.com/documentation/delete_assets)

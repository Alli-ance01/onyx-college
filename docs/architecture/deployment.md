# Onyx College Portal — Deployment and Delivery Architecture

## Initial production deployment

The recommended initial topology is:

| Concern          | Recommended service                        | Notes                                                             |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Web application  | Vercel static hosting                      | Versioned SPA build, CDN, HTTPS, fallback rewrite to `index.html` |
| API              | Render web service                         | Long-running Node.js `22.19.0` process, health checks, controlled deploys |
| Database         | MongoDB Atlas replica set                  | Transactions, backups, monitoring, network controls               |
| Object storage   | Cloudflare R2                              | Private S3-compatible bucket/prefixes and presigned access        |
| Error monitoring | Sentry when approved                       | Backend/frontend releases and redacted errors                     |
| Logs             | Render initially; hosted sink when needed  | Structured JSON with retention appropriate to sensitivity         |
| DNS/TLS          | School-controlled domain and managed HTTPS | Stable web/API origins under the school domain                    |

This is a vendor recommendation, not a domain dependency. Storage, logging, and monitoring are behind adapters. Unresolved vendor selections do not block the application foundation. The API requires a conventional long-running runtime because transactions, connection pooling, graceful lifecycle management, and predictable refresh-cookie handling are a better fit than per-request serverless functions. A worker deployment is added only when a concrete asynchronous feature requires it.

Suggested origins are `portal.<school-domain>` for the web application and `api.<school-domain>` for the API. Same-site subdomains simplify cookie and CSRF policy while preserving separate deployments. Exact domain names are an operational approval.

## Environments

At minimum:

- local development with local/test-only database and storage emulator or isolated bucket;
- automated test with disposable replica-set database and fake delivery adapters;
- production with dedicated Atlas database, R2 resources, signing keys, and origins.

A persistent staging environment is recommended before production data onboarding if budget permits. It must use synthetic data and its own credentials/buckets; production data is not copied casually.

Each environment uses independently validated configuration. Production refuses development defaults, weak keys, non-TLS origins, wildcard CORS, or a standalone MongoDB connection.

## Release model

The monorepo initially produces independently deployable web and API artifacts from one commit. When a worker is introduced by a concrete feature, it uses the same API codebase/release; durable job payloads then carry a schema version and handlers remain backward-compatible for jobs created by the previous release.

Recommended pipeline:

1. select Node.js `22.19.0` from the repository runtime pins, then perform a deterministic workspace install from the committed lockfile;
2. lint, type-check, unit/domain/component tests;
3. integration tests against a MongoDB replica set;
4. production builds and vulnerability/secret scanning;
5. API contract and index/migration plan verification;
6. deploy the API with readiness checks;
7. run explicit, idempotent database migration/index tasks where required;
8. deploy the static web application;
9. execute smoke tests and monitor errors.

MongoDB schema evolution follows expand-and-contract releases: introduce backward-compatible fields/indexes, deploy code that understands both shapes, backfill through an observable idempotent task, then remove legacy behavior in a later release. Deploying a Mongoose schema is not a substitute for migration planning.

Rollback must account for data compatibility. Web assets can roll back independently when contracts remain compatible. API rollback is allowed only when the previous release can understand current records and job payloads.

## Database operations

Atlas must provide a replica set, encryption in transit and at rest, automated backups, point-in-time recovery where available, monitoring, and restricted network access. The application database user has only runtime data privileges; operational migrations and backup administration use separate identities.

Recovery objectives and retention are operational decisions requiring approval before launch. A restore rehearsal must occur before production enrollment begins and periodically thereafter. Backups without tested restoration are not considered sufficient.

Index creation on populated collections is an explicit release operation with expected duration and performance impact. Large backfills are bounded/resumable jobs rather than startup work.

## Object storage operations

Use separate production and non-production buckets or accounts. Private access is the default; public school assets are isolated by bucket or explicit prefix/policy. CORS permits only the approved portal origin and required signed methods/headers.

Lifecycle rules may remove abandoned quarantine uploads and superseded objects only after the database-driven retention/safety window. Versioned report PDFs and authoritative student documents are not subject to a broad automatic expiry rule. Provider access logs, if enabled, must not be exposed publicly.

## API operations and future worker

The API handles graceful shutdown: stop accepting traffic, finish bounded requests, close MongoDB connections, and exit within the platform deadline. Readiness becomes false during shutdown. A future worker will stop leasing new jobs and either complete or safely release current leases.

CPU- and memory-heavy Chromium PDF work runs in the worker with low controlled concurrency, never in the API request path. Upload scanning can use a managed scanner or isolated ClamAV-compatible process after an implementation/security evaluation. The API remains responsive if PDF or notification delivery is degraded.

Autoscaling is not required on day one. Begin with one appropriately sized API instance, then use measured latency, CPU/memory, connection counts, and school usage windows to set scaling. A worker and queue-depth/lease monitoring are introduced only with the feature that needs them. More API instances require shared rate-limit/session state.

## Frontend hosting and caching

Hashed static assets can be cached immutably. `index.html` receives short/no-cache semantics so releases propagate. The host rewrites non-file routes to the SPA entry point. Source maps are private and uploaded to the approved error-monitoring provider rather than served publicly.

Authenticated API and private document responses are never cached by a shared CDN. A later service worker may cache the public application shell but must exclude API responses, signed URLs, results, documents, registrations, and medical information by default.

## Logging, alerting, and runbooks

V1 alerts should be small and actionable:

- API crash loop or readiness failure, plus worker health after a worker exists;
- elevated 5xx/error-monitoring rate;
- MongoDB connectivity or transaction failure spike;
- durable queue age/failed-job threshold;
- storage/scanning failures;
- security events such as refresh reuse or bootstrap attempts;
- backup failure and capacity warnings.

Runbooks cover login outage, Atlas connectivity, stuck jobs, failed PDFs, compromised session/key revocation, accidental permission grant, object-storage outage, and restore. Logs and alerts use request/resource IDs rather than sensitive content.

## Expected implementation dependencies

The following categories are expected, subject to a current-version/security review when implementation begins:

- workspace/build: pnpm, TypeScript, Vite;
- web: React, React DOM, React Router, TanStack Query, React Hook Form, Zod, accessible headless primitives, styling utilities;
- API: Node.js `22.19.0`, Express, Mongoose/MongoDB driver, Zod;
- security: `jose`, Argon2, Helmet, CORS/rate-limit support, secure randomness from Node;
- correctness: `decimal.js` or equivalent decimal library;
- deferred storage/jobs/PDF feature dependencies: AWS S3-compatible SDK, a MongoDB-backed outbox/job implementation, Playwright/Chromium, file-signature detection and an approved malware scanner;
- logging/monitoring: Pino and optional Sentry/OpenTelemetry adapters;
- testing: Vitest, Testing Library, MSW, Supertest, Playwright, Testcontainers.

No dependency is installed or approved merely by appearing here. Avoid packages where platform primitives or a small explicit implementation are safer.

## Vertical-slice implementation roadmap

Every phase includes database, backend, frontend, authorization, audit, and tests as applicable. A slice is complete only when it is deployable and meets its completion criteria.

### Phase 0 — Foundation and operational skeleton

- Backend/database: workspace configuration, API composition, validated environment, Mongo connection foundation, error envelope, request IDs, and health checks. Preserve extension points for later transaction, audit, and outbox work without creating their persistence or worker processes yet.
- Frontend: application shell, router/layout boundaries, design tokens/primitives, API client, query/form providers, safe error handling.
- Authorization/audit: policy interface and deny-by-default route integration; append-only audit port.
- Testing/operations: CI, replica-set integration harness, frontend harness, structured logs, build/release conventions.
- Complete when a no-domain health slice deploys in a production-shaped environment and security/configuration failures are tested.

### Phase 1 — Identity, sessions, access control, and bootstrap

- Backend/database: User, Role, Permission, AuthSession, invitation/reset security primitives, role seed/default bundles, secure bootstrap command.
- Frontend: login, refresh bootstrap, logout, forced password change, recovery, session management, access-aware shells.
- Authorization/audit: permission resolution, protected SUPER_ADMIN invariants, session/account policy, security audits.
- Testing: hashing, token rotation/reuse, CSRF, revocation, lockout/rate limits, bootstrap idempotency, permission matrix.
- Complete when the initial SUPER_ADMIN can be created securely and manage authorized access without any public admin path.

### Phase 2 — Student signup and configurable registration

- Backend/database: limited student accounts, versioned immutable registration configuration, custom fields, drafts/submission, duplicate candidates/review state, document requirements/upload pipeline.
- Frontend: signup, state-aware registration sections, conditional core rules, uploads, review/submit, changes-requested experience.
- Authorization/audit: ownership for applicants; admin configuration/review permissions; duplicate and reopen audits.
- Testing: form versioning, known conditionals, custom validators, duplicate matching, rejection bypass prevention, upload security.
- Complete when a student can submit a durable, interpretable registration without gaining full portal access.

### Phase 3 — Registration review and student activation

- Backend/database: review commands, approval transaction, Student/Guardian/MedicalProfile/Enrollment creation, SequenceCounter, lifecycle activation, notification outbox.
- Frontend: admin pending/review/duplicate/document views; student decision status and initial approved portal/profile views.
- Authorization/audit: sensitive-field policy, approval permission, authoritative placement rules, complete audit trail.
- Testing: concurrent IDs, fail-at-every-step rollback, idempotency, guardian links, Student ID format, denial cases.
- Complete when approval atomically creates the permanent identity and initial academic placement and activates only the correct account.

### Phase 4 — Academic structure, curriculum, enrollment, and promotion

- Backend/database: sessions, terms, active context, levels/tracks, subjects/offerings, overrides, enrollment history and lifecycle commands.
- Frontend: admin configuration and promotion flows; student subjects/history; reusable academic-context controls.
- Authorization/audit: management permissions, active-context privilege, override reason/actor, student ownership.
- Testing: unique placement indexes, session/term switching, required/optional behavior, promotion/repeat/withdraw/transfer/graduate, JSS3/SS1/SS3 rules.
- Complete when academic history and curriculum are fully authoritative without mutable current-class shortcuts.

### Phase 5 — Teacher onboarding and academic assignments

- Backend/database: invitations/admin creation, TeacherRegistration/Profile, approval, TeachingAssignment and ClassTeacherAssignment.
- Frontend: staff onboarding/profile, admin invitations/approvals/assignment management, teacher scoped dashboards/classes/students.
- Authorization/audit: no public signup, `teachers.*` permissions, assignment-based queries, one class-teacher constraint.
- Testing: invitation security, approval state, concurrent assignment constraints, positive/negative academic scope.
- Complete when an approved teacher sees only explicitly assigned resources.

### Phase 6 — Assignments and attachments

- Backend/database: assignment draft/publish/archive state and secure attachment metadata.
- Frontend: scoped teacher authoring/publishing; student list/view/download.
- Authorization/audit: permission plus active teaching scope; student enrollment/subject eligibility; publication audit/event.
- Testing: scope changes, state transitions, attachment security, no submission endpoints or UI.
- Complete when published assignments reliably reach only eligible readers.

### Phase 7 — Announcements

- Backend/database: audience definitions, expansion/query rules, publication events.
- Frontend: admin/teacher authoring with only allowed targets; student/teacher feeds.
- Authorization/audit: schoolwide versus scoped permissions; teacher assignment/class-teacher constraints.
- Testing: every audience type, union/deduplication, unauthorized target manipulation, lifecycle visibility.
- Complete when targeting is correct and auditable across all documented groups.

### Phase 8 — Result configuration, entry, and review

- Backend/database: versioned assessment/grading schemes, ResultBatch/Entry, exact calculation engine, workflow through APPROVED and return-for-correction.
- Frontend: configuration screens, scoped entry grid/forms, validation, submit/review/approve work queues.
- Authorization/audit: permission plus assignment scope, explicit EXEMPT authority, separation of duties and state policies.
- Testing: decimal/ABSENT/EXEMPT calculations, unresolved components, transitions, concurrent edits, approval denial.
- Complete when approved results are exact, reviewed by a different authorized user, and still invisible to students.

### Phase 9 — Publication, report cards, positions, and corrections

- Backend/database: cohort completeness, optional ranking, publication transaction/staging, immutable TermReport snapshots, correction workflow, PDF jobs/storage.
- Frontend: publication controls/warnings, student result/report views and print/download, correction review/history.
- Authorization/audit: publish and correction permissions, requester/approver separation, private PDF access.
- Testing: incomplete cohort rejection, ties, snapshot immutability, correction versioning, PDF source/version, authorization.
- Complete when students see only published immutable reports and every correction is explicit and traceable.

### Phase 10 — Notification center and production hardening

- Backend/database: complete notification fan-out/read model, retention operations, job/operator tooling, performance indexes.
- Frontend: inbox, preferences allowed by V1, consistent actionable notification links, admin operational states.
- Authorization/audit: recipient ownership, channel preference restrictions, operator actions.
- Testing/operations: complete E2E suite, accessibility, capacity checks, restore rehearsal, security review, runbooks, monitoring/alerts.
- Complete when all V1 workflows are observable, supportable, accessible, backed up, and release-ready.

PWA installability, Web Push, native packaging, attendance, fees, timetable, and every other documented out-of-scope module are not silently added to these phases.

## Pre-implementation approvals still required

These are architecture/operational choices, not unresolved product/domain questions:

1. approve or replace the proposed Vercel + Render + Atlas + R2 provider combination and regions;
2. select malware scanning approach/provider and allowed per-purpose upload limits;
3. select password-reset/invitation delivery channel and provider;
4. select error monitoring/log retention providers and data residency settings;
5. approve retention/recovery objectives for audit logs, notifications, uploads, backups, and superseded PDFs;
6. confirm production domain names and whether a persistent staging environment is funded.

Implementation can begin with adapters and local fakes for several of these, but production launch cannot.

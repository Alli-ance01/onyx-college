# Onyx College Portal

Onyx College Portal is the production school information and academic management platform for Onyx College. It provides three role-aware experiences—Student Portal, Teacher Portal, and Admin Portal—backed by one shared system and database.

The product covers student onboarding and approval, historical academic enrollment, curriculum configuration, teacher assignments, read-only assignment delivery, announcements, results and report cards, promotions, documents, notifications, access control, auditability, and a refined responsive user experience.

## Repository status

The documented V1 portal is implemented as a production-oriented modular monolith. It includes authentication and access control; public student signup and configurable onboarding; registration review and transactional student activation; academic sessions, terms, levels, tracks, subjects, offerings, enrollment history, and promotion; private teacher onboarding and scoped academic assignments; assignments and protected attachments; targeted announcements; configurable result entry, review, approval, publication, corrections, report cards, and PDF download; in-app notifications; document administration; school settings; and append-only audit views.

The web application provides real role-aware Student, Teacher, and Admin experiences backed by the shared API and MongoDB. Private files use a provider-neutral storage interface: local private storage is available for development, while production uses authenticated Cloudinary assets with backend-authorized, short-lived signed access.

No background worker is deployed. Current notification writes are durable and synchronous, and report-card PDFs are generated from immutable published snapshots on demand. Email, Web Push, native notifications, and the other explicitly out-of-scope V1 modules are not included.

## Documentation structure

- `docs/product/` defines product scope, portal behavior, user journeys, and role capabilities.
- `docs/domain/` defines canonical entities, academic structure, workflows, invariants, and authorization rules.
- `docs/architecture/` defines the system, backend, frontend, security, testing, deployment, implementation-phase, and architectural-decision guidance.
- `docs/api/` defines the versioned HTTP API conventions.
- `assets/branding/` contains supplied brand assets.

Start with [the product specification](docs/product/product-spec.md), then read the relevant workflow, domain, and architecture documents before writing code. Repository-wide contributor constraints are in [AGENTS.md](AGENTS.md).

The provider setup and first-release procedure are documented in the [production deployment runbook](docs/architecture/production-deployment-runbook.md).

## Development setup

### Prerequisites

- Node.js `22.19.0` (pinned in `.nvmrc`, `.node-version`, and workspace package engines)
- pnpm `12.6.0` through Corepack or an equivalent project-local invocation
- MongoDB for API startup; production and transaction-focused integration environments require replica-set behavior

Do not install pnpm globally. From the repository root, enable the package manager supplied with Node and install the workspace:

```sh
corepack enable
pnpm install
```

Copy the example environment files without committing the resulting `.env` files:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Update `MONGODB_URI` and `WEB_ORIGIN` for the local environment. `TRUST_PROXY_HOPS` remains `0` locally and must be configured to match the reviewed production proxy topology. `DOCUMENT_STORAGE_DRIVER=local` stores private development uploads below `.data/`. Production requires `DOCUMENT_STORAGE_DRIVER=cloudinary` together with `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`; those credentials belong only in the API environment and must never be exposed through a `VITE_*` variable. `DOCUMENT_SIGNED_URL_TTL_SECONDS` controls protected-link lifetime and defaults to 120 seconds. Browser-visible configuration uses only `VITE_*` values; backend secrets must never use that prefix.

### Commands

```sh
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

`pnpm dev` runs the API and web application together. Workspace-specific commands are also available, for example `pnpm --filter @onyx/api test` and `pnpm --filter @onyx/web dev`.

Initialize the canonical permission and protected system-role records after connecting the API to a replica-set MongoDB deployment:

```sh
pnpm db:indexes
pnpm access:sync
```

Production disables Mongoose automatic index creation. Run `pnpm db:indexes` as an explicit release operation before serving a schema version that introduces indexes. The command creates declared indexes without dropping unrecognized indexes; removal of obsolete indexes requires a separately reviewed migration.

Create the one initial SUPER_ADMIN from a trusted interactive terminal that can connect to the target Atlas database:

```sh
pnpm bootstrap:super-admin
```

The command displays a generated temporary password once and requires it to be changed at first login. It refuses repeat bootstrap attempts. On Render Free, run the database and bootstrap commands locally against Atlas because the service has no interactive shell. Never place the temporary credential in command arguments, scripts, logs, or committed files.

Transaction-focused integration tests use Testcontainers and require a running Docker-compatible container runtime:

```sh
pnpm test:integration
```

Docker is a development/test dependency only; it is not required to deploy the application to Vercel, Render, Atlas, and Cloudinary. GitHub Actions runs the replica-set integration gate on its hosted runner.

Browser tests exercise the built web application against the real API and a disposable MongoDB replica set. Install Chromium once, then run them with Docker available:

```sh
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

The test runner owns ports 4001 and 4173, seeds synthetic accounts through the application services and API, and stops its servers and database afterward. It does not use your development database or deployment credentials. Failure screenshots and traces are written to ignored `test-results/`. To use an existing compatible Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its absolute executable path. Browser fixtures use local document storage; they do not validate Cloudinary.

The browser gate covers admin and student login, responsive navigation from 320px to 1440px, student sections, lifecycle directory filters, request failure/retry, and registration approval through first student access. CI runs it before rebuilding the production artifacts; `test:e2e` temporarily builds the web app with its local test API URL.

See the [readiness review](docs/architecture/readiness-review.md) for the verified scope and remaining release checks. Passing local tests alone is not a production launch sign-off.

The API exposes `GET /api/v1/health/live` for process liveness and `GET /api/v1/health/ready` for dependency readiness. The web application defaults to the relative `/api/v1` base path and the development server proxies `/api` to the local API. Deployed API origins are supplied through `VITE_API_BASE_URL`.

## V1 boundary

V1 excludes school fees and payments, attendance, timetables, a parent portal, CBT/examinations, student assignment submissions, chat or messaging, library management, and discipline management. These modules must not be added without an intentional product-specification change.

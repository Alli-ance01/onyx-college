# Onyx College Portal

Onyx College Portal is the production school information and academic management platform for Onyx College. It provides three role-aware experiences—Student Portal, Teacher Portal, and Admin Portal—backed by one shared system and database.

The product covers student onboarding and approval, historical academic enrollment, curriculum configuration, teacher assignments, read-only assignment delivery, announcements, results and report cards, promotions, documents, notifications, access control, and auditability.

## Repository status

The production workspace foundation is implemented. It contains the React application shell, Express API shell, MongoDB connection lifecycle, shared transport contracts, strict TypeScript/lint/format tooling, and focused foundation tests. Product features and authentication have not started.

There are currently no business-domain Mongoose models, product feature modules, authentication workflows, storage/email integrations, background worker, or approved external visual design.

The eventual initial interface should be production-quality, but product rules, security, data integrity, historical correctness, and maintainable domain boundaries take priority over visual design.

## Documentation structure

- `docs/product/` defines product scope, portal behavior, user journeys, and role capabilities.
- `docs/domain/` defines canonical entities, academic structure, workflows, invariants, and authorization rules.
- `docs/architecture/` defines the system, backend, frontend, security, testing, deployment, implementation-phase, and architectural-decision guidance.
- `docs/api/` defines the versioned HTTP API conventions.
- `assets/branding/` contains supplied brand assets.

Start with [the product specification](docs/product/product-spec.md), then read the relevant workflow, domain, and architecture documents before writing code. Repository-wide contributor constraints are in [AGENTS.md](AGENTS.md).

## Development setup

### Prerequisites

- Node.js `24.21.0` (the supported Node 24 LTS line is pinned in `.nvmrc` and `.node-version`)
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

Update `MONGODB_URI` and `WEB_ORIGIN` for the local environment. `TRUST_PROXY_HOPS` remains `0` locally and must be configured to match the reviewed production proxy topology. Browser-visible configuration uses only `VITE_*` values; backend secrets must never use that prefix.

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

The API exposes `GET /api/v1/health/live` for process liveness and `GET /api/v1/health/ready` for dependency readiness. The web application defaults to the relative `/api/v1` base path and the development server proxies `/api` to the local API. Deployed API origins are supplied through `VITE_API_BASE_URL`.

## V1 boundary

V1 excludes school fees and payments, attendance, timetables, a parent portal, CBT/examinations, student assignment submissions, chat or messaging, library management, and discipline management. These modules must not be added without an intentional product-specification change.

# ADR 0002: pnpm Workspace Repository

**Status:** Accepted

## Context

The system needs a React application, an Express application/worker, client-safe contracts, common tool configuration, and co-located documentation. It does not need an enterprise build orchestrator.

## Decision

Use a pnpm workspace with `apps/web`, `apps/api`, `packages/contracts`, and `packages/config`. Keep backend domain rules in the API and visual components in the web application. Add a shared package only when it has a narrow purpose and at least two real consumers. Use ordinary workspace scripts; do not introduce Nx or Turborepo in V1.

## Alternatives Considered

- Separate client/server repositories: rejected because atomic contract changes, unified review, and one release history are valuable.
- npm workspaces: viable, but pnpm is preferred for strict workspace dependency visibility and efficient deterministic installs.
- Nx/Turborepo: deferred because current project size does not justify extra configuration/caching machinery.
- A large shared package: rejected because it obscures ownership and can leak backend authority into the browser.

## Consequences

- One lockfile and consistent tooling simplify local work and CI.
- Workspace boundaries must be validated to prevent accidental imports.
- `packages/contracts` contains transport DTOs/syntax validation only, not persistence or authorization logic.
- A task orchestrator can be reconsidered when measured CI/build performance warrants it.

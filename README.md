# Onyx College Portal

Onyx College Portal is the production school information and academic management platform for Onyx College. It provides three role-aware experiences—Student Portal, Teacher Portal, and Admin Portal—backed by one shared system and database.

The product covers student onboarding and approval, historical academic enrollment, curriculum configuration, teacher assignments, read-only assignment delivery, announcements, results and report cards, promotions, documents, notifications, access control, and auditability.

## Repository status

Implementation has not started. This repository currently contains the authoritative product and domain documentation that must guide later architecture and implementation work.

There is currently:

- no initialized frontend or backend application;
- no package manifest or installed application dependencies;
- no database schema, API route, handler, or UI component; and
- no approved external visual design.

The eventual initial interface should be production-quality, but product rules, security, data integrity, historical correctness, and maintainable domain boundaries take priority over visual design.

## Documentation structure

- `docs/product/` defines product scope, portal behavior, user journeys, and role capabilities.
- `docs/domain/` defines canonical entities, academic structure, workflows, invariants, and authorization rules.
- `docs/architecture/` is reserved for approved system, backend, frontend, and security architecture decisions. It has not yet been populated.
- `docs/api/` is reserved for API conventions. It has not yet been populated.
- `assets/branding/` contains supplied brand assets.

Start with [the product specification](docs/product/product-spec.md), then read the relevant workflow and domain documents before proposing architecture or writing code. Repository-wide contributor constraints are in [AGENTS.md](AGENTS.md).

## V1 boundary

V1 excludes school fees and payments, attendance, timetables, a parent portal, CBT/examinations, student assignment submissions, chat or messaging, library management, and discipline management. These modules must not be added without an intentional product-specification change.

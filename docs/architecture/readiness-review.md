# Readiness review — 2026-10-07

This review addresses reproducible portal and security failures found before the first real users. It is not a certification that every documented V1 workflow or deployment has been validated.

## Changes

- Fixed direct login navigation to the authenticated portal and cleared private query caches when signing out or changing identity/authority.
- Fixed conflicting sidebar CSS that pushed mobile content below a full viewport and left a blank navigation column on tablets. Verified dashboard geometry and no horizontal overflow at 320, 390, 768, 1024, and 1440 pixels.
- Added mobile drawer focus containment, Escape dismissal, focus restoration, hidden offscreen navigation, and inactive background content.
- Corrected Graduated and Archived directory filters, made student directory rows readable on small screens, and added retryable failures across admin tables and student profile/dashboard loads.
- Required temporary-password changes before protected portal access. Marked API responses private/no-store and returned correct client errors for oversized/unsupported request bodies.
- Restricted request logging to method, path, status, and correlation metadata. Removed raw unexpected-error payloads from logs so database failures cannot leak credentials or private records.
- Rechecked active teacher assignments for existing results, corrections, assignment reads/writes, enrollments, curricula, and student directory/profile access. Revoked assignments and suspended teachers lose access; class-level assignments do not grant subject result-entry authority.
- Added an isolated Playwright browser suite and made it a CI release check. It exercises real API/database behavior, including admin registration approval followed by student login.

## Verification

Use Node 22.19.0 and pnpm 12.6.0, as pinned by the repository. Required checks are `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, and `pnpm build`. Integration and browser tests require Docker; browser tests also require Chromium.

The browser suite uses synthetic data in a disposable MongoDB replica set, an actual API process, and the built frontend. It covers Chromium; it does not establish Safari/Firefox compatibility, screen-reader usability, or performance under concurrent school traffic. Empty student sections are checked for successful loading; populated results and promotion workflows need additional end-to-end coverage.

Recorded results: 53 API unit tests, 19 frontend component tests, 24 MongoDB integration tests, and 7 Chromium journeys passed. Formatting, lint, type checking, and production builds passed. The frontend build retains the bundle-size warning described below.

## Remaining release work

1. Run the [production deployment runbook](production-deployment-runbook.md) against the intended staging providers: migrations/indexes, HTTPS, exact origins, proxy trust, cookie persistence/rotation, readiness, and production startup. No deployment was performed in this review.
2. Exercise Cloudinary upload, protected viewing, expiry, replacement, and deletion using staging credentials. The local adapter tests do not prove provider configuration. Review file inspection and malware handling for uploaded school documents.
3. Demonstrate a database backup restore and establish uptime/error monitoring with a responsible operator. Select hosting capacity and availability appropriate to school hours; free-tier behavior is not an uptime guarantee.
4. Add real-database/browser scenarios for populated teacher result entry through publication, published-result correction, and promotion rollback/concurrency. Existing policy/unit coverage is useful but does not replace these workflow checks.
5. Complete staff acceptance testing with realistic records, senior tracks, curriculum exceptions, document requirements, and enrollment history. Review keyboard/screen-reader behavior beyond the repaired navigation drawer and test target mobile browsers.
6. Measure load and frontend performance with realistic volumes. The current build still reports a JavaScript chunk over 500 kB; route-level loading and query pagination need a measured follow-up.

The application is more reliable after these fixes, but the remaining release checks should be completed before admitting real student data.

# Portal readiness evidence — 9 October 2026

This release adds an actionable student day view, permission-controlled weekly timetables, application review queues, report-session filtering, offline guidance, and protection for unsaved registration, classwork and result-entry drafts. It also fixes initial score entry when a result component has not yet been saved.

## Verification performed

Validation uses the pinned Node 22.19.0 and pnpm 12.6.0, synthetic identities, a disposable MongoDB 8 replica set, the real API and the production-built frontend.

- **60 API unit tests and 23 frontend component tests:** passed.
- **33 database integration tests:** passed, including timetable ownership/curriculum filtering, revoked authority, simultaneous revision saves, audit rollback, independently approved report publication/correction, preserved report revisions, promotion rollback and concurrent progression.
- **22 Chromium browser journeys:** passed, including populated schoolwork and timetables, registration approval, upload/authentication recovery, failed-save draft retention, reviewed publication, correction and report PDF download.
- **Accessibility:** automated WCAG 2 A/AA and 2.1 AA checks passed for sign-in, the daily student dashboard, timetable, assignments and a published report. Low-contrast text found by these checks was corrected. This is not a complete accessibility certification; keyboard and real-device/screen-reader acceptance remain in the pilot checklist.
- **Recovery rehearsal:** `mongodump`/`mongorestore` restored 34 collections into a separate disposable database. BSON documents and indexes matched; permanent-ID uniqueness, its sequence counter and enrollment relationships were checked. The run completed the dump/restore verification in approximately four seconds on the small synthetic fixture. This is not an Atlas recovery-time estimate.
- **Bounded read baseline:** 50 authenticated reads at concurrency five completed without errors; local p50 approximately 89 ms, p95 205 ms, maximum 244 ms. These measurements cover a small synthetic dataset, not school-scale capacity or public-network latency. Each browser run attaches its own measurements.
- **Readiness probe:** a controlled ready response succeeded; a controlled unavailable response exited nonzero. Response bodies and credentials are not logged.

Formatting, lint, TypeScript and production builds are release gates in CI. Browser tests build into the frontend output directory: run `pnpm build` separately after the browser suite, not concurrently with it.

## Deployment requirements

Deploy the API and web as a compatible pair. A frontend-only preview pointing at the previous API cannot test the new timetable endpoints. Run `pnpm db:indexes` and `pnpm access:sync` using the intended environment before staff test timetable management; custom roles need an explicit `timetable.manage` grant.

The timetable collection and index are additive. Existing enrollment history and published result snapshots are retained. The staging Blueprint, opt-in readiness workflow, recovery/rollback procedure and pilot materials are prepared in this repository.

## Checks still requiring the school or provider access

No live Render, Atlas or Cloudinary credentials were available in this development environment. A production deployment, provider snapshot restoration, provider upload/expiry check, alert-delivery confirmation and school pilot were **not** performed. The readiness workflow remains disabled until an operator configures the URL, enables it and confirms receipt of failures.

Follow [release rehearsal](release-rehearsal.md) and [pilot checklist](pilot-checklist.md). Record the school’s actual browser/device results, realistic-volume performance, recovery objectives, hosting capacity, upload-security policy, support contact and acceptance sign-off before admitting real student data.

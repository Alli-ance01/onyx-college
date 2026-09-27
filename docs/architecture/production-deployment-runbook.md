# Production Deployment Runbook

## Release boundary

The current release deploys the application foundation, authentication and access control, and the Student Onboarding vertical slice. It is suitable for a controlled staging deployment after the checks below. It is not the complete V1 school portal: teacher onboarding, full academics administration, subjects, assignments, announcements, results/report cards, notification delivery, and background workers are not implemented.

Do not admit real student documents until the credentialed Cloudinary smoke test, replica-set integration suite, backup configuration, and upload-security decision in this runbook are complete.

## Required topology

- Vercel hosts the static React application.
- Render hosts one long-running API web service. No worker is deployed.
- MongoDB Atlas provides a replica-set database.
- Cloudinary stores protected files as authenticated assets.
- Use sibling HTTPS origins, for example `portal.school.example` and `api.school.example`.

The sibling-domain requirement is important. Refresh cookies are `Secure`, HTTP-only, and `SameSite=Lax`. Unrelated `*.vercel.app` and `*.onrender.com` sites do not satisfy that same-site policy. If custom sibling domains are unavailable, implement and security-test a same-origin reverse proxy before launch; do not weaken the cookie policy ad hoc.

## 1. Verify the release locally

Use Node.js `22.19.0` and pnpm `12.6.0`:

```sh
corepack enable
corepack prepare pnpm@12.6.0 --activate
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

`pnpm test:integration` uses Testcontainers and therefore needs a running Docker-compatible container runtime. Docker is not needed by Vercel, Render, Atlas, Cloudinary, or the deployed application.

The checked-in GitHub Actions workflow repeats every gate on Node.js `22.19.0` and runs the Testcontainers suites on a hosted Linux runner. Render is configured with `autoDeployTrigger: checksPass`, so a failed CI run does not release the API.

Review `git status`, verify that no `.env` file or credential is tracked, and push only a commit for which the gates pass.

## 2. Prepare MongoDB Atlas

1. Create a dedicated production Atlas project and replica-set cluster in a region close to the selected Render region.
2. Enable automated backups, monitoring, and alerts appropriate for school records. Define retention and rehearse restoration before broad intake.
3. Create a unique application database user with a generated password and access only to the production application database.
4. Use a database name such as `onyx_college_portal`.
5. Obtain the `mongodb+srv://` application connection string and store it only as Render's `MONGODB_URI`.
6. After creating the Render service, copy its outbound CIDR ranges into the Atlas IP access list. Do not leave `0.0.0.0/0` as the production network policy.

Use a separate Atlas database and credentials for staging. Never copy production student data into staging casually.

## 3. Prepare Cloudinary

1. Create or select a production Cloudinary product environment that is separate from development/staging.
2. Record the cloud name, API key, and API secret.
3. Configure only the Render API with `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
4. Never add the API secret to Vercel, a `VITE_*` variable, GitHub, browser code, or committed files.

The adapter uploads protected student files with Cloudinary's `authenticated` delivery type. The API performs resource authorization before issuing a short-lived signed URL. Signed URLs are bearer credentials until expiry and must not be logged or cached.

## 4. Create the Render API service

Use the repository's `render.yaml` Blueprint. It defines one Starter Node web service in Frankfurt, pins Node.js `22.19.0`, installs pnpm `12.6.0`, builds the API and its workspace dependencies, starts the compiled Express server, and probes `/api/v1/health/ready`.

During Blueprint creation, provide the values marked `sync: false`:

- `WEB_ORIGIN=https://portal.school.example` with no trailing slash
- `MONGODB_URI=<Atlas connection string>`
- `CLOUDINARY_CLOUD_NAME=<production cloud name>`
- `CLOUDINARY_API_KEY=<production API key>`
- `CLOUDINARY_API_SECRET=<production API secret>`

Render generates and retains the access-token secret and refresh-token pepper. Do not rotate either during an ordinary deployment. The manifest also configures:

- `NODE_ENV=production`
- `TRUST_PROXY_HOPS=1`
- secure `SameSite=Lax` refresh cookies
- `DOCUMENT_STORAGE_DRIVER=cloudinary`
- a 5 MiB upload limit
- 120-second protected download links

Do not set `PORT`; Render supplies it. After the service exists, add its outbound ranges to Atlas, attach `api.school.example`, wait for TLS verification, and deploy.

Confirm:

```text
GET https://api.school.example/api/v1/health/live
GET https://api.school.example/api/v1/health/ready
```

Both must return successful API envelopes, and readiness must become unhealthy if the database is unavailable.

## 5. Run controlled database release operations

Production startup disables Mongoose automatic index creation. In the Render Shell, run the compiled, idempotent release commands before opening the portal to users:

```sh
node apps/api/dist/bootstrap/create-database-indexes.js
node apps/api/dist/bootstrap/sync-access-control.js
```

The index command creates all currently declared indexes and fails on incompatible existing data. It does not drop undeclared indexes. Index removal and data backfills require a separately reviewed migration.

Then create the first and only bootstrap SUPER_ADMIN from the interactive Render Shell:

```sh
node apps/api/dist/bootstrap/bootstrap-super-admin.js
```

Capture the generated temporary password only in the approved secure channel, sign in immediately, and complete the forced password change. Re-running the bootstrap must be refused.

## 6. Create the Vercel web project

1. Import the same GitHub repository into Vercel.
2. Keep the Vercel Root Directory at the repository root so workspace packages remain available.
3. Use the checked-in `vercel.json`. It installs the pinned pnpm version, builds `@onyx/web` and its dependencies, publishes `apps/web/dist`, and rewrites SPA routes to `index.html`.
4. Set `VITE_API_BASE_URL=https://api.school.example/api/v1` for Production.
5. Select Node.js `22.x` in Vercel project settings.
6. Attach `portal.school.example`, verify DNS/TLS, and redeploy after the environment value is set.

Vercel guarantees the selected Node major and may advance the minor/patch version. The delivered web application is static; the long-running production API remains exactly pinned to Node.js `22.19.0` on Render.

## 7. Configure the first academic context

After the SUPER_ADMIN password change:

1. verify the canonical permissions and protected role bundles;
2. create the initial active academic session and active term through the authorized academic setup flow;
3. confirm the persisted JSS1-JSS3 and SS1-SS3 class levels and Science, Arts, and Commercial tracks;
4. review the active registration configuration and document requirements before accepting applications.

Do not approve a registration until the authoritative academic placement exists.

## 8. Production smoke test

Use synthetic accounts and files:

1. refresh a deep link such as `/login` and an authenticated portal route;
2. sign in as SUPER_ADMIN, refresh the browser, and verify refresh-session continuity;
3. create a student account and confirm onboarding-only access;
4. save and resume a registration draft;
5. verify Nigerian State/LGA and senior-track validation;
6. upload JPEG, PNG, and PDF test files and reject invalid signature, type, and size cases;
7. confirm the Cloudinary assets are authenticated and direct unsigned access fails;
8. verify an authorized short-lived download works and expires;
9. verify a second student cannot read, replace, or remove another student's document;
10. submit, begin review, request changes, resubmit, and approve a registration;
11. confirm one permanent `ONYX/0001` identifier, Student, guardian links, medical profile where applicable, and initial Enrollment are created atomically;
12. verify the approved student's dashboard/profile and the Admin student directory;
13. restart the API and verify sessions, database readiness, and document access again;
14. inspect logs to ensure passwords, tokens, Cloudinary signatures, medical data, and document content are absent.

Run a credentialed Cloudinary replacement/removal test and verify MongoDB metadata and provider state remain consistent.

## 9. Go-live controls

Before real intake:

- complete the Docker-backed replica-set integration suite;
- complete a credentialed staging Cloudinary smoke test;
- decide and implement the approved malware-scanning/quarantine policy for untrusted PDFs before broad document intake;
- verify Atlas backups and perform a restore rehearsal;
- configure actionable uptime/error alerts and log retention;
- document secret rotation, session revocation, storage outage, and rollback procedures;
- keep Render on an always-on production plan;
- keep Render automatic deploys behind the successful GitHub CI check and protect the production branch from unchecked direct pushes.

Rollback the web and API only to versions compatible with the current database shape. Never roll back by deleting academic, registration, audit, or document history.

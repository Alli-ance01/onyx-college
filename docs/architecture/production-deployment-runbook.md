# Production Deployment Runbook

## Release boundary

The current release contains the documented V1 Student, Teacher, and Admin portal flows. It is suitable for a controlled production-shaped deployment after the checks below. No background worker, email channel, Web Push channel, or product module outside the documented V1 boundary is deployed.

Do not admit real student documents until the credentialed Cloudinary smoke test, replica-set integration suite, backup configuration, and upload-security decision in this runbook are complete.

## Required topology

- Vercel hosts the static React application.
- Render hosts one long-running API web service. No worker is deployed.
- MongoDB Atlas provides a replica-set database.
- Cloudinary stores protected files as authenticated assets.
- The configured web origin is the only credentialed CORS/CSRF origin.

The checked-in free-tier deployment supports a `*.vercel.app` frontend calling a `*.onrender.com` API. Refresh cookies are `Secure`, HTTP-only, and `SameSite=None`; the API still requires the exact configured `Origin`, credentialed CORS, and the session-bound CSRF token on refresh-session mutations. Some privacy modes block third-party cookies regardless of these settings. School-owned sibling domains such as `portal.school.example` and `api.school.example` remain the more reliable production topology and permit `SameSite=Lax`.

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

Use the repository's `render.yaml` Blueprint. It defines one Free Node web service in Frankfurt, pins Node.js `22.19.0`, installs pnpm `12.6.0`, builds the API and its workspace dependencies, starts the compiled Express server, and probes `/api/v1/health/ready`.

During Blueprint creation, provide the values marked `sync: false`:

- `WEB_ORIGIN=https://temporary.invalid` for the first deployment only; replace it with the exact Vercel production origin in step 6
- `MONGODB_URI=<Atlas connection string>`
- `CLOUDINARY_CLOUD_NAME=<production cloud name>`
- `CLOUDINARY_API_KEY=<production API key>`
- `CLOUDINARY_API_SECRET=<production API secret>`

Render generates and retains the access-token secret and refresh-token pepper. Do not rotate either during an ordinary deployment. The manifest also configures:

- `NODE_ENV=production`
- `TRUST_PROXY_HOPS=1`
- secure `SameSite=None` refresh cookies for the default Vercel/Render domains
- `DOCUMENT_STORAGE_DRIVER=cloudinary`
- a 5 MiB upload limit
- 120-second protected download links

Do not set `PORT`; Render supplies it. After the service exists, add its listed outbound addresses to the Atlas network access list and deploy. The Free service may sleep when idle, so the first request after inactivity can be slow.

Confirm:

```text
GET https://<render-service>.onrender.com/api/v1/health/live
GET https://<render-service>.onrender.com/api/v1/health/ready
```

Both must return successful API envelopes, and readiness must become unhealthy if the database is unavailable.

## 5. Run controlled database release operations

Production startup disables Mongoose automatic index creation. Render Free has no interactive shell, so run the idempotent release commands from a trusted local terminal directly against Atlas before opening the portal to users.

Temporarily allow the operator computer's current public IP in the Atlas network access list. Copy `apps/api/.env.example` to the gitignored `apps/api/.env`, then use:

```dotenv
NODE_ENV=development
MONGODB_URI=<production Atlas connection string>
WEB_ORIGIN=http://localhost:5173
AUTH_ACCESS_TOKEN_SECRET=<local random value of at least 32 characters>
AUTH_REFRESH_TOKEN_PEPPER=<different local random value of at least 32 characters>
DOCUMENT_STORAGE_DRIVER=local
```

The release commands only need the target database connection and their normal validated local configuration. The local authentication values above are not the Render runtime secrets.

```sh
pnpm db:indexes
pnpm access:sync
```

The index command creates all currently declared indexes and fails on incompatible existing data. It does not drop undeclared indexes. Index removal and data backfills require a separately reviewed migration.

Then create the first and only bootstrap SUPER_ADMIN from that interactive local terminal:

```sh
pnpm bootstrap:super-admin
```

Capture the generated temporary password only in the approved secure channel. Delete the local `apps/api/.env` when these operations are complete, remove the temporary operator IP from Atlas if it is no longer needed, sign in immediately, and complete the forced password change. Re-running the bootstrap must be refused.

## 6. Create the Vercel web project

1. Import the same GitHub repository into Vercel.
2. Keep the Vercel Root Directory at the repository root so workspace packages remain available.
3. Use the checked-in `vercel.json`. It installs the pinned pnpm version, builds `@onyx/web` and its dependencies, publishes `apps/web/dist`, and rewrites SPA routes to `index.html`.
4. Set `VITE_API_BASE_URL=https://<render-service>.onrender.com/api/v1` for Production.
5. Select Node.js `22.x` in Vercel project settings.
6. Deploy and copy the exact production origin, for example `https://onyx-college.vercel.app`.
7. Replace Render's temporary `WEB_ORIGIN` with that exact origin, without a trailing slash, and redeploy the API.

Vercel guarantees the selected Node major and may advance the minor/patch version. The delivered web application is static; the long-running production API remains exactly pinned to Node.js `22.19.0` on Render.

If school-owned sibling domains are attached later, update both environment values together and change `AUTH_COOKIE_SAME_SITE` to `lax`. Do not configure wildcard origins.

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
13. invite or create a teacher, complete setup and approval, assign a subject/class/session, and verify that unassigned academic resources remain inaccessible;
14. publish an assignment with a protected attachment and verify that only an eligible student can read and download it;
15. publish scoped and school-wide announcements and verify each role receives only the intended audience;
16. configure assessment and grading schemes, enter explicit SCORED/ABSENT/EXEMPT states, submit, review with a different user, approve, publish, and download the immutable student report-card PDF;
17. verify the published-result correction workflow produces a new report snapshot and preserves the superseded one;
18. exercise promotion/repeat/withdraw/transfer/graduate behavior with synthetic records and confirm enrollment history is never overwritten;
19. verify notification ownership, session revocation, permission changes, and medical-data restrictions;
20. restart the API and verify sessions, database readiness, and document access again;
21. inspect logs to ensure passwords, tokens, Cloudinary signatures, medical data, and document content are absent.

Run a credentialed Cloudinary replacement/removal test and verify MongoDB metadata and provider state remain consistent.

## 9. Go-live controls

Before real intake:

- complete the Docker-backed replica-set integration suite;
- complete a credentialed staging Cloudinary smoke test;
- decide and implement the approved malware-scanning/quarantine policy for untrusted PDFs before broad document intake;
- verify Atlas backups and perform a restore rehearsal;
- configure actionable uptime/error alerts and log retention;
- document secret rotation, session revocation, storage outage, and rollback procedures;
- treat Render Free as a pilot/low-traffic deployment with cold starts and no uptime guarantee; upgrade to an always-on production plan before the portal becomes operationally critical;
- keep Render automatic deploys behind the successful GitHub CI check and protect the production branch from unchecked direct pushes.

Rollback the web and API only to versions compatible with the current database shape. Never roll back by deleting academic, registration, audit, or document history.

# Staging, recovery and release rehearsal

Use this with the [deployment runbook](../architecture/production-deployment-runbook.md). This procedure is executable preparation; a passing local rehearsal does not establish that Atlas backups, provider alerts, or staging credentials are configured.

## Staging boundary

1. Deploy `render.staging.yaml` to a separate Render service. Auto-deploy is disabled so the API/frontend pair can be deliberately selected. Use a separate Atlas database/user, separate Cloudinary product environment, and freshly generated authentication secrets. Keep `NODE_ENV=production` to exercise production security.
2. Create a separate Vercel staging project with a stable hostname. Set its `VITE_API_BASE_URL` to the staging API `/api/v1`; set Render `WEB_ORIGIN` to that exact staging frontend origin. A changing PR preview hostname is not automatically a permitted origin. Do not widen credentialed CORS to all previews.
3. Keep the staging cookie name, audience and issuer from the staging manifest. Do not reuse a production cookie domain. Prefer school-owned sibling subdomains for reliable mobile cookie behavior; use the documented secure cross-site configuration only when provider hostnames are required.
4. Run database index creation and access-control synchronization from the pinned release, then bootstrap one privileged operator through the documented secure CLI. Existing customized roles need an explicit decision about the new `timetable.manage` permission.
5. Load synthetic identities through normal invitation and student application flows. The browser fixture (`apps/api/test/e2e/server.ts`) demonstrates these commands against a disposable database. It deliberately has no production database argument.
6. Verify readiness, password change, sign-in, refresh after reload, sign-out, registration/approval, timetable, classwork, results and correction using the pilot checklist. Upload a synthetic PNG/PDF through Cloudinary; check authorized viewing, signed-link expiry, replacement and denial from another account. Record commit IDs and evidence without retaining signed URLs.

## Database recovery rehearsal

Run `pnpm test:integration` with Docker. The recovery test in `teacher-resource-access.integration.test.ts` starts MongoDB 8, stores synthetic academic records, runs `mongodump`, then `mongorestore --nsFrom=onyx_teacher_resource_access.* --nsTo=onyx_recovery_rehearsal.*` inside that disposable container. It compares every BSON document and index, verifies enrollment references and the permanent-ID counter, and verifies that duplicate student IDs are still rejected. It never accepts a production URI, overwrites a live database, or uses `--drop`.

For the provider rehearsal, the school operator must:

- Configure Atlas scheduled snapshots and retention supported by the selected tier. Record the agreed recovery point (maximum acceptable lost work) and recovery time (maximum outage); proposed pilot targets are 24 hours and 4 hours until the school approves tighter targets.
- Restore a selected snapshot into a **new isolated cluster/database**, preserving the source. Record snapshot time, restore start/finish, region and provider job ID.
- Use restricted credentials to compare collection counts and unique indexes, verify a permanent Student ID with its enrollment history, published report revisions, and audit trail, and confirm the sequence counter cannot reuse an issued ID. Rehearse restoration of protected Cloudinary assets separately; a MongoDB backup does not contain uploaded file bytes.
- Point an isolated API/frontend pair at the restored database with outbound delivery disabled. Check representative reads and synthetic writes, then record sign-off. Never switch production traffic as part of a drill.
- Record the next rehearsal date and named owner. Retain evidence in restricted school operations storage, not in a public issue or repository.

## Readiness and incident response

`scripts/check-readiness.mjs` makes one read-only readiness request with a 15-second timeout. It checks the API envelope as well as HTTP status and prints no response body or credentials. Run it with `ONYX_HEALTH_URL` set to the exact HTTPS `/api/v1/health/ready` endpoint.

The `Portal readiness` GitHub workflow supports a manual run and an opt-in 15-minute schedule. Set repository variables `ONYX_HEALTH_URL` and `ONYX_MONITORING_ENABLED=true` only after the operator has subscribed to failed workflow notifications and proved receipt using a controlled failing check. A manual run fails clearly if no URL is configured. GitHub schedules are best-effort and can be delayed; this is a baseline check, not an uptime SLA or a replacement for a provider incident monitor.

A failed check requires the operator to inspect Render deploy/runtime health, Atlas connectivity and capacity, and the recent release. Readiness covers API/database availability; it does not prove login, file storage or every workflow. Track request-ID correlated 5xx errors and authentication/upload failures in restricted Render logs. Do not put student names, documents, cookies, tokens, or signed links in alerts. Record incident start/end, affected capability, reference IDs, mitigation and follow-up.

Before wider intake, select and configure the school’s alert recipient, log retention, provider error-alert thresholds, and an always-on hosting capacity appropriate to school hours. The free Render plan may sleep; a probe does not turn it into guaranteed availability.

## Release and rollback

1. Record the tested web commit, API commit, compatible database/index changes, backup job, and the prior working web/API pair. Pass format, lint, types, units, integration, browser tests and production build.
2. Deploy the API to staging, apply additive indexes/access catalogue changes, then deploy the matching frontend. Run the pilot smoke tasks. Deploy production only through the school’s release process after remaining provider checks pass.
3. If the release fails, pause new administrative writes where necessary and restore the **previous compatible API and frontend artifacts** using provider deploy history. Keep authentication secrets stable. Confirm readiness and sign-in/refresh, then verify an existing historical report and document.
4. Never undo a release by deleting enrollments, changing permanent IDs, editing published reports, or blindly restoring a database over accepted writes. Database restore is a separate incident decision with explicit reconciliation of work after the backup point.
5. For this release, the timetable collection/index and permission are additive. An older API can ignore the collection; roll the frontend back with it so users do not call missing timetable routes. Preserve schedule records and audits.

## Evidence record

For each rehearsal record: environment, release commit pair, operator, UTC start/end, task, expected outcome, actual outcome, pass/fail, request reference (if relevant), and follow-up owner. The local CI result is one evidence item. Provider restore, notification delivery, real-device acceptance, and real-user pilot results require their own evidence.

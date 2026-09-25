# Onyx College Portal — Security Architecture

## Security objectives

The system protects student identity, medical information, academic results, staff authority, credentials, and historical records. Security is enforced at the API and persistence boundaries. The browser is untrusted, identifiers are not credentials, and successful authentication does not imply authorization.

Security controls follow least privilege, deny-by-default access, explicit data classification, short-lived credentials, auditable privilege changes, and safe failure.

## Authentication model

### Login identifiers and passwords

V1 uses a unique normalized username/login name because student email is optional. Verified email or phone may be accepted as an additional login/recovery identifier when present. The login response is deliberately generic so it does not disclose whether an account exists, is unapproved, or is suspended.

Student ID may later be added as a login alias after approval. It remains only an identifier and never proves a role, permission, ownership, or academic scope.

Passwords are hashed with Argon2id using parameters benchmarked for the production runtime and periodically reviewed. Each password has a unique salt supplied by the library. A server-side pepper may be held in the secret store; rotating it requires an explicit migration strategy. Passwords are never logged, returned, or recoverable.

Minimum length and compromised/common-password screening are preferred to arbitrary composition rules. Password reset and administrator-issued temporary credentials force selection of a new password. Password changes revoke other refresh sessions by default.

### Access tokens

The API issues short-lived signed access tokens, initially approximately ten minutes. A token contains only stable security claims such as issuer, audience, subject user ID, session ID, token ID, issued-at, and expiry. Roles, permissions, lifecycle state, and academic assignments are loaded from authoritative storage or a deliberately short-lived server cache so revocations take effect promptly.

The SPA stores the access token in memory and sends it as `Authorization: Bearer`. It is not stored in localStorage, sessionStorage, IndexedDB, or a non-HttpOnly cookie. Tokens are signed with an asymmetric key where practical so verification keys can be separated from signing authority; keys have IDs and rotation support.

### Refresh sessions

Refresh credentials are opaque cryptographically random values. The browser receives the value only in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie scoped narrowly to the refresh/logout path and API host. MongoDB stores only a keyed hash of the token, never the bearer value.

Every refresh rotates the credential. AuthSession tracks token family, current hash, user, device label, creation/use timestamps, expiry, revocation, and reuse evidence. Reuse of an already rotated token revokes the whole family and creates a security audit event. Parallel browser refreshes are coordinated by the client; the server still handles races safely with a conditional update.

Users can view approximate active-device sessions and revoke one or all. Device labels and coarse activity metadata are informational, not authentication factors. Logout revokes the current session and clears the cookie; logout-all revokes every active family.

### CSRF and XSS interaction

Normal protected API requests use a memory-held bearer token, so ambient cookies do not authorize them. Refresh, logout, and session-bootstrap endpoints do use the refresh cookie and therefore require:

- an exact allowlisted `Origin`/`Referer` policy;
- Fetch Metadata checks where supported;
- a CSRF value bound to the session and supplied in a custom header;
- non-simple JSON requests and strict CORS behavior.

XSS could act through the current page even without reading an HttpOnly refresh token, so CSP, output escaping, dependency hygiene, and avoidance of unsafe HTML remain essential. The token design reduces persistence and exfiltration impact; it does not make XSS harmless.

## Account creation and recovery

### Students

Public student signup creates a limited account and registration context, not an approved Student. Rate limiting, duplicate detection, contact verification where configured, and state-aware authorization prevent access to the full portal until approval. Approval activates the student lifecycle through the documented transaction.

### Teachers

There is no public teacher signup. Invitation tokens are random, single-use, short-lived, stored hashed, bound to the intended invitation, and invalidated after acceptance or revocation. Administrator-created staff receive a time-limited temporary credential through a separate secure channel and must change it on first login. Teacher approval and academic assignments remain separate steps.

### Administrators and bootstrap

There is no public administrator signup. Authorized administrators create other administrators only with the required permission and constraints; ordinary roles cannot modify the protected SUPER_ADMIN role.

The first SUPER_ADMIN is created by a server-side one-time bootstrap command, never an HTTP endpoint. It executes transactionally, checks a durable bootstrap marker and existing protected administrator, assigns the exact SUPER_ADMIN role, and refuses ordinary repetition. A high-entropy temporary credential is displayed or delivered once, never logged or persisted in plaintext, and requires change on first login. Bootstrap invocation and outcome are audited without the credential. Exact CLI ergonomics are deferred to implementation.

### Password reset

Reset requests always return a generic response. Tokens are random, hashed at rest, single-use, purpose-bound, and short-lived. Reset completes with a conditional consume operation, revokes active sessions, and records an audit/security event. Where no verified recovery channel exists, an authorized, audited administrator-assisted recovery issues a temporary credential and forced-change state; staff never learn a permanent password.

## Brute-force and abuse controls

Authentication, signup, invitation acceptance, password reset, refresh, uploads, search, and expensive commands have endpoint-specific rate limits. Login uses combined IP, normalized identifier, and account-based progressive delays/temporary lockouts. Responses avoid account enumeration. Successful login does not erase security telemetry immediately.

Distributed limits may start with a MongoDB-backed or hosting-provider facility; an in-memory limiter alone is insufficient with multiple instances. Limits degrade safely if the shared limiter is unavailable. CAPTCHA is a possible targeted response to demonstrated public-signup abuse, not a default dependency.

## Authorization

Every protected use case evaluates an explicit policy composed from:

1. authenticated, non-revoked session;
2. active account and applicable student/teacher lifecycle;
3. effective permission when an administrative capability is required;
4. resource ownership for self-service actions;
5. active TeachingAssignment or ClassTeacherAssignment scope for teacher academic actions;
6. resource state, academic context, and separation-of-duties rules;
7. sensitivity/field-level policy for medical or other restricted data.

Default role bundles seed permissions but never replace resource checks. The SUPER_ADMIN permission set also remains subject to invariant, separation-of-duties, and security checks. Student self-service is ownership-based rather than an administrative permission bundle.

Named policies live near domain/application use cases and are reusable by HTTP commands, queries, and worker operations. Controllers must not contain scattered role comparisons. Data queries are scoped to the authorized subject set where possible, and each returned or mutated resource is still checked. This prevents insecure direct object reference attacks where changing an ID might expose another student's data.

Teacher policies resolve the requested session, subject, class level, track, and enrollment against active assignments. A global `results.enter` or `assignments.create` permission alone is insufficient. ClassTeacherAssignment grants only the documented broader class capabilities, not implicit subject authority.

## Network and HTTP controls

- HTTPS is mandatory in production; HTTP redirects at the edge and HSTS is enabled after domain validation.
- CORS allows exact known web origins only. It never reflects arbitrary origins or uses wildcard credentials.
- Helmet or equivalent supplies secure headers; CSP is tuned to the actual built assets and uses nonces/hashes where required.
- Request body, URL, header, and upload-intent sizes are bounded.
- Cookies use Secure, HttpOnly, narrow Path, an appropriate SameSite setting, and a host-only name where topology permits.
- Cache-Control forbids shared caching of authenticated or sensitive responses. Private signed URLs have short expiries.
- API versioning and content-type checks reject ambiguous input.

## XSS and content handling

React text rendering is used for user-provided content. Announcements, assignment instructions, remarks, and custom registration labels are plain text in V1 unless an explicitly sanitized structured format is later approved. Arbitrary HTML and scriptable URLs are rejected. CSP restricts scripts, frames, objects, base URI, and connections to required origins.

Errors and logs treat user content as data. CSV/spreadsheet exports added later must protect against formula injection.

## Input and database security

Zod schemas are strict allowlists for every boundary. The backend builds database queries from normalized approved fields; it never passes an arbitrary client object into MongoDB selectors, projections, updates, or sorts. Keys containing `$` or `.` and unexpected operators are rejected. Object IDs are syntax-checked before access but still require object-level authorization.

Updates specify allowed fields rather than spreading request bodies. Internal state, role, permissions, IDs, audit metadata, result totals, and ownership fields cannot be mass-assigned. Pagination, regex/search behavior, and aggregation complexity are bounded to resist denial of service and NoSQL injection.

## File-upload security

MongoDB stores file metadata only. The preferred R2 storage flow is:

1. An authorized client requests an upload intent with declared purpose, filename, size, and type.
2. The API validates requirement, scope, extension/type allowlist, and purpose-specific limit, creates a short-lived intent and quarantine key, then returns a presigned PUT URL.
3. The client uploads directly with the signed constraints.
4. The client completes the intent; the API/worker verifies object existence, exact size, checksum where supported, extension, declared MIME, and detected magic bytes.
5. Malware scanning completes before the object becomes downloadable or counts as a verified document.
6. The metadata transitions to available/rejected, and the temporary object is retained or purged according to policy.

Original filenames are display metadata after control-character removal; they are never object keys. Object keys use random IDs and fixed safe extensions. SVG, HTML, executable content, and archive formats are denied unless a future reviewed use case requires them. Limits vary by passport image, identity document, assignment attachment, and school asset and are configured server-side.

Private student documents and report PDFs remain in private buckets/prefixes. Each download request rechecks authorization and returns a very short-lived signed GET URL with safe content disposition. Signed URLs are bearer credentials and are never written to application logs. School logos may be public only after explicit classification.

Replacement creates a new object/version and metadata link; it never overwrites evidence silently. Deletion is delayed and auditable. A worker cleans expired upload intents, rejected quarantine objects, and database-unreferenced objects after a safety window. Object removal is idempotent.

## Sensitive data

Medical profiles, registration documents, result records, guardian contacts, and audit context are classified sensitive. `students.read_sensitive` and document-specific policies are enforced separately from ordinary student visibility. List responses omit sensitive fields; detailed projections expose only what the use case needs.

Do not log full names together with medical data, raw addresses, phone numbers, document contents, grades, password/reset/invitation data, or signed URLs. Analytics and monitoring receive pseudonymous IDs and safe event metadata. Production support access is permission-controlled and auditable.

## Logging, audit, and redaction

Structured logging uses an explicit redaction list covering authorization/cookie headers, passwords, tokens, credential hashes, secret configuration, signed URL query strings, document content, and sensitive form fields. Unknown request bodies are not logged. Production stack traces stay in restricted error monitoring, linked by request ID, never in API responses.

Audit diffs are allowlisted by action. Security-relevant audits include bootstrap, login anomalies, recovery, session revocation, account/role/permission changes, registration review, sensitive-data access where required, academic assignment changes, results transitions/corrections, uploads/review, context switches, and lifecycle changes. Audit storage is append-only at the application permission level and protected by database credentials that ordinary application operations cannot use to update existing entries.

## Secrets and production configuration

Secrets are injected by the deployment platform or managed secret store. Separate credentials are used for development, test, staging if introduced, and production. Database users follow least privilege; the runtime account cannot administer the cluster. Object-storage keys are scoped to required buckets/actions. Signing keys, refresh pepper, storage credentials, and monitoring keys have documented rotation procedures.

Startup validates environment, refuses unsafe production defaults, and checks that cookie, origin, issuer/audience, storage, and database settings are coherent. `.env` files with real values are not committed. Frontend environment values are public by definition and must contain no secrets.

## Dependency and supply-chain security

- Commit the workspace lockfile and use deterministic CI installs.
- Pin runtime versions and use currently supported Node.js LTS.
- Review direct dependencies for maintenance, license, and necessity.
- Run vulnerability and secret scanning in CI; triage findings rather than applying unsafe blind upgrades.
- Enable automated dependency update proposals with tests and review.
- Protect the main branch, require reviewed changes for security-sensitive modules, and minimize package lifecycle scripts.
- Generate build provenance/SBOM when deployment maturity justifies it.

## Security verification

Security acceptance includes authorization matrix tests, object-level access tests, teacher-scope negative cases, CSRF tests for cookie endpoints, token rotation/reuse tests, mass-assignment and operator-injection tests, rate-limit tests, upload type/size/malware-state tests, redaction checks, and dependency scanning. Critical production configuration is verified during release readiness.

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Cloudflare R2 presigned URL security](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
